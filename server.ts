import bcrypt from 'bcryptjs';
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

// REST API Endpoints
// 1. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const settings = gameStore.getSystemSettings();
    if (!settings.allowNewRegistrations) {
      return res.status(403).json({ error: 'New commander registrations are currently disabled by High Command.' });
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

    const salt = await bcrypt.genSalt(8);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const homeBaseId = `base_home_${userId}`;
    const now = Date.now();
    const econ = gameStore.getEconomyConfig();

    const newBase = {
      id: homeBaseId,
      name: `${username}'s Forward Redoubt`,
      type: 'home' as const,
      ownerId: userId,
      ownerName: username,
      allianceId: null,
      x: Math.floor(Math.random() * 30 + 10),
      y: Math.floor(Math.random() * 30 + 15),
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
        { id: `b_vf_${userId}`, type: 'vehicle_factory' as const, level: 2, health: 900, maxHealth: 900 },
        { id: `b_vt_${userId}`, type: 'vulcan_turret' as const, level: 2, health: 450, maxHealth: 450 },
      ],
    };
    data.bases.push(newBase);

    const starterUnit: Unit = {
      id: `unit_${Date.now()}_${userId}`,
      type: 'vanguard_scout',
      ownerId: userId,
      ownerName: username,
      x: newBase.x + 2,
      y: newBase.y + 2,
      rotation: 0,
      health: 280,
      maxHealth: 280,
      command: 'idle',
      path: [],
      lastAttackTime: 0,
      kills: 0,
      homeBaseId,
    };
    data.units.push(starterUnit);

    const profile: PlayerProfile = {
      id: userId,
      username,
      email: email || `${username}@frontline.mil`,
      rank: 'Second Lieutenant',
      score: 100,
      level: 1,
      avatar: 'scout_operator',
      homeBaseId,
      totalBasesCaptured: 0,
      totalUnitsProduced: 1,
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

    const token = `token_${userId}_${Math.random().toString(36).substring(2, 9)}`;
    data.users[userId] = { passwordHash, profile };
    data.tokens[token] = userId;
    gameStore.saveData();

    res.json({ token, profile: gameStore.sanitizeProfile(profile) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
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

    user.profile.lastLoginAt = Date.now();
    const token = `token_${userId}_${Math.random().toString(36).substring(2, 9)}`;
    data.tokens[token] = userId;
    if (user.profile.adminRole || user.profile.isAdmin) {
      gameStore.createAdminSession(userId, req.socket?.remoteAddress || '127.0.0.1');
    }
    gameStore.saveData();

    res.json({ token, profile: gameStore.sanitizeProfile(user.profile) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// 3. Auth: Current Profile
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
  const data = gameStore.getData();
  const userId = (token && data.tokens[token]) || 'player_default';

  const user = data.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
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

// Helper to reset skirmish world
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

  gameStore.saveData();
  return data;
}

// Real-time Socket.IO Handlers
io.on('connection', (socket) => {
  let authenticatedUserId = 'player_default';
  socketInstances.set(socket.id, socket);
  onlineSockets.set(socket.id, authenticatedUserId);

  socket.on('disconnect', () => {
    onlineSockets.delete(socket.id);
    socketInstances.delete(socket.id);
  });

  // Join world
  socket.on('world:join', (payload: { token?: string }) => {
    const state = gameStore.getData();
    if (payload?.token && state.tokens[payload.token]) {
      authenticatedUserId = state.tokens[payload.token];
    }

    const access = gameStore.checkPlayerAccess(authenticatedUserId);
    if (!access.allowed) {
      socket.emit('account:moderated', { reason: access.reason });
      socket.disconnect(true);
      return;
    }

    onlineSockets.set(socket.id, authenticatedUserId);

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

  // Guard helper for gameplay actions
  const canPerformGameplayAction = (): boolean => {
    const access = gameStore.checkPlayerAccess(authenticatedUserId);
    if (!access.allowed) {
      socket.emit('account:moderated', { reason: access.reason });
      socket.disconnect(true);
      return false;
    }
    if (gameStore.getSystemSettings().maintenanceMode) {
      return false;
    }
    return true;
  };

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
      if (!canPerformGameplayAction()) return;
      gameSimulation.commandUnits(
        authenticatedUserId,
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
      if (!canPerformGameplayAction()) {
        if (callback) callback({ success: false, message: 'Action blocked' });
        return;
      }
      const result = gameSimulation.buildOrUpgrade(
        authenticatedUserId,
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
    if (!canPerformGameplayAction()) return;
    if (payload?.difficulty && ['easy', 'medium', 'hard'].includes(payload.difficulty)) {
      gameSimulation.setAiDifficulty(payload.difficulty);
      if (callback) callback({ success: true, difficulty: payload.difficulty });
    }
  });

  // Reset Skirmish World
  socket.on('world:reset_skirmish', (_payload: any, callback?: Function) => {
    if (!canPerformGameplayAction()) return;
    const freshData = resetSkirmishWorld();
    io.emit('world:state', {
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

  // Unit production
  socket.on('base:produce_unit', (payload: { baseId: string; unitType: any }, callback?: Function) => {
    if (!canPerformGameplayAction()) {
      if (callback) callback({ success: false, message: 'Action blocked' });
      return;
    }
    const result = gameSimulation.produceUnit(authenticatedUserId, payload.baseId, payload.unitType);
    if (callback) callback(result);
  });

  // Base Repair
  socket.on('base:repair', (payload: { baseId: string }, callback?: Function) => {
    if (!canPerformGameplayAction()) return;
    const data = gameStore.getData();
    const base = data.bases.find((b) => b.id === payload.baseId && b.ownerId === authenticatedUserId);
    if (!base) {
      if (callback) callback({ success: false, message: 'Base not found' });
      return;
    }
    const cost = 200;
    if (base.resources.concrete >= cost && base.resources.steel >= cost) {
      base.resources.concrete -= cost;
      base.resources.steel -= cost;
      base.health = Math.min(base.maxHealth, base.health + 800);
      base.defenseShield = Math.min(base.maxShield, base.defenseShield + 400);
      io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: Date.now() });
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, message: 'Insufficient repair materials' });
    }
  });

  // Chat message
  socket.on(
    'chat:send',
    (payload: { content: string; channel?: 'global' | 'alliance'; coords?: { x: number; y: number } }) => {
      if (!canPerformGameplayAction()) return;
      const cleanContent = sanitizeText(payload?.content, 300);
      if (!cleanContent) return;

      const data = gameStore.getData();
      const userProfile = data.users[authenticatedUserId]?.profile;
      const senderName = userProfile?.username || 'Commander';
      const alliance = data.alliances.find((a) => a.id === userProfile?.allianceId);

      const newMsg: ChatMessage = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        senderId: authenticatedUserId,
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

      io.emit('chat:message', newMsg);
    }
  );

  // Alliance operations
  socket.on('alliance:create', (payload: { name: string; tag: string; description: string }, callback?: Function) => {
    if (!canPerformGameplayAction()) return;
    if (!gameStore.getSystemSettings().alliancesEnabled) {
      if (callback) callback({ success: false, message: 'Alliances are currently disabled' });
      return;
    }
    const data = gameStore.getData();
    const userProfile = data.users[authenticatedUserId]?.profile;
    if (!userProfile) return;

    const newAlliance: Alliance = {
      id: `alli_${Date.now()}`,
      name: sanitizeText(payload.name, 32),
      tag: sanitizeText(payload.tag, 5).toUpperCase(),
      description: sanitizeText(payload.description, 200),
      leaderId: authenticatedUserId,
      leaderName: userProfile.username,
      memberIds: [authenticatedUserId],
      bannerColor: '#3b82f6',
      createdTime: Date.now(),
      score: userProfile.score,
      territoryBasesCount: 1,
    };

    data.alliances.push(newAlliance);
    userProfile.allianceId = newAlliance.id;
    userProfile.allianceRole = 'leader';

    data.bases.forEach((b) => {
      if (b.ownerId === authenticatedUserId) b.allianceId = newAlliance.id;
    });

    gameStore.saveData();
    io.emit('alliance:update', newAlliance);
    if (callback) callback({ success: true, alliance: newAlliance });
  });

  socket.on('alliance:join', (payload: { allianceId: string }, callback?: Function) => {
    if (!canPerformGameplayAction()) return;
    const data = gameStore.getData();
    const alliance = data.alliances.find((a) => a.id === payload.allianceId);
    const userProfile = data.users[authenticatedUserId]?.profile;

    if (alliance && userProfile) {
      if (!alliance.memberIds.includes(authenticatedUserId)) {
        alliance.memberIds.push(authenticatedUserId);
      }
      userProfile.allianceId = alliance.id;
      userProfile.allianceRole = 'member';

      data.bases.forEach((b) => {
        if (b.ownerId === authenticatedUserId) b.allianceId = alliance.id;
      });

      gameStore.saveData();
      io.emit('alliance:update', alliance);
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
