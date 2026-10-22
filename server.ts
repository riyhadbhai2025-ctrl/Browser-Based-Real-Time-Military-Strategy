import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { createAdminRouter, sanitizeText } from './server/adminRoutes';
import { gameSimulation } from './server/simulation';
import { gameStore } from './server/store';
import { isCellPassable } from './src/game/pathfinder';
import { Alliance, ChatMessage, PlayerProfile, Unit } from './src/types/game';

dotenv.config();

export const app = express();
export const server = http.createServer(app);
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '512kb' }));

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

// Helper: find passable ground coordinates for a new player's home base away from existing bases
function findPassableBaseLocation(): { x: number; y: number } {
  const terrain = gameSimulation.getTerrain();
  const data = gameStore.getData();

  for (let attempt = 0; attempt < 80; attempt++) {
    const candidateX = Math.floor(Math.random() * 50 + 10);
    const candidateY = Math.floor(Math.random() * 48 + 12);

    if (!isCellPassable(terrain, candidateX, candidateY, 'ground')) continue;

    const tooClose = data.bases.some((b) => Math.hypot(b.x - candidateX, b.y - candidateY) < 9);
    if (!tooClose) {
      return { x: candidateX, y: candidateY };
    }
  }

  // Fallback scan if random attempts were crowded
  for (let y = 12; y < 62; y += 4) {
    for (let x = 10; x < 60; x += 4) {
      if (
        isCellPassable(terrain, x, y, 'ground') &&
        !data.bases.some((b) => Math.hypot(b.x - x, b.y - y) < 6)
      ) {
        return { x, y };
      }
    }
  }

  return { x: 22, y: 34 };
}

function findPassableUnitSpawn(cx: number, cy: number): { x: number; y: number } {
  const terrain = gameSimulation.getTerrain();
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
  const econ = gameStore.getEconomyConfig();
  const coords = findPassableBaseLocation();

  const newBase = {
    id: homeBaseId,
    name: `${username}'s Forward Redoubt`,
    type: 'home' as const,
    ownerId: userId,
    ownerName: username,
    allianceId: null,
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
  data.bases.push(newBase);

  const scoutPos = findPassableUnitSpawn(newBase.x + 2, newBase.y + 2);
  const infantryPos = findPassableUnitSpawn(newBase.x - 2, newBase.y + 2);

  const scoutDef = gameStore.getEffectiveUnitDef('vanguard_scout');
  const infantryDef = gameStore.getEffectiveUnitDef('rifle_infantry');

  const starterScout: Unit = {
    id: `unit_scout_${now}_${crypto.randomBytes(3).toString('hex')}`,
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

  // Explicitly enforce non-admin privileges on all newly registered or guest accounts
  const profile: PlayerProfile = {
    id: userId,
    username,
    email: email || `${username.toLowerCase()}@frontline.mil`,
    rank: 'Second Lieutenant',
    score: 100,
    level: 1,
    avatar: 'scout_operator',
    homeBaseId,
    totalBasesCaptured: 0,
    totalUnitsProduced: 2,
    totalUnitsDestroyed: 0,
    totalResourcesHarvested: 5000,
    joinedAt: now,
    lastLoginAt: now,
    beginnerProtectionUntil: now + 86400000 * 2,
    isAdmin: false,
    adminRole: null,
    status: 'active',
    suspendedUntil: null,
    banReason: null,
    moderationHistory: [],
  };

  const token = `token_${userId}_${crypto.randomBytes(16).toString('hex')}`;
  data.users[userId] = { passwordHash, profile };
  data.tokens[token] = userId;
  gameStore.saveData();

  io.to('authenticated_commanders').emit('world:sync', {
    units: data.units,
    bases: data.bases,
    timestamp: now,
  });

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

    // Enforce Ban & Suspension Checks on Login
    const access = gameStore.checkPlayerAccess(userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }

    const settings = gameStore.getSystemSettings();
    if (settings.maintenanceMode && !user.profile.isAdmin && !user.profile.adminRole) {
      return res.status(503).json({ error: 'Server is currently in Maintenance Mode.' });
    }

    user.profile.lastLoginAt = Date.now();
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

  // Also support active admin session tokens if issued via /api/admin/auth/login
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

  res.json({ profile: gameStore.sanitizeProfile(user.profile) });
});

// 4. World: Get Terrain, Catalog Overrides & Active Announcements
app.get('/api/world/terrain', (_req, res) => {
  const data = gameStore.getData();
  const worldCfg = gameSimulation.getWorldConfig();
  res.json({
    terrain: gameSimulation.getTerrain(),
    envObjects: data.envObjects || [],
    width: worldCfg.width,
    height: worldCfg.height,
    tileSize: worldCfg.tileSize,
    catalog: gameStore.getFullEffectiveCatalog(),
    announcements: data.announcements.filter(
      (a) => a.published && (!a.expiresAt || a.expiresAt > Date.now())
    ),
    settings: gameStore.getSystemSettings(),
  });
});

// Helper to reset skirmish world while preserving registered player home bases
function resetSkirmishWorld() {
  const data = gameStore.getData();
  const activeMap = data.maps.find((m) => m.isActiveMap) || data.maps[0];
  const generated = gameSimulation.regenerateWorldWithSeed(
    activeMap?.seed || 202610,
    activeMap?.width || 100,
    activeMap?.height || 75
  );
  const econ = gameStore.getEconomyConfig();

  generated.bases.forEach((b) => {
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

  data.bases = generated.bases;
  const now = Date.now();
  data.units = [
    {
      id: `unit_skirm_1_${now}`,
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

  // Re-create individual home bases and starter units for registered players with custom homeBaseIds
  for (const [uid, record] of Object.entries(data.users)) {
    const prof = record.profile;
    if (
      uid !== 'player_default' &&
      prof.homeBaseId &&
      prof.homeBaseId !== 'base_home_player' &&
      !data.bases.some((b) => b.id === prof.homeBaseId)
    ) {
      const coords = findPassableBaseLocation();
      const playerBase = {
        id: prof.homeBaseId,
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

      const uPos = findPassableUnitSpawn(playerBase.x + 2, playerBase.y + 2);
      const scoutDef = gameStore.getEffectiveUnitDef('vanguard_scout');
      data.units.push({
        id: `unit_skirm_${uid}_${now}`,
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

  gameStore.saveData();
  return data;
}

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

// Real-time Socket.IO Handlers (Strict Token Authentication — Never defaults to player_default)
io.on('connection', (socket) => {
  let authenticatedUserId: string | null = resolveUserIdFromToken(socket.handshake.auth?.token);
  socketInstances.set(socket.id, socket);

  if (authenticatedUserId) {
    const access = gameStore.checkPlayerAccess(authenticatedUserId);
    if (access.allowed) {
      onlineSockets.set(socket.id, authenticatedUserId);
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

  // Join world with token authentication
  socket.on('world:join', (payload?: { token?: string }) => {
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

    socket.emit('world:state', {
      bases: state.bases,
      units: state.units,
      alliances: state.alliances,
      envObjects: state.envObjects || [],
      chat: state.chat.slice(-50),
      notifications: state.notifications
        .filter((n) => n.userId === authenticatedUserId || n.userId === 'all')
        .slice(-20),
      timestamp: Date.now(),
    });
  });

  // Guard helper for all gameplay actions
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

  // Unit command (strictly scoped to authenticatedUserId's units)
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

  // Base construction / upgrade (strictly scoped to authenticatedUserId's bases)
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
  socket.on('world:reset_skirmish', (_payload: any, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    const freshData = resetSkirmishWorld();
    io.to('authenticated_commanders').emit('world:state', {
      bases: freshData.bases,
      units: freshData.units,
      alliances: freshData.alliances,
      envObjects: freshData.envObjects || [],
      chat: freshData.chat.slice(-50),
      notifications: [],
      timestamp: Date.now(),
    });
    if (callback) callback({ success: true });
  });

  // Unit production (strictly scoped to authenticatedUserId's bases)
  socket.on('base:produce_unit', (payload: { baseId: string; unitType: any }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) {
      if (callback) callback({ success: false, message: 'Authentication required or action blocked' });
      return;
    }
    const result = gameSimulation.produceUnit(uid, payload.baseId, payload.unitType);
    if (callback) callback(result);
  });

  // Base Repair (strictly scoped to authenticatedUserId's bases)
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
      io.to('authenticated_commanders').emit('world:sync', { units: data.units, bases: data.bases, timestamp: Date.now() });
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

  // Alliance operations
  socket.on('alliance:create', (payload: { name: string; tag: string; description: string }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    if (!gameStore.getSystemSettings().alliancesEnabled) {
      if (callback) callback({ success: false, message: 'Alliances are currently disabled' });
      return;
    }
    const data = gameStore.getData();
    const userProfile = data.users[uid]?.profile;
    if (!userProfile) return;

    const newAlliance: Alliance = {
      id: `alli_${Date.now()}`,
      name: sanitizeText(payload.name, 32),
      tag: sanitizeText(payload.tag, 5).toUpperCase(),
      description: sanitizeText(payload.description, 200),
      leaderId: uid,
      leaderName: userProfile.username,
      memberIds: [uid],
      bannerColor: '#3b82f6',
      createdTime: Date.now(),
      score: userProfile.score,
      territoryBasesCount: 1,
    };

    data.alliances.push(newAlliance);
    userProfile.allianceId = newAlliance.id;
    userProfile.allianceRole = 'leader';

    data.bases.forEach((b) => {
      if (b.ownerId === uid) b.allianceId = newAlliance.id;
    });

    gameStore.saveData();
    io.to('authenticated_commanders').emit('alliance:update', newAlliance);
    if (callback) callback({ success: true, alliance: newAlliance });
  });

  socket.on('alliance:join', (payload: { allianceId: string }, callback?: Function) => {
    const uid = canPerformGameplayAction();
    if (!uid) return;
    const data = gameStore.getData();
    const alliance = data.alliances.find((a) => a.id === payload.allianceId);
    const userProfile = data.users[uid]?.profile;

    if (alliance && userProfile) {
      if (!alliance.memberIds.includes(uid)) {
        alliance.memberIds.push(uid);
      }
      userProfile.allianceId = alliance.id;
      userProfile.allianceRole = 'member';

      data.bases.forEach((b) => {
        if (b.ownerId === uid) b.allianceId = alliance.id;
      });

      gameStore.saveData();
      io.to('authenticated_commanders').emit('alliance:update', alliance);
      if (callback) callback({ success: true });
    }
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

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
  });
}
