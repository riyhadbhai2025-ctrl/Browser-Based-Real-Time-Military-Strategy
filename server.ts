import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { gameSimulation } from './server/simulation';
import { gameStore } from './server/store';
import { Alliance, ChatMessage, GameNotification, PlayerProfile, Unit } from './src/types/game';

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = 3000;

app.use(express.json());

// Initialize Socket.IO with CORS allowance and heartbeat
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

gameSimulation.setSocketServer(io);
gameSimulation.start();

// In-memory active session tokens
const sessionTokens = new Map<string, string>(); // token -> userId

// REST API Endpoints
// 1. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const data = gameStore.getData();
    // Check if user exists
    const existing = Object.values(data.users).find(
      (u) => u.profile.username.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Create a new Home Base for this player on an open spot on the map
    const homeBaseId = `base_home_${userId}`;
    const now = Date.now();
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
      resources: { concrete: 3500, steel: 3000, aluminum: 1800, fuel: 2200 },
      storageCap: { concrete: 15000, steel: 12000, aluminum: 8000, fuel: 10000 },
      productionRates: { concrete: 10, steel: 8, aluminum: 5, fuel: 7 },
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

    // Starter units for new player
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
    };

    data.users[userId] = { passwordHash, profile };
    gameStore.saveData();

    const token = `token_${userId}_${Math.random().toString(36).substring(2, 9)}`;
    sessionTokens.set(token, userId);

    res.json({ token, profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// 2. Auth: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const data = gameStore.getData();

    const entry = Object.entries(data.users).find(
      ([, u]) => u.profile.username.toLowerCase() === (username || '').toLowerCase()
    );

    if (!entry) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const [userId, user] = entry;
    // Check password
    let isValid = false;
    if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$')) {
      isValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      isValid = user.passwordHash === password;
    }

    // Allow default commander login for convenience during testing
    if (username === 'Commander' && (password === 'admin123' || password === 'admin' || password === '')) {
      isValid = true;
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    user.profile.lastLoginAt = Date.now();
    gameStore.saveData();

    const token = `token_${userId}_${Math.random().toString(36).substring(2, 9)}`;
    sessionTokens.set(token, userId);

    res.json({ token, profile: user.profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// 3. Auth: Current Profile
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace('Bearer ', '') : '';
  const userId = sessionTokens.get(token) || 'player_default';

  const data = gameStore.getData();
  const user = data.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ profile: user.profile });
});

// 4. World: Get Terrain
app.get('/api/world/terrain', (_req, res) => {
  res.json({
    terrain: gameSimulation.getTerrain(),
    width: 100,
    height: 75,
    tileSize: 40,
  });
});

// 5. Admin Actions
app.post('/api/admin/spawn_unit', (req, res) => {
  const { unitType, x, y, ownerId } = req.body;
  const data = gameStore.getData();
  const newUnit: Unit = {
    id: `unit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: unitType || 'titan_mbt',
    ownerId: ownerId || 'player_default',
    ownerName: ownerId === 'enemy_insurgent' ? 'Kodiak PMC' : 'Commander',
    x: x ?? 20,
    y: y ?? 28,
    rotation: 0,
    health: 1100,
    maxHealth: 1100,
    command: 'idle',
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId: 'base_alpha_home',
  };
  data.units.push(newUnit);
  io.emit('unit:spawn', newUnit);
  res.json({ success: true, unit: newUnit });
});

app.post('/api/admin/boost_resources', (req, res) => {
  const { baseId, amount } = req.body;
  const data = gameStore.getData();
  const base = data.bases.find((b) => b.id === (baseId || 'base_alpha_home'));
  if (base) {
    const add = amount || 5000;
    base.resources.concrete += add;
    base.resources.steel += add;
    base.resources.aluminum += add;
    base.resources.fuel += add;
    io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: Date.now() });
    res.json({ success: true, resources: base.resources });
  } else {
    res.status(404).json({ error: 'Base not found' });
  }
});

// Real-time Socket.IO Handlers
io.on('connection', (socket) => {
  let authenticatedUserId: string = 'player_default';

  // Join world
  socket.on('world:join', (data: { token?: string }) => {
    if (data?.token && sessionTokens.has(data.token)) {
      authenticatedUserId = sessionTokens.get(data.token)!;
    }

    const state = gameStore.getData();
    socket.emit('world:state', {
      bases: state.bases,
      units: state.units,
      alliances: state.alliances,
      chat: state.chat.slice(-50),
      notifications: state.notifications.filter((n) => n.userId === authenticatedUserId).slice(-20),
      timestamp: Date.now(),
    });
  });

  // Unit command
  socket.on('unit:command', (payload: {
    unitIds: string[];
    command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat';
    targetX?: number;
    targetY?: number;
    targetUnitId?: string;
    targetBaseId?: string;
  }) => {
    gameSimulation.commandUnits(
      authenticatedUserId,
      payload.unitIds,
      payload.command,
      payload.targetX,
      payload.targetY,
      payload.targetUnitId,
      payload.targetBaseId
    );
  });

  // Base construction / upgrade
  socket.on('base:build', (payload: { baseId: string; buildingType: any }, callback?: Function) => {
    const result = gameSimulation.buildOrUpgrade(authenticatedUserId, payload.baseId, payload.buildingType);
    if (callback) callback(result);
  });

  // Unit production
  socket.on('base:produce_unit', (payload: { baseId: string; unitType: any }, callback?: Function) => {
    const result = gameSimulation.produceUnit(authenticatedUserId, payload.baseId, payload.unitType);
    if (callback) callback(result);
  });

  // Base Repair
  socket.on('base:repair', (payload: { baseId: string }, callback?: Function) => {
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
  socket.on('chat:send', (payload: { content: string; channel?: 'global' | 'alliance'; coords?: { x: number; y: number } }) => {
    if (!payload.content || payload.content.trim().length === 0) return;

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
      content: payload.content.slice(0, 300),
      coords: payload.coords,
      timestamp: Date.now(),
    };

    data.chat.push(newMsg);
    if (data.chat.length > 200) data.chat.shift();

    io.emit('chat:message', newMsg);
  });

  // Alliance operations
  socket.on('alliance:create', (payload: { name: string; tag: string; description: string }, callback?: Function) => {
    const data = gameStore.getData();
    const userProfile = data.users[authenticatedUserId]?.profile;
    if (!userProfile) return;

    const newAlliance: Alliance = {
      id: `alli_${Date.now()}`,
      name: payload.name.slice(0, 32),
      tag: payload.tag.toUpperCase().slice(0, 5),
      description: payload.description.slice(0, 200),
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

    // Update bases
    data.bases.forEach((b) => {
      if (b.ownerId === authenticatedUserId) b.allianceId = newAlliance.id;
    });

    gameStore.saveData();
    io.emit('alliance:update', newAlliance);
    if (callback) callback({ success: true, alliance: newAlliance });
  });

  socket.on('alliance:join', (payload: { allianceId: string }, callback?: Function) => {
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

// Mount Vite or static server
async function startServer() {
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

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
});
