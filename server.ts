import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { createAdminRouter, sanitizeText } from './server/adminRoutes';
import { gameSimulation } from './server/simulation';
import { gameStore } from './server/store';
import { isCellPassable } from './src/game/pathfinder';
import { AllianceRecruitmentMode, AllianceRole, ChatMessage, PlayerProfile, Unit } from './src/types/game';

dotenv.config();

export const app = express();
export const server = http.createServer(app);
const port = 3000;

app.use(express.json({ limit: '1024kb' }));

// Initialize Socket.IO with CORS allowance and heartbeat
export const io = new SocketIOServer(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

gameSimulation.setSocketServer(io);

// Track active Socket.IO connections: socket.id -> userId
export const onlineSockets = new Map<string, string>();
const socketInstances = new Map<string, Socket>();

export function disconnectUserSockets(userId: string, reason: string): number {
  let count = 0;
  for (const [sockId, uid] of onlineSockets.entries()) {
    if (uid === userId) {
      const sock = socketInstances.get(sockId);
      if (sock) {
        sock.emit('account:moderated', { reason });
        sock.disconnect(true);
        count += 1;
      }
      onlineSockets.delete(sockId);
      socketInstances.delete(sockId);
    }
  }
  return count;
}

// Mount Complete Secure Admin API Router (/api/admin/*)
app.use('/api/admin', createAdminRouter(io, onlineSockets, disconnectUserSockets));

function resolveUserIdFromToken(rawToken: unknown): string | null {
  if (typeof rawToken !== 'string') return null;
  const token = rawToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const state = gameStore.getData();
  const userId = state.tokens[token];
  if (userId && state.users[userId]) {
    return userId;
  }

  const adminSession = gameStore.getValidAdminSession(token);
  if (adminSession && state.users[adminSession.userId]) {
    return adminSession.userId;
  }

  return null;
}

function getAuthenticatedPlayerId(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Bearer token missing or malformed.' });
    return null;
  }
  const userId = resolveUserIdFromToken(authHeader);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return null;
  }
  const access = gameStore.checkPlayerAccess(userId);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason });
    return null;
  }
  return userId;
}

// Helper: find passable ground coordinates for a new base using atomic reservation
function findPassableBaseLocation(mapId = 'map_riverfront_assault'): { x: number; y: number } {
  const spawnRes = gameStore.findAndReserveBaseSpawnLocation(mapId, null, 4);
  if (spawnRes.success) {
    gameStore.releaseSpawnReservation(spawnRes.reservationId);
    return { x: spawnRes.x, y: spawnRes.y };
  }
  throw new Error(spawnRes.reason || 'No passable spawn location available on sector');
}

function findPassableUnitSpawn(cx: number, cy: number, mapId = 'map_riverfront_assault'): { x: number; y: number } {
  const terrain = gameSimulation.getTerrain(mapId);
  if (isCellPassable(terrain, Math.round(cx), Math.round(cy), 'ground')) {
    return { x: Math.round(cx), y: Math.round(cy) };
  }
  for (let r = 1; r <= 6; r++) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const tx = Math.round(cx + Math.cos(ang) * r);
      const ty = Math.round(cy + Math.sin(ang) * r);
      if (isCellPassable(terrain, tx, ty, 'ground')) {
        return { x: tx, y: ty };
      }
    }
  }
  return { x: Math.round(cx), y: Math.round(cy) };
}

// Helper: Provision a brand-new non-privileged player account with home base, resources, and starter units
async function provisionNewPlayerAccount(username: string, rawPassword: string, email?: string) {
  const data = gameStore.getData();
  const salt = await bcrypt.genSalt(8);
  const passwordHash = await bcrypt.hash(rawPassword, salt);
  const now = Date.now();
  const userId = `user_${now}_${crypto.randomBytes(4).toString('hex')}`;
  const homeBaseId = `base_home_${userId}`;
  const defaultMapId = 'map_riverfront_assault';
  const econ = gameStore.getEconomyConfig();

  // Atomically find & reserve base spawn location across maps based on capacity
  const spawnRes = gameStore.findAndReserveBaseSpawnLocation(defaultMapId, null, 4);
  if (!spawnRes.success) {
    throw new Error(spawnRes.reason);
  }

  const assignedMapId = spawnRes.mapId;
  const newBase = {
    id: homeBaseId,
    mapId: assignedMapId,
    name: `${username}'s Forward Redoubt`,
    type: 'home' as const,
    ownerId: userId,
    ownerName: username,
    allianceId: null,
    x: spawnRes.x,
    y: spawnRes.y,
    radius: 4,
    health: 3500,
    maxHealth: 3500,
    defenseShield: 1200,
    maxShield: 1200,
    captureProgress: 0,
    isProtected: true,
    isHomeBase: true,
    lifecycleState: 'protected' as const,
    resources: { ...econ.startingResources },
    storageCap: { ...econ.baseStorageCap },
    productionRates: { ...econ.baseGenerationRates },
    lastResourceUpdate: now,
    constructionQueue: [],
    productionQueue: [],
    buildings: [
      { id: `b_cc_${userId}`, type: 'command_center' as const, level: 2, health: 1200, maxHealth: 1200 },
      { id: `b_cw_${userId}`, type: 'concrete_works' as const, level: 2, health: 600, maxHealth: 600 },
      { id: `b_sf_${userId}`, type: 'steel_foundry' as const, level: 2, health: 650, maxHealth: 650 },
      { id: `b_as_${userId}`, type: 'aluminum_smelter' as const, level: 2, health: 500, maxHealth: 500 },
      { id: `b_fr_${userId}`, type: 'fuel_refinery' as const, level: 2, health: 550, maxHealth: 550 },
      { id: `b_br_${userId}`, type: 'barracks' as const, level: 1, health: 600, maxHealth: 600 },
      { id: `b_vf_${userId}`, type: 'vehicle_factory' as const, level: 2, health: 900, maxHealth: 900 },
      { id: `b_vt_${userId}`, type: 'vulcan_turret' as const, level: 2, health: 450, maxHealth: 450 },
    ],
  };
  gameStore.releaseSpawnReservation(spawnRes.reservationId);
  data.bases.push(newBase);

  const scoutPos = findPassableUnitSpawn(newBase.x + 2, newBase.y + 2, assignedMapId);
  const infantryPos = findPassableUnitSpawn(newBase.x - 2, newBase.y + 2, assignedMapId);

  const scoutDef = gameStore.getEffectiveUnitDef('vanguard_scout');
  const infantryDef = gameStore.getEffectiveUnitDef('rifle_infantry');

  const starterScout: Unit = {
    id: `unit_scout_${now}_${crypto.randomBytes(3).toString('hex')}`,
    mapId: assignedMapId,
    type: 'vanguard_scout',
    ownerId: userId,
    ownerName: username,
    x: scoutPos.x,
    y: scoutPos.y,
    rotation: 0,
    health: scoutDef.maxHealth,
    maxHealth: scoutDef.maxHealth,
    command: 'idle',
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId,
  };

  const starterInfantry: Unit = {
    id: `unit_inf_${now}_${crypto.randomBytes(3).toString('hex')}`,
    mapId: assignedMapId,
    type: 'rifle_infantry',
    ownerId: userId,
    ownerName: username,
    x: infantryPos.x,
    y: infantryPos.y,
    rotation: 0,
    health: infantryDef.maxHealth,
    maxHealth: infantryDef.maxHealth,
    command: 'idle',
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId,
  };

  data.units.push(starterScout, starterInfantry);

  const beginnerDurationMs = (econ.homeBaseProtectionDurationHours || 48) * 3600000;
  const profile: PlayerProfile = {
    id: userId,
    username,
    email: email || `${username.toLowerCase()}@frontline.mil`,
    rank: 'Second Lieutenant',
    score: 100,
    level: 1,
    avatar: 'scout_operator',
    homeBaseId,
    homeMapId: assignedMapId,
    currentMapId: assignedMapId,
    totalBasesCaptured: 0,
    totalUnitsProduced: 2,
    totalUnitsDestroyed: 0,
    totalResourcesHarvested: 5000,
    highwayTransfersCompleted: 0,
    claimedRewardIds: [],
    joinedAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
    beginnerProtectionUntil: now + beginnerDurationMs,
    isAdmin: false,
    adminRole: null,
    status: 'active',
    suspendedUntil: null,
    banReason: null,
    moderationHistory: [],
    weeklyCapturesCount: 0,
    weeklyCaptureTimestamps: [],
    homeBaseDestroyedCount: 0,
    isInactiveRelocated: false,
  };

  const token = `token_${userId}_${crypto.randomBytes(16).toString('hex')}`;
  data.users[userId] = { passwordHash, profile };
  data.tokens[token] = userId;
  gameStore.persistUser(userId);
  gameStore.persistBaseAndUnits(newBase, [starterScout, starterInfantry]);
  gameStore.saveData();

  gameSimulation.broadcastWorldSync(now);

  return { token, profile: gameStore.sanitizeProfile(profile) };
}

// REST API Endpoints
// 1. Auth: Register New Player
app.post('/api/auth/register', async (req, res) => {
  try {
    const settings = gameStore.getSystemSettings();
    if (!settings.allowNewRegistrations) {
      return res.status(403).json({ error: 'New commander registrations are currently disabled by High Command.' });
    }
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'Server is currently in Maintenance Mode. Please try again shortly.' });
    }

    const username = sanitizeText(req.body?.username, 32);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const email = sanitizeText(req.body?.email, 80);

    if (!username || username.length < 3 || !password || password.length < 4) {
      return res.status(400).json({ error: 'Username (min 3 chars) and password (min 4 chars) required' });
    }

    const data = gameStore.getData();
    const existing = Object.values(data.users).find(
      (u) => u.profile.username.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const provisioned = await provisionNewPlayerAccount(username, password, email);
    res.json(provisioned);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// 1b. Auth: Non-Privileged Guest / Quick Deploy
app.post('/api/auth/guest', async (_req, res) => {
  try {
    const settings = gameStore.getSystemSettings();
    if (!settings.allowNewRegistrations) {
      return res.status(403).json({ error: 'Guest deployment is disabled while new registrations are locked.' });
    }
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'Server is currently in Maintenance Mode.' });
    }

    const data = gameStore.getData();
    let guestUsername = `Recruit_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    while (
      Object.values(data.users).some((u) => u.profile.username.toLowerCase() === guestUsername.toLowerCase())
    ) {
      guestUsername = `Recruit_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    const randomPassword = crypto.randomBytes(16).toString('hex');
    const provisioned = await provisionNewPlayerAccount(
      guestUsername,
      randomPassword,
      `${guestUsername.toLowerCase()}@guest.frontline.mil`
    );

    res.json(provisioned);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Guest deployment failed' });
  }
});

// 2. Auth: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = sanitizeText(req.body?.username, 64);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const data = gameStore.getData();

    const entry = Object.entries(data.users).find(
      ([, u]) => u.profile.username.toLowerCase() === (username || '').toLowerCase()
    );

    if (!entry) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const [userId, user] = entry;
    let isValid = false;
    if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$')) {
      isValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      isValid = user.passwordHash === password;
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const access = gameStore.checkPlayerAccess(userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }

    const settings = gameStore.getSystemSettings();
    if (settings.maintenanceMode && !user.profile.isAdmin && !user.profile.adminRole) {
      return res.status(503).json({ error: 'Server is currently in Maintenance Mode.' });
    }

    const now = Date.now();
    user.profile.lastLoginAt = now;
    user.profile.lastActiveAt = now;
    gameStore.recoverInactivePlayerBaseIfNeeded(userId, now);

    const token = `token_${userId}_${crypto.randomBytes(16).toString('hex')}`;
    data.tokens[token] = userId;
    gameStore.saveData();

    res.json({ token, profile: gameStore.sanitizeProfile(user.profile) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// 2b. Auth: Logout / Revoke Session Token
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    gameStore.revokeToken(token);
  }
  res.json({ success: true });
});

// 2c. Auth: Account Password Recovery
app.post('/api/auth/recover', (req, res) => {
  const username = sanitizeText(req.body?.username, 64);
  const email = sanitizeText(req.body?.email, 100);
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const result = gameStore.recoverAccountPassword(username, email, newPassword);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// 3. Auth: Current Profile (Strict Token Verification — Never falls back to player_default)
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Bearer token missing or malformed.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Empty Bearer token.' });
  }

  const data = gameStore.getData();
  let userId = data.tokens[token];

  if (!userId && data.adminSessions[token]) {
    const adminSession = gameStore.getValidAdminSession(token);
    if (adminSession) {
      userId = adminSession.userId;
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }

  const user = data.users[userId];
  if (!user) {
    gameStore.revokeToken(token);
    return res.status(401).json({ error: 'Authenticated account no longer exists.' });
  }

  const access = gameStore.checkPlayerAccess(userId);
  if (!access.allowed) {
    return res.status(403).json({ error: access.reason });
  }

  const now = Date.now();
  user.profile.lastActiveAt = now;
  gameStore.recoverInactivePlayerBaseIfNeeded(userId, now);

  res.json({ profile: gameStore.sanitizeProfile(user.profile) });
});

// 4. World: Get Terrain, Multi-Map Sector Info, Highway Exits, Catalog Overrides & Active Announcements
app.get('/api/world/terrain', (req, res) => {
  const data = gameStore.getData();
  const requestedMapId = sanitizeText(req.query.mapId, 64) || 'map_riverfront_assault';
  const mapCfg = gameStore.getMapConfig(requestedMapId);
  const worldCfg = gameSimulation.getWorldConfig(mapCfg.id);

  res.json({
    mapId: mapCfg.id,
    activeMap: mapCfg,
    maps: data.maps.filter((m) => m.enabled),
    highwayExits: mapCfg.highwayExits || [],
    terrain: gameSimulation.getTerrain(mapCfg.id),
    envObjects: gameStore.getMapEnvObjects(mapCfg.id),
    width: worldCfg.width,
    height: worldCfg.height,
    tileSize: worldCfg.tileSize,
    catalog: gameStore.getFullEffectiveCatalog(),
    economyConfig: gameStore.getEconomyConfig(),
    announcements: data.announcements.filter(
      (a) => a.published && (!a.expiresAt || a.expiresAt > Date.now())
    ),
    settings: gameStore.getSystemSettings(),
  });
});

// 4b. World: Highway Transfer REST Endpoint
app.post('/api/world/transfer-units', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;

  const unitIds = Array.isArray(req.body?.unitIds) ? req.body.unitIds.map((id: any) => String(id)) : [];
  const targetMapId = sanitizeText(req.body?.targetMapId, 64);

  const result = gameSimulation.transferUnitsAcrossHighway(userId, unitIds, targetMapId);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// 5. Full Alliance Management REST Endpoints (Phase 5)
app.get('/api/alliances/:id/members', (req, res) => {
  const data = gameStore.getData();
  const allianceId = sanitizeText(req.params.id, 64);
  const alliance = data.alliances.find((a) => a.id === allianceId);
  if (!alliance) {
    return res.status(404).json({ error: 'Alliance not found' });
  }

  const onlineSet = new Set(onlineSockets.values());
  const members = alliance.memberIds.map((uid) => {
    const prof = data.users[uid]?.profile;
    return {
      userId: uid,
      username: prof?.username || uid,
      rank: prof?.rank || 'Commander',
      level: prof?.level || 1,
      score: prof?.score || 0,
      role: alliance.memberRoles?.[uid] || (alliance.leaderId === uid ? 'leader' : 'member'),
      isOnline: onlineSet.has(uid),
      basesCount: data.bases.filter((b) => b.ownerId === uid).length,
    };
  });

  res.json({ alliance, members });
});

app.post('/api/alliances/create', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.createAlliance(
    userId,
    sanitizeText(req.body?.name, 32),
    sanitizeText(req.body?.tag, 5),
    sanitizeText(req.body?.description, 200),
    sanitizeText(req.body?.bannerColor, 20) || '#2563eb',
    (sanitizeText(req.body?.recruitmentMode, 20) as AllianceRecruitmentMode) || 'open'
  );
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  gameSimulation.broadcastWorldSync();
  res.json(result);
});

app.post('/api/alliances/join', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.joinOrRequestAlliance(
    userId,
    sanitizeText(req.body?.allianceId, 64),
    sanitizeText(req.body?.message, 140)
  );
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  gameSimulation.broadcastWorldSync();
  res.json(result);
});

app.post('/api/alliances/leave', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.leaveAlliance(userId);
  if (!result.success) return res.status(400).json({ error: result.message });
  gameSimulation.broadcastWorldSync();
  res.json(result);
});

app.post('/api/alliances/invite', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.invitePlayerToAlliance(userId, sanitizeText(req.body?.targetUsernameOrId, 64));
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  res.json(result);
});

app.post('/api/alliances/respond-request', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.respondToJoinRequest(
    userId,
    sanitizeText(req.body?.applicantUserId, 64),
    Boolean(req.body?.approve)
  );
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  gameSimulation.broadcastWorldSync();
  res.json(result);
});

app.post('/api/alliances/kick', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.kickAllianceMember(userId, sanitizeText(req.body?.targetUserId, 64));
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  gameSimulation.broadcastWorldSync();
  res.json(result);
});

app.post('/api/alliances/set-role', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const role = sanitizeText(req.body?.role, 20) as AllianceRole;
  if (!['leader', 'co_leader', 'officer', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid alliance role' });
  }
  const result = gameStore.setAllianceMemberRole(userId, sanitizeText(req.body?.targetUserId, 64), role);
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  res.json(result);
});

app.post('/api/alliances/transfer-leadership', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.transferAllianceLeadership(userId, sanitizeText(req.body?.newLeaderUserId, 64));
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  res.json(result);
});

app.post('/api/alliances/settings', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const result = gameStore.updateAllianceSettings(userId, {
    description: req.body?.description !== undefined ? sanitizeText(req.body.description, 240) : undefined,
    recruitmentMode: req.body?.recruitmentMode
      ? (sanitizeText(req.body.recruitmentMode, 20) as AllianceRecruitmentMode)
      : undefined,
    bannerColor: req.body?.bannerColor ? sanitizeText(req.body.bannerColor, 20) : undefined,
  });
  if (!result.success) return res.status(400).json({ error: result.message });
  io.to('authenticated_commanders').emit('alliance:update', result.alliance);
  res.json(result);
});

// 6. Player Progression, Leaderboard, Battle Reports & Support (Phase 7)
app.get('/api/progression/leaderboard', (_req, res) => {
  res.json(gameStore.getLeaderboard());
});

app.get('/api/progression/status', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const status = gameStore.getPlayerProgressionStatus(userId);
  const profile = gameStore.sanitizeProfile(gameStore.getData().users[userId].profile);
  res.json({
    profile,
    ...status,
  });
});

app.post('/api/progression/claim-reward', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const rewardId = sanitizeText(req.body?.rewardId, 64);
  const result = gameStore.claimReward(userId, rewardId);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  gameSimulation.broadcastWorldSync();
  res.json(result);
});

app.post('/api/support/ticket', (req, res) => {
  const userId = getAuthenticatedPlayerId(req, res);
  if (!userId) return;
  const cat = (sanitizeText(req.body?.category, 32) || 'general') as any;
  const subject = sanitizeText(req.body?.subject, 120);
  const message = sanitizeText(req.body?.message, 600);
  const result = gameStore.submitSupportTicket(userId, cat, subject, message);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Helper to reset skirmish world on a map while preserving other sectors and registered player home bases
function resetSkirmishWorld(targetMapId = 'map_riverfront_assault') {
  const data = gameStore.getData();
  const activeMap = data.maps.find((m) => m.id === targetMapId) || data.maps[0];
  const mapId = activeMap?.id || 'map_riverfront_assault';
  const generated = gameSimulation.regenerateWorldWithSeed(
    activeMap?.seed || 202610,
    activeMap?.width || 100,
    activeMap?.height || 75,
    mapId
  );
  const econ = gameStore.getEconomyConfig();

  generated.bases.forEach((b) => {
    b.mapId = mapId;
    b.resources = { ...econ.startingResources };
    b.storageCap = { ...econ.baseStorageCap };
  });

  const homeBase = generated.bases[0];
  if (homeBase) {
    homeBase.ownerId = 'player_default';
    homeBase.ownerName = data.users['player_default']?.profile.username || 'Commander';
    homeBase.name = 'Fortress Alpha (HQ)';
    homeBase.allianceId = 'alliance_vanguard';
  }
  const forwardBase = generated.bases[3];
  if (forwardBase && homeBase) {
    forwardBase.ownerId = 'player_default';
    forwardBase.ownerName = homeBase.ownerName;
    forwardBase.allianceId = 'alliance_vanguard';
  }
  const enemyBase = generated.bases[1];
  if (enemyBase) {
    enemyBase.ownerId = 'enemy_insurgent';
    enemyBase.ownerName = 'Kodiak PMC';
    enemyBase.name = 'Kodiak Stronghold';
  }
  const enemyOutpost = generated.bases[4];
  if (enemyOutpost) {
    enemyOutpost.ownerId = 'enemy_insurgent';
    enemyOutpost.ownerName = 'Kodiak PMC';
  }

  // Replace only bases and units on targetMapId, preserving other maps!
  data.bases = [
    ...data.bases.filter((b) => (b.mapId || 'map_riverfront_assault') !== mapId),
    ...generated.bases,
  ];
  const now = Date.now();
  const freshMapUnits: Unit[] = [
    {
      id: `unit_skirm_1_${now}`,
      mapId,
      type: 'rifle_infantry',
      ownerId: 'player_default',
      ownerName: homeBase?.ownerName || 'Commander',
      allianceId: 'alliance_vanguard',
      x: (homeBase?.x || 16) + 2,
      y: (homeBase?.y || 28) + 1,
      rotation: 0,
      health: gameStore.getEffectiveUnitDef('rifle_infantry').maxHealth,
      maxHealth: gameStore.getEffectiveUnitDef('rifle_infantry').maxHealth,
      command: 'idle',
      path: [],
      lastAttackTime: 0,
      kills: 0,
      homeBaseId: homeBase?.id || 'base_0',
    },
    {
      id: `unit_skirm_2_${now}`,
      mapId,
      type: 'titan_mbt',
      ownerId: 'player_default',
      ownerName: homeBase?.ownerName || 'Commander',
      allianceId: 'alliance_vanguard',
      x: (homeBase?.x || 16) + 2,
      y: (homeBase?.y || 28) + 3,
      rotation: 0,
      health: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
      maxHealth: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
      command: 'idle',
      path: [],
      lastAttackTime: 0,
      kills: 0,
      homeBaseId: homeBase?.id || 'base_0',
    },
    {
      id: `unit_skirm_3_${now}`,
      mapId,
      type: 'dominator_conquest',
      ownerId: 'player_default',
      ownerName: homeBase?.ownerName || 'Commander',
      allianceId: 'alliance_vanguard',
      x: (homeBase?.x || 16) - 2,
      y: (homeBase?.y || 28) - 2,
      rotation: 0,
      health: gameStore.getEffectiveUnitDef('dominator_conquest').maxHealth,
      maxHealth: gameStore.getEffectiveUnitDef('dominator_conquest').maxHealth,
      command: 'idle',
      path: [],
      lastAttackTime: 0,
      kills: 0,
      homeBaseId: homeBase?.id || 'base_0',
    },
    {
      id: `unit_skirm_e1_${now}`,
      mapId,
      type: 'titan_mbt',
      ownerId: 'enemy_insurgent',
      ownerName: 'Kodiak PMC',
      x: (enemyBase?.x || 70) - 3,
      y: (enemyBase?.y || 20) + 1,
      rotation: 3.14,
      health: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
      maxHealth: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
      command: 'hold',
      path: [],
      lastAttackTime: 0,
      kills: 0,
      homeBaseId: enemyBase?.id || 'base_1',
    },
    {
      id: `unit_skirm_e2_${now}`,
      mapId,
      type: 'cobra_gunship',
      ownerId: 'enemy_insurgent',
      ownerName: 'Kodiak PMC',
      x: (enemyBase?.x || 70) + 2,
      y: (enemyBase?.y || 20) + 2,
      rotation: 2.5,
      health: gameStore.getEffectiveUnitDef('cobra_gunship').maxHealth,
      maxHealth: gameStore.getEffectiveUnitDef('cobra_gunship').maxHealth,
      command: 'hold',
      path: [],
      lastAttackTime: 0,
      kills: 0,
      homeBaseId: enemyBase?.id || 'base_1',
    },
  ];

  data.units = [
    ...data.units.filter((u) => (u.mapId || 'map_riverfront_assault') !== mapId),
    ...freshMapUnits,
  ];

  // Re-create individual home bases and starter units for registered players on map_riverfront_assault
  if (mapId === 'map_riverfront_assault') {
    for (const [uid, record] of Object.entries(data.users)) {
      const prof = record.profile;
      if (
        uid !== 'player_default' &&
        prof.homeBaseId &&
        prof.homeBaseId !== 'base_home_player' &&
        !data.bases.some((b) => b.id === prof.homeBaseId)
      ) {
        const coords = findPassableBaseLocation(mapId);
        const playerBase = {
          id: prof.homeBaseId,
          mapId,
          name: `${prof.username}'s Forward Redoubt`,
          type: 'home' as const,
          ownerId: uid,
          ownerName: prof.username,
          allianceId: prof.allianceId || null,
          x: coords.x,
          y: coords.y,
          radius: 4,
          health: 3500,
          maxHealth: 3500,
          defenseShield: 1200,
          maxShield: 1200,
          captureProgress: 0,
          isProtected: true,
          resources: { ...econ.startingResources },
          storageCap: { ...econ.baseStorageCap },
          productionRates: { ...econ.baseGenerationRates },
          lastResourceUpdate: now,
          constructionQueue: [],
          productionQueue: [],
          buildings: [
            { id: `b_cc_${uid}`, type: 'command_center' as const, level: 2, health: 1200, maxHealth: 1200 },
            { id: `b_cw_${uid}`, type: 'concrete_works' as const, level: 2, health: 600, maxHealth: 600 },
            { id: `b_sf_${uid}`, type: 'steel_foundry' as const, level: 2, health: 650, maxHealth: 650 },
            { id: `b_as_${uid}`, type: 'aluminum_smelter' as const, level: 2, health: 500, maxHealth: 500 },
            { id: `b_fr_${uid}`, type: 'fuel_refinery' as const, level: 2, health: 550, maxHealth: 550 },
            { id: `b_vf_${uid}`, type: 'vehicle_factory' as const, level: 2, health: 900, maxHealth: 900 },
            { id: `b_vt_${uid}`, type: 'vulcan_turret' as const, level: 2, health: 450, maxHealth: 450 },
          ],
        };
        data.bases.push(playerBase);

        const uPos = findPassableUnitSpawn(playerBase.x + 2, playerBase.y + 2, mapId);
        const scoutDef = gameStore.getEffectiveUnitDef('vanguard_scout');
        data.units.push({
          id: `unit_skirm_${uid}_${now}`,
          mapId,
          type: 'vanguard_scout',
          ownerId: uid,
          ownerName: prof.username,
          allianceId: prof.allianceId || null,
          x: uPos.x,
          y: uPos.y,
          rotation: 0,
          health: scoutDef.maxHealth,
          maxHealth: scoutDef.maxHealth,
          command: 'idle',
          path: [],
          lastAttackTime: 0,
          kills: 0,
          homeBaseId: playerBase.id,
        });
      }
    }
  }

  gameStore.saveData();
  return data;
}

// Real-time Socket.IO Handlers (Strict Token Authentication + Server-Enforced Fog of War)
io.on('connection', (socket) => {
  let authenticatedUserId: string | null = resolveUserIdFromToken(socket.handshake.auth?.token);
  socketInstances.set(socket.id, socket);

  if (authenticatedUserId) {
    const access = gameStore.checkPlayerAccess(authenticatedUserId);
    if (access.allowed) {
      onlineSockets.set(socket.id, authenticatedUserId);
      const userMapId =
        gameStore.getData().users[authenticatedUserId]?.profile.currentMapId || 'map_riverfront_assault';
      (socket.data as any).userId = authenticatedUserId;
      (socket.data as any).mapId = userMapId;
      socket.join('authenticated_commanders');
    } else {
      authenticatedUserId = null;
    }
  }

  socket.on('disconnect', () => {
    onlineSockets.delete(socket.id);
    socketInstances.delete(socket.id);
    socket.leave('authenticated_commanders');
  });

  // Join world with token authentication & optional mapId
  socket.on('world:join', (payload?: { token?: string; mapId?: string }) => {
    const state = gameStore.getData();
    const resolvedId = resolveUserIdFromToken(payload?.token ?? socket.handshake.auth?.token);

    if (!resolvedId) {
      authenticatedUserId = null;
      onlineSockets.delete(socket.id);
      socket.leave('authenticated_commanders');
      socket.emit('auth:error', { status: 401, message: 'Authentication required to join tactical command.' });
      return;
    }

    const access = gameStore.checkPlayerAccess(resolvedId);
    if (!access.allowed) {
      authenticatedUserId = null;
      onlineSockets.delete(socket.id);
      socket.leave('authenticated_commanders');
      socket.emit('account:moderated', { reason: access.reason });
      socket.disconnect(true);
      return;
    }

    authenticatedUserId = resolvedId;
    onlineSockets.set(socket.id, authenticatedUserId);
    socket.join('authenticated_commanders');

    const userProf = state.users[authenticatedUserId]?.profile;
    const requestedMapId = payload?.mapId || userProf?.currentMapId || 'map_riverfront_assault';
    if (userProf) {
      userProf.currentMapId = requestedMapId;
    }
    (socket.data as any).userId = authenticatedUserId;
    (socket.data as any).mapId = requestedMapId;

    const visible = gameSimulation.getVisibleWorldState(
      authenticatedUserId,
      requestedMapId,
      Array.from(new Set(onlineSockets.values()))
    );

    socket.emit('world:state', {
      ...visible,
      maps: state.maps.filter((m) => m.enabled),
      chat: state.chat.slice(-50),
      notifications: state.notifications
        .filter((n) => n.userId === authenticatedUserId || n.userId === 'all')
        .slice(-20),
    });
  });

  // Switch active sector map
  socket.on('world:switch_map', (payload: { mapId: string }, callback?: Function) => {
    if (!authenticatedUserId) {
      if (callback) callback({ success: false, message: 'Authentication required' });
      return;
    }
    const state = gameStore.getData();
    const targetMap = state.maps.find((m) => m.id === payload?.mapId && m.enabled);
    if (!targetMap) {
      if (callback) callback({ success: false, message: 'Sector map not found or offline' });
      return;
    }

    const userProf = state.users[authenticatedUserId]?.profile;
    if (userProf) {
      userProf.currentMapId = targetMap.id;
    }
    (socket.data as any).mapId = targetMap.id;

    const visible = gameSimulation.getVisibleWorldState(
      authenticatedUserId,
      targetMap.id,
      Array.from(new Set(onlineSockets.values()))
    );
    const terrain = gameSimulation.getTerrain(targetMap.id);

    socket.emit('world:state', {
      ...visible,
      terrain,
      activeMap: targetMap,
      maps: state.maps.filter((m) => m.enabled),
      chat: state.chat.slice(-50),
      notifications: state.notifications
        .filter((n) => n.userId === authenticatedUserId || n.userId === 'all')
        .slice(-20),
    });

    if (callback) {
      callback({
        success: true,
        mapId: targetMap.id,
        activeMap: targetMap,
        terrain,
        ...visible,
      });
    }
  });

  const canPerformGameplayAction = (): string | null => {
    if (!authenticatedUserId) {
      socket.emit('auth:error', { status: 401, message: 'Authentication required to issue commands.' });
      return null;
    }
    const access = gameStore.checkPlayerAccess(authenticatedUserId);
    if (!access.allowed) {
      socket.emit('account:moderated', { reason: access.reason });
      socket.disconnect(true);
      return null;
    }
    if (gameStore.getSystemSettings().maintenanceMode) {
      return null;
    }
    return authenticatedUserId;
  };

  // Highway unit transfer socket handler
  socket.on('unit:transfer_map', (payload: { unitIds: string[]; targetMapId: string }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) {
      if (callback) callback({ success: false, message: 'Authentication required' });
      return;
    }
    const result = gameSimulation.transferUnitsAcrossHighway(
      uid,
      Array.isArray(payload?.unitIds) ? payload.unitIds : [],
      sanitizeText(payload?.targetMapId, 64)
    );
    if (callback) callback(result);
  });

  // Unit command
  socket.on(
    'unit:command',
    (payload: {
      unitIds: string[];
      command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop';
      targetX?: number;
      targetY?: number;
      targetUnitId?: string;
      targetBaseId?: string;
    }) => {
      const uid = canPerformGameplayAction();
      if (!uid || !payload || !Array.isArray(payload.unitIds)) return;
      gameSimulation.commandUnits(
        uid,
        payload.unitIds,
        payload.command,
        payload.targetX,
        payload.targetY,
        payload.targetUnitId,
        payload.targetBaseId
      );
    }
  );

  // Base construction / upgrade
  socket.on(
    'base:build',
    (
      payload: { baseId: string; buildingType: any; offsetX?: number; offsetY?: number },
      callback?: Function
    ) => {
      const uid = canPerformGameplayAction();
      if (!uid) {
        if (callback) callback({ success: false, message: 'Authentication required or action blocked' });
        return;
      }
      const result = gameSimulation.buildOrUpgrade(
        uid,
        payload.baseId,
        payload.buildingType,
        payload.offsetX,
        payload.offsetY
      );
      if (callback) callback(result);
    }
  );

  // AI Difficulty control
  socket.on('ai:difficulty', (payload: { difficulty: 'easy' | 'medium' | 'hard' }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    if (payload?.difficulty && ['easy', 'medium', 'hard'].includes(payload.difficulty)) {
      gameSimulation.setAiDifficulty(payload.difficulty);
      if (callback) callback({ success: true, difficulty: payload.difficulty });
    }
  });

  // Reset Skirmish World
  socket.on('world:reset_skirmish', (payload: any, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    const mapId = payload?.mapId || (socket.data as any)?.mapId || 'map_riverfront_assault';
    resetSkirmishWorld(mapId);
    gameSimulation.broadcastWorldSync();
    if (callback) callback({ success: true });
  });

  // Unit production
  socket.on('base:produce_unit', (payload: { baseId: string; unitType: any }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) {
      if (callback) callback({ success: false, message: 'Authentication required or action blocked' });
      return;
    }
    const result = gameSimulation.produceUnit(uid, payload.baseId, payload.unitType);
    if (callback) callback(result);
  });

  // Base Repair
  socket.on('base:repair', (payload: { baseId: string }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    const data = gameStore.getData();
    const base = data.bases.find((b) => b.id === payload.baseId && b.ownerId === uid);
    if (!base) {
      if (callback) callback({ success: false, message: 'Base not found or unauthorized' });
      return;
    }
    const cost = 200;
    if (base.resources.concrete >= cost && base.resources.steel >= cost) {
      base.resources.concrete -= cost;
      base.resources.steel -= cost;
      base.health = Math.min(base.maxHealth, base.health + 800);
      base.defenseShield = Math.min(base.maxShield, base.defenseShield + 400);
      for (const bld of base.buildings) {
        bld.health = bld.maxHealth;
      }
      gameStore.persistBaseAndUnits(base, []);
      gameSimulation.broadcastWorldSync();
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, message: 'Insufficient repair materials' });
    }
  });

  // Chat message
  socket.on(
    'chat:send',
    (payload: { content: string; channel?: 'global' | 'alliance'; coords?: { x: number; y: number } }) => {
      const uid = canPerformGameplayAction();
      if (!uid) return;
      const cleanContent = sanitizeText(payload?.content, 300);
      if (!cleanContent) return;

      const data = gameStore.getData();
      const userProfile = data.users[uid]?.profile;
      if (!userProfile) return;
      const senderName = userProfile.username;
      const alliance = data.alliances.find((a) => a.id === userProfile.allianceId);

      const newMsg: ChatMessage = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        mapId: userProfile.currentMapId || 'map_riverfront_assault',
        senderId: uid,
        senderName,
        allianceTag: alliance?.tag || null,
        channel: payload.channel || 'global',
        allianceId: alliance?.id || null,
        content: cleanContent,
        coords: payload.coords,
        timestamp: Date.now(),
      };

      data.chat.push(newMsg);
      if (data.chat.length > 200) data.chat.shift();

      io.to('authenticated_commanders').emit('chat:message', newMsg);
    }
  );

  // Alliance Socket handlers (delegating to GameStore Phase 5 methods)
  socket.on(
    'alliance:create',
    (
      payload: {
        name: string;
        tag: string;
        description: string;
        bannerColor?: string;
        recruitmentMode?: AllianceRecruitmentMode;
      },
      callback?: Function
    ) => {
      const uid = canPerformGameplayAction();
      if (!uid) return;
      const res = gameStore.createAlliance(
        uid,
        sanitizeText(payload?.name, 32),
        sanitizeText(payload?.tag, 5),
        sanitizeText(payload?.description, 200),
        sanitizeText(payload?.bannerColor, 20) || '#3b82f6',
        payload?.recruitmentMode || 'open'
      );
      if (res.success && res.alliance) {
        io.to('authenticated_commanders').emit('alliance:update', res.alliance);
        gameSimulation.broadcastWorldSync();
      }
      if (callback) callback(res);
    }
  );

  socket.on('alliance:join', (payload: { allianceId: string; message?: string }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    const res = gameStore.joinOrRequestAlliance(
      uid,
      sanitizeText(payload?.allianceId, 64),
      sanitizeText(payload?.message, 140)
    );
    if (res.success && res.alliance) {
      io.to('authenticated_commanders').emit('alliance:update', res.alliance);
      gameSimulation.broadcastWorldSync();
    }
    if (callback) callback(res);
  });

  socket.on('alliance:leave', (_payload: any, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    const res = gameStore.leaveAlliance(uid);
    if (res.success) {
      gameSimulation.broadcastWorldSync();
    }
    if (callback) callback(res);
  });
});

// Mount Vite or static server when run directly
async function startServer() {
  gameSimulation.start();
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Server] Frontline Dominion RTS running on http://0.0.0.0:${port}`);
  });
}

const isTestRun =
  process.env.NODE_ENV === 'test' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  process.argv.some((arg) => arg.includes('.test.'));

if (!isTestRun) {
  startServer().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
  });
}
