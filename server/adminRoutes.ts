import { Router, Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import {
  AIDifficulty,
  AdminPermission,
  AdminRole,
  AnnouncementPriority,
  BuildingCatalogOverride,
  BuildingType,
  EconomyConfig,
  MapSectorConfig,
  ModerationRecord,
  PlayerType,
  ROLE_PERMISSIONS,
  UnitCatalogOverride,
  UnitType,
} from '../src/types/game';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { isCellPassable } from '../src/game/pathfinder';
import { AdminSessionRecord, gameStore } from './store';
import { gameSimulation } from './simulation';

export interface AuthenticatedAdminRequest extends Request {
  adminSession?: AdminSessionRecord;
}

// ============================================================================
// XSS & INPUT SANITIZER
// ============================================================================

export function sanitizeText(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

// ============================================================================
// SLIDING-WINDOW RATE LIMITER
// ============================================================================

interface RateBucket {
  count: number;
  resetAt: number;
}

const loginBuckets = new Map<string, RateBucket>();
const actionBuckets = new Map<string, RateBucket>();

export function resetRateLimiterForTests() {
  loginBuckets.clear();
  actionBuckets.clear();
}

function checkRateLimit(map: Map<string, RateBucket>, key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxAttempts) {
    return false;
  }
  bucket.count += 1;
  return true;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

// ============================================================================
// AUTHENTICATION & RBAC MIDDLEWARE
// ============================================================================

export function authenticateAdmin(req: AuthenticatedAdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Valid admin Bearer token missing.' });
    return;
  }

  const session = gameStore.getValidAdminSession(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid, expired, or revoked admin session.' });
    return;
  }

  req.adminSession = session;
  next();
}

export function requirePermission(permission: AdminPermission) {
  return (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
    const session = req.adminSession;
    if (!session) {
      res.status(401).json({ error: 'Unauthenticated admin request.' });
      return;
    }

    const allowedPermissions = ROLE_PERMISSIONS[session.role] || [];
    if (!allowedPermissions.includes(permission)) {
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: `permission.denied:${permission}`,
        targetType: 'system',
        targetId: req.originalUrl,
        reason: `Role '${session.role}' lacks required permission '${permission}'`,
        status: 'denied',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({
        error: `Insufficient permissions. Required permission: '${permission}' (Current role: '${session.role}').`,
      });
      return;
    }

    const ip = getClientIp(req);
    if (!checkRateLimit(actionBuckets, `${session.userId}:${ip}`, 180, 60000)) {
      res.status(429).json({ error: 'Admin action rate limit exceeded. Please wait before retrying.' });
      return;
    }

    next();
  };
}

// ============================================================================
// ADMIN ROUTER FACTORY
// ============================================================================

export function createAdminRouter(
  io: SocketIOServer,
  onlineSockets: Map<string, string>,
  disconnectUserSockets: (userId: string, reason: string) => number
) {
  const router = Router();

  // --------------------------------------------------------------------------
  // 1. ADMIN AUTHENTICATION
  // --------------------------------------------------------------------------
  router.post('/auth/login', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const maxAttempts = parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS || '10', 10);
    const rawUsername = sanitizeText(req.body?.username, 64);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!checkRateLimit(loginBuckets, `ip:${ip}`, maxAttempts, 15 * 60 * 1000)) {
      gameStore.addAuditLog({
        adminId: 'unauthenticated',
        adminUsername: rawUsername || 'unknown',
        adminRole: 'unknown',
        action: 'admin.login.rate_limited',
        targetType: 'auth',
        targetId: ip,
        reason: 'Exceeded maximum login attempts within 15-minute window',
        status: 'denied',
        ipAddress: ip,
      });
      res.status(429).json({ error: 'Too many login attempts. Account/IP temporarily locked for 15 minutes.' });
      return;
    }

    if (!rawUsername || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const data = gameStore.getData();
    const entry = Object.entries(data.users).find(
      ([_, u]) => u.profile.username.toLowerCase() === rawUsername.toLowerCase()
    );

    if (!entry) {
      const consoleStaffAuth = gameStore.authenticateConsoleStaff(rawUsername, password, ip);
      if (consoleStaffAuth) {
        const { session, profile } = consoleStaffAuth;
        gameStore.addAuditLog({
          adminId: session.userId,
          adminUsername: session.username,
          adminRole: session.role,
          action: 'admin.login.success',
          targetType: 'auth',
          targetId: session.userId,
          reason: `Authenticated into Admin Command Center as console staff (${session.role})`,
          status: 'success',
          ipAddress: ip,
        });
        res.json({
          token: session.token,
          expiresAt: session.expiresAt,
          role: session.role,
          permissions: ROLE_PERMISSIONS[session.role],
          profile,
        });
        return;
      }

      gameStore.addAuditLog({
        adminId: 'unauthenticated',
        adminUsername: rawUsername,
        adminRole: 'unknown',
        action: 'admin.login.failed',
        targetType: 'auth',
        targetId: rawUsername,
        reason: 'Invalid username',
        status: 'failure',
        ipAddress: ip,
      });
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    const [userId, userData] = entry;
    const validPass = bcrypt.compareSync(password, userData.passwordHash);
    if (!validPass) {
      gameStore.addAuditLog({
        adminId: userId,
        adminUsername: userData.profile.username,
        adminRole: userData.profile.adminRole || 'unknown',
        action: 'admin.login.failed',
        targetType: 'auth',
        targetId: userId,
        reason: 'Invalid password',
        status: 'failure',
        ipAddress: ip,
      });
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    const access = gameStore.checkPlayerAccess(userId);
    if (!access.allowed) {
      gameStore.addAuditLog({
        adminId: userId,
        adminUsername: userData.profile.username,
        adminRole: userData.profile.adminRole || 'unknown',
        action: 'admin.login.blocked',
        targetType: 'auth',
        targetId: userId,
        reason: access.reason || 'Account suspended or banned',
        status: 'denied',
        ipAddress: ip,
      });
      res.status(403).json({ error: access.reason });
      return;
    }

    const role = userData.profile.adminRole || (userData.profile.isAdmin ? 'super_admin' : null);
    if (!role) {
      gameStore.addAuditLog({
        adminId: userId,
        adminUsername: userData.profile.username,
        adminRole: 'unknown',
        action: 'admin.login.unauthorized_role',
        targetType: 'auth',
        targetId: userId,
        reason: 'Non-admin player attempted to log into /admin console',
        status: 'denied',
        ipAddress: ip,
      });
      res.status(403).json({ error: 'Access denied. This account does not have Administrator privileges.' });
      return;
    }

    const session = gameStore.createAdminSession(userId, ip);
    if (!session) {
      res.status(500).json({ error: 'Failed to initialize admin session.' });
      return;
    }

    userData.profile.lastLoginAt = Date.now();
    gameStore.addAuditLog({
      adminId: userId,
      adminUsername: userData.profile.username,
      adminRole: role,
      action: 'admin.login.success',
      targetType: 'auth',
      targetId: userId,
      reason: `Authenticated into Admin Command Center with role ${role}`,
      status: 'success',
      ipAddress: ip,
    });

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      role: session.role,
      permissions: ROLE_PERMISSIONS[session.role],
      profile: gameStore.sanitizeProfile(userData.profile),
    });
  });

  router.post('/auth/logout', authenticateAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const session = req.adminSession!;
    const data = gameStore.getData();
    delete data.adminSessions[session.token];
    gameStore.addAuditLog({
      adminId: session.userId,
      adminUsername: session.username,
      adminRole: session.role,
      action: 'admin.logout',
      targetType: 'auth',
      targetId: session.userId,
      reason: 'Administrator signed out and revoked session token',
      status: 'success',
      ipAddress: getClientIp(req),
    });
    res.json({ success: true });
  });

  router.get('/auth/me', authenticateAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const session = req.adminSession!;
    if (session.userId.startsWith('console_staff:')) {
      res.json({
        role: session.role,
        expiresAt: session.expiresAt,
        permissions: ROLE_PERMISSIONS[session.role],
        profile: gameStore.getConsoleStaffProfile(session),
      });
      return;
    }
    const data = gameStore.getData();
    const user = data.users[session.userId];
    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }
    res.json({
      role: session.role,
      expiresAt: session.expiresAt,
      permissions: ROLE_PERMISSIONS[session.role],
      profile: gameStore.sanitizeProfile(user.profile),
    });
  });

  // --------------------------------------------------------------------------
  // 2. DASHBOARD OVERVIEW & ANALYTICS
  // --------------------------------------------------------------------------
  router.get(
    '/overview',
    authenticateAdmin,
    requirePermission('dashboard.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      const now = Date.now();
      const allUsers = Object.values(data.users).map((u) => gameStore.sanitizeProfile(u.profile));
      const activeOnlineUserIds = Array.from(new Set(onlineSockets.values()));

      const totalPlayers = allUsers.length;
      const activePlayers24h = allUsers.filter((u) => now - u.lastLoginAt <= 86400000).length;
      const suspendedCount = allUsers.filter((u) => u.status === 'suspended').length;
      const bannedCount = allUsers.filter((u) => u.status === 'banned').length;

      const activeMatches = data.matches.filter((m) => m.status === 'active').length;
      const completedMatches = data.matches.filter((m) => m.status === 'completed' || m.status === 'terminated').length;

      // Aggregate faction/unit stats
      const playerUnits = data.units.filter((u) => u.ownerId !== 'enemy_insurgent' && u.ownerId !== 'neutral');
      const aiUnits = data.units.filter((u) => u.ownerId === 'enemy_insurgent');
      const unitBreakdown: Record<string, number> = {};
      for (const u of data.units) {
        unitBreakdown[u.type] = (unitBreakdown[u.type] || 0) + 1;
      }

      const totalResourcesInWorld = data.bases.reduce(
        (acc, b) => {
          acc.concrete += Math.round(b.resources.concrete);
          acc.steel += Math.round(b.resources.steel);
          acc.aluminum += Math.round(b.resources.aluminum);
          acc.fuel += Math.round(b.resources.fuel);
          return acc;
        },
        { concrete: 0, steel: 0, aluminum: 0, fuel: 0 }
      );

      const onlineUserIdsSet = new Set(onlineSockets.values());
      const playerTypeStats = gameStore.getPlayerTypeStats(onlineUserIdsSet, gameSimulation.aiDifficulty);

      const securityAlerts = data.auditLogs
        .filter((l) => l.status === 'denied' || l.status === 'failure' || l.action.includes('ban'))
        .slice(0, 10);

      res.json({
        kpis: {
          totalPlayers,
          activePlayers24h,
          onlineSessionsCount: onlineSockets.size,
          uniqueOnlinePlayers: activeOnlineUserIds.length,
          suspendedCount,
          bannedCount,
          activeMatches,
          completedMatches,
          totalUnitsActive: data.units.length,
          playerUnitsCount: playerUnits.length,
          aiUnitsCount: aiUnits.length,
          totalBases: data.bases.length,
          playerControlledBases: data.bases.filter((b) => b.ownerId !== 'neutral' && b.ownerId !== 'enemy_insurgent')
            .length,
          aiControlledBases: data.bases.filter((b) => b.ownerId === 'enemy_insurgent').length,
          neutralBases: data.bases.filter((b) => b.ownerId === 'neutral').length,
          totalHumanPlayers: playerTypeStats.totalHumanPlayers,
          activeHumanPlayers: playerTypeStats.activeHumanPlayers,
          totalBotPlayers: playerTypeStats.totalBotPlayers,
          activeBotPlayers: playerTypeStats.activeBotPlayers,
          totalSystemEntities: playerTypeStats.totalSystemEntities,
          totalUnknownPlayers: playerTypeStats.totalUnknownPlayers,
        },
        playerTypeStats,
        serverHealth: {
          status: data.systemSettings.maintenanceMode ? 'maintenance' : 'healthy',
          uptimeMs: gameStore.getUptimeMs(),
          gameVersion: data.systemSettings.gameVersion,
          tickRateHz: 10,
          lastTickDurationMs: gameSimulation.lastTickDurationMs,
          totalTicks: gameSimulation.totalTicks,
          memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
          heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
          databaseSizeKb: Math.round((JSON.stringify(data).length / 1024) * 10) / 10,
          aiDifficulty: gameSimulation.aiDifficulty,
        },
        economySummary: {
          configVersion: data.economyConfig.version,
          resourceGenerationMultiplier: data.economyConfig.resourceGenerationMultiplier,
          totalResourcesInWorld,
        },
        unitBreakdown,
        recentAuditLogs: data.auditLogs.slice(0, 12),
        securityAlerts,
        recentCombatEvents: gameSimulation.recentCombatEvents.slice(0, 15),
      });
    }
  );

  // --------------------------------------------------------------------------
  // 3. PLAYER MANAGEMENT & MODERATION
  // --------------------------------------------------------------------------
  router.get(
    '/players',
    authenticateAdmin,
    requirePermission('players.view'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const search = sanitizeText(req.query.search, 100).toLowerCase();
      const statusFilter = sanitizeText(req.query.status, 32);
      const roleFilter = sanitizeText(req.query.role, 32);
      const playerTypeFilter = sanitizeText(req.query.playerType, 32).toLowerCase();
      const connectionFilter = sanitizeText(req.query.connectionStatus, 32).toLowerCase();
      const matchFilter = sanitizeText(req.query.matchId || req.query.mapId, 64);
      const sortBy = sanitizeText(req.query.sortBy, 32) || 'score';
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));

      const onlineUserIds = new Set(onlineSockets.values());
      const directory = gameStore.getAdminPlayerDirectory(onlineUserIds, gameSimulation.aiDifficulty);
      const stats = gameStore.getPlayerTypeStats(onlineUserIds, gameSimulation.aiDifficulty);

      let players = directory.map((p) => ({
        ...p,
        basesOwned: p.basesControlled,
        unitsOwned: p.activeUnits,
      }));

      if (search) {
        players = players.filter(
          (p) =>
            p.username.toLowerCase().includes(search) ||
            p.id.toLowerCase().includes(search) ||
            p.email.toLowerCase().includes(search) ||
            p.faction.toLowerCase().includes(search) ||
            (p.botAgentId && p.botAgentId.toLowerCase().includes(search)) ||
            (p.accountId && p.accountId.toLowerCase().includes(search))
        );
      }

      if (playerTypeFilter && playerTypeFilter !== 'all') {
        players = players.filter((p) => p.playerType === playerTypeFilter);
      }

      if (connectionFilter && connectionFilter !== 'all') {
        players = players.filter((p) => p.connectionStatus === connectionFilter);
      }

      if (matchFilter && matchFilter !== 'all') {
        players = players.filter(
          (p) =>
            p.currentMapId === matchFilter ||
            p.activeMatchId === matchFilter ||
            p.activeMapIds.includes(matchFilter) ||
            p.activeMatchIds.includes(matchFilter)
        );
      }

      if (statusFilter && statusFilter !== 'all') {
        players = players.filter((p) => (p.status || 'active') === statusFilter);
      }

      if (roleFilter && roleFilter !== 'all') {
        if (roleFilter === 'player') {
          players = players.filter((p) => !p.adminRole);
        } else {
          players = players.filter((p) => p.adminRole === roleFilter);
        }
      }

      const typeOrder: Record<PlayerType, number> = {
        human: 1,
        bot: 2,
        system: 3,
        unknown: 4,
      };

      players.sort((a, b) => {
        if (sortBy === 'username') return a.username.localeCompare(b.username);
        if (sortBy === 'playerType') {
          return typeOrder[a.playerType] - typeOrder[b.playerType] || b.score - a.score;
        }
        if (sortBy === 'connectionStatus') {
          return Number(b.isOnline) - Number(a.isOnline) || b.score - a.score;
        }
        if (sortBy === 'lastLoginAt') return b.lastLoginAt - a.lastLoginAt;
        if (sortBy === 'joinedAt') return b.joinedAt - a.joinedAt;
        if (sortBy === 'level') return b.level - a.level;
        return b.score - a.score;
      });

      const total = players.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const items = players.slice((page - 1) * pageSize, page * pageSize);

      res.json({
        items,
        stats,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      });
    }
  );

  router.get(
    '/players/:id',
    authenticateAdmin,
    requirePermission('players.view'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const targetId = sanitizeText(req.params.id, 64);
      const onlineUserIds = new Set(onlineSockets.values());
      const detail = gameStore.getAdminPlayerDetail(targetId, onlineUserIds, gameSimulation.aiDifficulty);
      if (!detail) {
        res.status(404).json({ error: 'Player not found.' });
        return;
      }

      res.json({
        profile: {
          ...detail.profile,
          basesOwned: detail.profile.basesControlled,
          unitsOwned: detail.profile.activeUnits,
        },
        isOnline: detail.isOnline,
        alliance: detail.alliance,
        bases: detail.bases,
        units: detail.units,
        auditTrail: detail.recentAudits,
        botRecord: detail.botRecord,
        systemRecord: detail.systemRecord,
        homeBaseDiagnostics: detail.homeBaseDiagnostics,
      });
    }
  );

  router.get(
    '/players/:id/home-base',
    authenticateAdmin,
    requirePermission('players.view'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const targetId = sanitizeText(req.params.id, 64);
      const data = gameStore.getData();
      if (!data.users[targetId] && !data.bases.some((b) => b.ownerId === targetId)) {
        res.status(404).json({ error: 'Player not found.' });
        return;
      }
      res.json({
        success: true,
        diagnostics: gameStore.getAdminPlayerHomeBaseDiagnostics(targetId),
      });
    }
  );

  router.post(
    '/players/:id/home-base/action',
    authenticateAdmin,
    requirePermission('players.suspend'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const targetId = sanitizeText(req.params.id, 64);
      const action = sanitizeText(req.body?.action, 32) as 'recover' | 'relocate' | 'repair' | 'reset_cooldowns';
      const targetMapId = req.body?.targetMapId ? sanitizeText(req.body.targetMapId, 64) : undefined;
      const reason = sanitizeText(req.body?.reason, 300) || `Administrative Home Base ${action}`;

      if (!['recover', 'relocate', 'repair', 'reset_cooldowns'].includes(action)) {
        res.status(400).json({ error: 'Invalid Home Base action. Must be recover, relocate, repair, or reset_cooldowns.' });
        return;
      }

      const result = gameStore.adminManagePlayerHomeBase(targetId, action, {
        targetMapId,
        reason,
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        ipAddress: getClientIp(req),
      });

      if (!result.success) {
        res.status(result.status).json({ error: result.message });
        return;
      }

      gameSimulation.broadcastWorldSync();
      res.json(result);
    }
  );

  router.post(
    '/players/:id/verify-type',
    authenticateAdmin,
    requirePermission('players.suspend'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const targetId = sanitizeText(req.params.id, 64);
      const playerType = sanitizeText(req.body?.playerType, 32).toLowerCase() as PlayerType;
      const reason = sanitizeText(req.body?.reason, 300);

      if (!reason || reason.length < 3) {
        res.status(400).json({ error: 'A verification reason (minimum 3 characters) is required.' });
        return;
      }

      const result = gameStore.verifyUnknownPlayerType(
        targetId,
        playerType,
        session.userId,
        session.username,
        session.role,
        reason,
        getClientIp(req)
      );

      if (!result.success) {
        res.status(result.status).json({ error: result.message });
        return;
      }

      res.json({
        success: true,
        message: result.message,
        profile: result.record,
        record: result.record,
      });
    }
  );

  router.post(
    '/players/delete-all',
    authenticateAdmin,
    requirePermission('players.ban'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const reason = sanitizeText(req.body?.reason, 300) || 'Administrative purge of all player accounts';

      const result = gameStore.deleteAllPlayerAccounts(
        session.userId,
        session.username,
        session.role,
        reason,
        getClientIp(req)
      );

      for (const uid of result.deletedUserIds) {
        disconnectUserSockets(uid, `Your account was deleted by High Command: ${reason}`);
      }

      const data = gameStore.getData();
      io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: Date.now() });

      res.json(result);
    }
  );

  router.delete(
    '/players/:id',
    authenticateAdmin,
    requirePermission('players.ban'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const targetId = sanitizeText(req.params.id, 64);
      const reason =
        sanitizeText(req.body?.reason || req.query.reason, 300) ||
        'Administrative account deletion';

      const result = gameStore.deletePlayerAccount(
        targetId,
        session.userId,
        session.username,
        session.role,
        reason,
        getClientIp(req)
      );

      if (!result.success) {
        res.status(result.status).json({ error: result.message });
        return;
      }

      disconnectUserSockets(targetId, `Your account has been deleted by High Command: ${reason}`);
      const data = gameStore.getData();
      io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: Date.now() });

      res.json(result);
    }
  );

  router.post(
    '/players/:id/moderate',
    authenticateAdmin,
    (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
      const action = sanitizeText(req.body?.action, 32);
      if (action === 'ban' || action === 'unban' || action === 'delete_account') {
        return requirePermission('players.ban')(req, res, next);
      }
      if (action === 'reset_progress') {
        return requirePermission('players.reset_progress')(req, res, next);
      }
      return requirePermission('players.suspend')(req, res, next);
    },
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const targetId = sanitizeText(req.params.id, 64);
      const action = sanitizeText(req.body?.action, 32) as
        | 'suspend'
        | 'unsuspend'
        | 'ban'
        | 'unban'
        | 'reset_progress'
        | 'rename'
        | 'delete_account';
      const reason = sanitizeText(req.body?.reason, 300);
      const durationMinutes = Number(req.body?.durationMinutes) || 60;
      const newUsername = sanitizeText(req.body?.newUsername, 32);

      if (!reason || reason.length < 3) {
        res.status(400).json({ error: 'A mandatory moderation reason (minimum 3 characters) is required.' });
        return;
      }

      if (action === 'delete_account') {
        const result = gameStore.deletePlayerAccount(
          targetId,
          session.userId,
          session.username,
          session.role,
          reason,
          getClientIp(req)
        );
        if (!result.success) {
          res.status(result.status).json({ error: result.message });
          return;
        }
        disconnectUserSockets(targetId, `Your account has been deleted by High Command: ${reason}`);
        const currentData = gameStore.getData();
        io.emit('world:sync', { units: currentData.units, bases: currentData.bases, timestamp: Date.now() });
        res.json({
          success: true,
          message: result.message,
          deletedUserId: targetId,
        });
        return;
      }

      const data = gameStore.getData();
      const targetUser = data.users[targetId];
      if (!targetUser) {
        res.status(404).json({ error: 'Target player account not found.' });
        return;
      }

      const targetProfile = targetUser.profile;

      // Prevent moderating super_admin unless actor is super_admin, and prevent self-ban/self-suspend
      if (targetId === session.userId && (action === 'ban' || action === 'suspend')) {
        res.status(400).json({ error: 'You cannot suspend or ban your own administrator account.' });
        return;
      }

      if (targetProfile.adminRole === 'super_admin' && session.role !== 'super_admin') {
        gameStore.addAuditLog({
          adminId: session.userId,
          adminUsername: session.username,
          adminRole: session.role,
          action: `player.${action}.denied`,
          targetType: 'player',
          targetId,
          reason: 'Attempted to moderate a super_admin without super_admin authority',
          status: 'denied',
          ipAddress: getClientIp(req),
        });
        res.status(403).json({ error: 'Cannot moderate a Super Admin account.' });
        return;
      }

      const now = Date.now();
      let record: ModerationRecord;

      if (action === 'suspend') {
        const expiresAt = now + Math.max(1, durationMinutes) * 60 * 1000;
        targetProfile.status = 'suspended';
        targetProfile.suspendedUntil = expiresAt;
        targetProfile.banReason = reason;
        record = {
          id: `mod_${now}`,
          action: 'suspend',
          adminId: session.userId,
          adminUsername: session.username,
          reason,
          timestamp: now,
          expiresAt,
          metadata: { durationMinutes },
        };
        gameStore.revokeUserSessions(targetId);
        disconnectUserSockets(targetId, `Your account has been suspended: ${reason}`);
      } else if (action === 'unsuspend') {
        targetProfile.status = 'active';
        targetProfile.suspendedUntil = null;
        targetProfile.banReason = null;
        record = {
          id: `mod_${now}`,
          action: 'unsuspend',
          adminId: session.userId,
          adminUsername: session.username,
          reason,
          timestamp: now,
        };
      } else if (action === 'ban') {
        targetProfile.status = 'banned';
        targetProfile.suspendedUntil = null;
        targetProfile.banReason = reason;
        record = {
          id: `mod_${now}`,
          action: 'ban',
          adminId: session.userId,
          adminUsername: session.username,
          reason,
          timestamp: now,
        };
        gameStore.revokeUserSessions(targetId);
        disconnectUserSockets(targetId, `Your account has been permanently banned: ${reason}`);
      } else if (action === 'unban') {
        targetProfile.status = 'active';
        targetProfile.suspendedUntil = null;
        targetProfile.banReason = null;
        record = {
          id: `mod_${now}`,
          action: 'unban',
          adminId: session.userId,
          adminUsername: session.username,
          reason,
          timestamp: now,
        };
      } else if (action === 'reset_progress') {
        targetProfile.score = 1000;
        targetProfile.level = 1;
        targetProfile.rank = 'Lieutenant';
        targetProfile.totalBasesCaptured = 0;
        targetProfile.totalUnitsProduced = 0;
        targetProfile.totalUnitsDestroyed = 0;
        targetProfile.totalResourcesHarvested = 0;

        // Remove non-home units and reset owned bases to starter resources
        data.units = data.units.filter((u) => u.ownerId !== targetId);
        const econ = gameStore.getEconomyConfig();
        data.bases.forEach((b) => {
          if (b.ownerId === targetId) {
            b.resources = { ...econ.startingResources };
            b.productionQueue = [];
            b.constructionQueue = [];
          }
        });

        record = {
          id: `mod_${now}`,
          action: 'reset_progress',
          adminId: session.userId,
          adminUsername: session.username,
          reason,
          timestamp: now,
        };
        io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: now });
      } else if (action === 'rename') {
        if (!newUsername || newUsername.length < 3) {
          res.status(400).json({ error: 'New username must be between 3 and 32 characters.' });
          return;
        }
        const oldUsername = targetProfile.username;
        targetProfile.username = newUsername;
        data.bases.forEach((b) => {
          if (b.ownerId === targetId) b.ownerName = newUsername;
        });
        data.units.forEach((u) => {
          if (u.ownerId === targetId) u.ownerName = newUsername;
        });
        record = {
          id: `mod_${now}`,
          action: 'rename',
          adminId: session.userId,
          adminUsername: session.username,
          reason,
          timestamp: now,
          metadata: { oldUsername, newUsername },
        };
        io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: now });
      } else {
        res.status(400).json({ error: `Unsupported moderation action '${action}'.` });
        return;
      }

      if (!targetProfile.moderationHistory) targetProfile.moderationHistory = [];
      targetProfile.moderationHistory.unshift(record);
      gameStore.saveData();

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: `player.${action}`,
        targetType: 'player',
        targetId,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
        metadata: record.metadata,
      });

      res.json({
        success: true,
        profile: gameStore.sanitizeProfile(targetProfile),
        moderationRecord: record,
      });
    }
  );

  // --------------------------------------------------------------------------
  // 4. LIVE MATCHES & MATCH HISTORY
  // --------------------------------------------------------------------------
  router.get(
    '/matches',
    authenticateAdmin,
    requirePermission('matches.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      const onlineUserIds = new Set(onlineSockets.values());
      const activeSocketsList = Array.from(onlineSockets.entries()).map(([socketId, userId]) => {
        const resolved = gameStore.resolvePlayerIdentity(userId, onlineUserIds, gameSimulation.aiDifficulty);
        return {
          socketId,
          userId,
          username: resolved.username,
          rank: resolved.rank,
          allianceId: resolved.allianceId || null,
          playerType: resolved.playerType,
          controlSource: resolved.controlSource,
        };
      });

      const activeMap = data.maps.find((m) => m.isActiveMap) || data.maps[0];
      const activeMapId = activeMap?.id || 'map_riverfront_assault';
      const liveParticipants = gameStore.getMatchParticipants(
        activeMapId,
        onlineUserIds,
        ['player_default', 'enemy_insurgent'],
        gameSimulation.aiDifficulty
      );
      const countByType = (list: typeof liveParticipants) => ({
        human: list.filter((p) => p.playerType === 'human').length,
        bot: list.filter((p) => p.playerType === 'bot').length,
        system: list.filter((p) => p.playerType === 'system').length,
        unknown: list.filter((p) => p.playerType === 'unknown').length,
      });

      const enrichedMatches = data.matches.map((m) => {
        const participants = gameStore.getMatchParticipants(
          m.mapId || 'map_riverfront_assault',
          onlineUserIds,
          m.participantIds || [],
          m.aiDifficulty || gameSimulation.aiDifficulty
        );
        return {
          ...m,
          participants,
          participantTypeCounts: countByType(participants),
        };
      });

      res.json({
        liveSector: {
          mapId: activeMapId,
          mapName: activeMap?.name || 'Sector 01: Riverfront Assault',
          seed: data.worldConfig.seed,
          width: data.worldConfig.width,
          height: data.worldConfig.height,
          aiDifficulty: gameSimulation.aiDifficulty,
          aiAggressionEnabled: data.systemSettings.aiAggressionEnabled,
          maintenanceMode: data.systemSettings.maintenanceMode,
          lastTickDurationMs: gameSimulation.lastTickDurationMs,
          totalTicks: gameSimulation.totalTicks,
          basesCount: data.bases.length,
          unitsCount: data.units.length,
          envObjectsCount: data.envObjects.length,
          connectedSessions: activeSocketsList,
          participants: liveParticipants,
          participantTypeCounts: countByType(liveParticipants),
          bases: data.bases.map((b) => {
            const ownerIdentity = gameStore.resolvePlayerIdentity(
              b.ownerId,
              onlineUserIds,
              gameSimulation.aiDifficulty
            );
            return {
              id: b.id,
              mapId: b.mapId || 'map_riverfront_assault',
              name: b.name,
              type: b.type,
              ownerId: b.ownerId,
              ownerName: b.ownerName,
              controllerPlayerType: ownerIdentity.playerType,
              controllerSource: ownerIdentity.controlSource,
              x: b.x,
              y: b.y,
              health: b.health,
              maxHealth: b.maxHealth,
              defenseShield: b.defenseShield,
              buildingsCount: b.buildings.length,
              resources: b.resources,
            };
          }),
        },
        matches: enrichedMatches,
      });
    }
  );

  router.post(
    '/matches/action',
    authenticateAdmin,
    requirePermission('matches.terminate'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const action = sanitizeText(req.body?.action, 40);
      const reason = sanitizeText(req.body?.reason, 300) || 'Administrative match control action';
      const data = gameStore.getData();
      const now = Date.now();

      if (action === 'reset_match' || action === 'terminate_match') {
        // Mark current active match as terminated/completed
        const activeMatch = data.matches.find((m) => m.status === 'active');
        if (activeMatch) {
          activeMatch.status = action === 'terminate_match' ? 'terminated' : 'completed';
          activeMatch.endedAt = now;
          activeMatch.terminationReason = reason;
        }

        // Regenerate sector bases while preserving other map sectors and registered human Home Bases
        const activeMap = data.maps.find((m) => m.isActiveMap) || data.maps[0];
        const targetMapId = activeMap?.id || 'map_riverfront_assault';
        const preservedBases = data.bases.filter(
          (b) =>
            (b.mapId || 'map_riverfront_assault') !== targetMapId ||
            (b.isHomeBase && b.ownerId !== 'player_default' && b.ownerId !== 'enemy_insurgent' && b.ownerId !== 'neutral')
        );
        const generated = gameSimulation.regenerateWorldWithSeed(
          activeMap?.seed || data.worldConfig.seed,
          activeMap?.width || 100,
          activeMap?.height || 75
        );
        const econ = gameStore.getEconomyConfig();

        generated.bases.forEach((b) => {
          b.mapId = targetMapId;
          b.resources = { ...econ.startingResources };
          b.storageCap = { ...econ.baseStorageCap };
        });

        const homeBase = generated.bases[0];
        homeBase.ownerId = 'player_default';
        homeBase.ownerName = data.users['player_default']?.profile.username || 'Commander';
        homeBase.name = 'Fortress Alpha (HQ)';
        homeBase.allianceId = 'alliance_vanguard';
        homeBase.isHomeBase = true;

        const forwardBase = generated.bases[3];
        if (forwardBase) {
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

        data.bases = [...generated.bases, ...preservedBases];
        const preservedUnits = data.units.filter(
          (u) =>
            (u.mapId || 'map_riverfront_assault') !== targetMapId ||
            (u.ownerId !== 'player_default' && u.ownerId !== 'enemy_insurgent' && u.ownerId !== 'neutral')
        );
        data.units = [
          ...preservedUnits,
          {
            id: `unit_reset_1_${now}`,
            mapId: targetMapId,
            type: 'rifle_infantry',
            ownerId: 'player_default',
            ownerName: homeBase.ownerName,
            allianceId: 'alliance_vanguard',
            x: homeBase.x + 2,
            y: homeBase.y + 1,
            rotation: 0,
            health: gameStore.getEffectiveUnitDef('rifle_infantry').maxHealth,
            maxHealth: gameStore.getEffectiveUnitDef('rifle_infantry').maxHealth,
            command: 'idle',
            path: [],
            lastAttackTime: 0,
            kills: 0,
            homeBaseId: homeBase.id,
          },
          {
            id: `unit_reset_2_${now}`,
            mapId: targetMapId,
            type: 'titan_mbt',
            ownerId: 'player_default',
            ownerName: homeBase.ownerName,
            allianceId: 'alliance_vanguard',
            x: homeBase.x + 2,
            y: homeBase.y + 3,
            rotation: 0,
            health: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
            maxHealth: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
            command: 'idle',
            path: [],
            lastAttackTime: 0,
            kills: 0,
            homeBaseId: homeBase.id,
          },
          {
            id: `unit_reset_e1_${now}`,
            mapId: targetMapId,
            type: 'titan_mbt',
            ownerId: 'enemy_insurgent',
            ownerName: 'Kodiak PMC',
            x: enemyBase.x - 3,
            y: enemyBase.y + 1,
            rotation: 3.14,
            health: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
            maxHealth: gameStore.getEffectiveUnitDef('titan_mbt').maxHealth,
            command: 'hold',
            path: [],
            lastAttackTime: 0,
            kills: 0,
            homeBaseId: enemyBase.id,
          },
        ];

        const newMatchId = `match_${now}`;
        data.matches.unshift({
          id: newMatchId,
          mapId: targetMapId,
          mapName: activeMap?.name || 'Sector 01: Riverfront Assault',
          seed: data.worldConfig.seed,
          status: 'active',
          startedAt: now,
          endedAt: null,
          aiDifficulty: gameSimulation.aiDifficulty,
          participantIds: ['player_default', 'enemy_insurgent'],
          winnerName: null,
          totalUnitsSpawned: data.units.length,
          totalBasesCaptured: 0,
          terminationReason: null,
        });

        gameStore.saveData();
        io.emit('world:state', {
          bases: data.bases,
          units: data.units,
          envObjects: data.envObjects,
          alliances: data.alliances,
          chat: data.chat.filter((c) => c.channel !== 'alliance').slice(-50),
          onlineUserIds: Array.from(new Set(onlineSockets.values())),
          timestamp: now,
        });

        gameStore.addAuditLog({
          adminId: session.userId,
          adminUsername: session.username,
          adminRole: session.role,
          action: `match.${action}`,
          targetType: 'match',
          targetId: newMatchId,
          reason,
          status: 'success',
          ipAddress: getClientIp(req),
        });

        res.json({ success: true, matchId: newMatchId });
        return;
      }

      if (action === 'set_ai_difficulty') {
        const diff = sanitizeText(req.body?.difficulty, 16) as AIDifficulty;
        if (!['easy', 'medium', 'hard'].includes(diff)) {
          res.status(400).json({ error: 'Invalid AI difficulty. Must be easy, medium, or hard.' });
          return;
        }
        gameSimulation.setAiDifficulty(diff);
        gameStore.saveData();
        gameStore.addAuditLog({
          adminId: session.userId,
          adminUsername: session.username,
          adminRole: session.role,
          action: 'match.set_ai_difficulty',
          targetType: 'match',
          targetId: diff,
          reason,
          status: 'success',
          ipAddress: getClientIp(req),
        });
        res.json({ success: true, aiDifficulty: diff });
        return;
      }

      if (action === 'kick_session') {
        const targetUserId = sanitizeText(req.body?.userId, 64);
        const disconnectedCount = disconnectUserSockets(targetUserId, `Session disconnected by Administrator: ${reason}`);
        gameStore.addAuditLog({
          adminId: session.userId,
          adminUsername: session.username,
          adminRole: session.role,
          action: 'match.kick_session',
          targetType: 'player',
          targetId: targetUserId,
          reason,
          status: 'success',
          ipAddress: getClientIp(req),
          metadata: { disconnectedCount },
        });
        res.json({ success: true, disconnectedCount });
        return;
      }

      res.status(400).json({ error: `Unknown match action '${action}'.` });
    }
  );

  // --------------------------------------------------------------------------
  // 5. GAME ECONOMY MANAGEMENT & ROLLBACK
  // --------------------------------------------------------------------------
  router.get(
    '/economy',
    authenticateAdmin,
    requirePermission('economy.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      res.json({
        economyConfig: data.economyConfig,
        history: data.configHistory.filter((h) => h.domain === 'economy').slice(0, 25),
      });
    }
  );

  router.put(
    '/economy',
    authenticateAdmin,
    requirePermission('economy.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const body = req.body || {};
      const reason = sanitizeText(body.reason, 300);
      if (!reason || reason.length < 3) {
        res.status(400).json({ error: 'A change reason is required when modifying economy rules.' });
        return;
      }

      // Strict numeric range validation
      const resGenMult = Number(body.resourceGenerationMultiplier);
      const unitCostMult = Number(body.unitCostMultiplier);
      const bldCostMult = Number(body.buildingCostMultiplier);
      const unitSpeedMult = Number(body.unitProductionSpeedMultiplier);
      const bldSpeedMult = Number(body.buildingBuildSpeedMultiplier);
      const popCapPerBase = Number(body.populationCapPerBase);
      const maxGlobalUnits = Number(body.maxGlobalUnits);
      const captureSpeed = Number(body.captureSpeedPerTick ?? 5);

      if (!Number.isFinite(resGenMult) || resGenMult < 0.1 || resGenMult > 10.0) {
        res.status(400).json({ error: 'resourceGenerationMultiplier must be between 0.1 and 10.0.' });
        return;
      }
      if (!Number.isFinite(unitCostMult) || unitCostMult < 0.2 || unitCostMult > 5.0) {
        res.status(400).json({ error: 'unitCostMultiplier must be between 0.2 and 5.0.' });
        return;
      }
      if (!Number.isFinite(bldCostMult) || bldCostMult < 0.2 || bldCostMult > 5.0) {
        res.status(400).json({ error: 'buildingCostMultiplier must be between 0.2 and 5.0.' });
        return;
      }
      if (!Number.isFinite(unitSpeedMult) || unitSpeedMult < 0.2 || unitSpeedMult > 5.0) {
        res.status(400).json({ error: 'unitProductionSpeedMultiplier must be between 0.2 and 5.0.' });
        return;
      }
      if (!Number.isFinite(bldSpeedMult) || bldSpeedMult < 0.2 || bldSpeedMult > 5.0) {
        res.status(400).json({ error: 'buildingBuildSpeedMultiplier must be between 0.2 and 5.0.' });
        return;
      }
      if (!Number.isFinite(popCapPerBase) || popCapPerBase < 10 || popCapPerBase > 200) {
        res.status(400).json({ error: 'populationCapPerBase must be between 10 and 200.' });
        return;
      }
      if (!Number.isFinite(maxGlobalUnits) || maxGlobalUnits < 20 || maxGlobalUnits > 1000) {
        res.status(400).json({ error: 'maxGlobalUnits must be between 20 and 1000.' });
        return;
      }
      if (!Number.isFinite(captureSpeed) || captureSpeed < 1 || captureSpeed > 50) {
        res.status(400).json({ error: 'captureSpeedPerTick must be between 1 and 50.' });
        return;
      }

      const data = gameStore.getData();
      const current = data.economyConfig;

      const parseResObj = (input: any, fallback: any, minVal = 0, maxVal = 500000) => {
        const c = Number(input?.concrete ?? fallback.concrete);
        const s = Number(input?.steel ?? fallback.steel);
        const a = Number(input?.aluminum ?? fallback.aluminum);
        const f = Number(input?.fuel ?? fallback.fuel);
        if (
          !Number.isFinite(c) ||
          !Number.isFinite(s) ||
          !Number.isFinite(a) ||
          !Number.isFinite(f) ||
          c < minVal ||
          s < minVal ||
          a < minVal ||
          f < minVal ||
          c > maxVal ||
          s > maxVal ||
          a > maxVal ||
          f > maxVal
        ) {
          return null;
        }
        return { concrete: c, steel: s, aluminum: a, fuel: f };
      };

      const baseGenRates = parseResObj(body.baseGenerationRates, current.baseGenerationRates, 0.1, 500);
      const startingRes = parseResObj(body.startingResources, current.startingResources, 0, 100000);
      const storageCap = parseResObj(body.baseStorageCap, current.baseStorageCap, 1000, 500000);

      if (!baseGenRates || !startingRes || !storageCap) {
        res.status(400).json({ error: 'Invalid resource rate, starting resource, or storage cap numbers.' });
        return;
      }

      const now = Date.now();
      const nextVersion = current.version + 1;
      const updatedConfig: EconomyConfig = {
        version: nextVersion,
        resourceGenerationMultiplier: resGenMult,
        baseGenerationRates: baseGenRates,
        startingResources: startingRes,
        baseStorageCap: storageCap,
        unitCostMultiplier: unitCostMult,
        buildingCostMultiplier: bldCostMult,
        unitProductionSpeedMultiplier: unitSpeedMult,
        buildingBuildSpeedMultiplier: bldSpeedMult,
        populationCapPerBase: Math.round(popCapPerBase),
        maxGlobalUnits: Math.round(maxGlobalUnits),
        maxUnitsPerMap: Math.max(20, Math.min(400, Math.round(Number(body.maxUnitsPerMap ?? current.maxUnitsPerMap ?? 160)))),
        maxBasesPerPlayerOnMap: Math.max(1, Math.min(15, Math.round(Number(body.maxBasesPerPlayerOnMap ?? current.maxBasesPerPlayerOnMap ?? 6)))),
        maxBuildingsPerBase: Math.max(6, Math.min(30, Math.round(Number(body.maxBuildingsPerBase ?? current.maxBuildingsPerBase ?? 16)))),
        maxSelectionGroupSize: Math.max(6, Math.min(60, Math.round(Number(body.maxSelectionGroupSize ?? current.maxSelectionGroupSize ?? 24)))),
        fuelTravelCostMultiplier: Math.max(0.2, Math.min(5.0, Number(body.fuelTravelCostMultiplier ?? current.fuelTravelCostMultiplier ?? 1.0))),
        captureSpeedPerTick: Math.round(captureSpeed),
        minBaseSpawnDistance: Math.max(6, Math.min(30, Math.round(Number(body.minBaseSpawnDistance ?? current.minBaseSpawnDistance ?? 12)))),
        homeBaseProtectionDurationHours: Math.max(1, Math.min(168, Math.round(Number(body.homeBaseProtectionDurationHours ?? current.homeBaseProtectionDurationHours ?? 48)))),
        rebuildProtectionDurationMinutes: Math.max(5, Math.min(720, Math.round(Number(body.rebuildProtectionDurationMinutes ?? current.rebuildProtectionDurationMinutes ?? 60)))),
        homeBaseArmorMultiplier: Math.max(1.0, Math.min(5.0, Number(body.homeBaseArmorMultiplier ?? current.homeBaseArmorMultiplier ?? 1.5))),
        productionDestroyPercentOnNeutralize: Math.max(10, Math.min(100, Math.round(Number(body.productionDestroyPercentOnNeutralize ?? current.productionDestroyPercentOnNeutralize ?? 50)))),
        destroyMaxCapBuildingsOnNeutralize: body.destroyMaxCapBuildingsOnNeutralize !== undefined ? Boolean(body.destroyMaxCapBuildingsOnNeutralize) : (current.destroyMaxCapBuildingsOnNeutralize ?? true),
        newbaseMaxOwnedBasesThreshold: Math.max(1, Math.min(10, Math.round(Number(body.newbaseMaxOwnedBasesThreshold ?? current.newbaseMaxOwnedBasesThreshold ?? 2)))),
        newbaseMaxWeeklyCapturesThreshold: Math.max(0, Math.min(20, Math.round(Number(body.newbaseMaxWeeklyCapturesThreshold ?? current.newbaseMaxWeeklyCapturesThreshold ?? 3)))),
        newbaseProtectionDurationHours: Math.max(1, Math.min(168, Math.round(Number(body.newbaseProtectionDurationHours ?? current.newbaseProtectionDurationHours ?? 24)))),
        weeklyCaptureLimitPerPlayer: Math.max(1, Math.min(50, Math.round(Number(body.weeklyCaptureLimitPerPlayer ?? current.weeklyCaptureLimitPerPlayer ?? 10)))),
        inactivityEvictionDays: Math.max(1, Math.min(90, Math.round(Number(body.inactivityEvictionDays ?? current.inactivityEvictionDays ?? 14)))),
        conquestUnitTypes: Array.isArray(body.conquestUnitTypes) && body.conquestUnitTypes.length > 0 ? body.conquestUnitTypes : (current.conquestUnitTypes || ['dominator_conquest']),
        spawnMapFallbackPolicy: body.spawnMapFallbackPolicy === 'reject_when_full' ? 'reject_when_full' : 'next_eligible_map',
        updatedAt: now,
        updatedBy: session.username,
      };

      data.economyConfig = updatedConfig;

      if (body.applyStorageCapToExistingBases) {
        for (const base of data.bases) {
          base.storageCap = {
            concrete: Math.max(base.storageCap.concrete, storageCap.concrete),
            steel: Math.max(base.storageCap.steel, storageCap.steel),
            aluminum: Math.max(base.storageCap.aluminum, storageCap.aluminum),
            fuel: Math.max(base.storageCap.fuel, storageCap.fuel),
          };
        }
      }

      const summary = `Gen ${resGenMult}x | UnitCost ${unitCostMult}x | BldCost ${bldCostMult}x | Pop/Base ${updatedConfig.populationCapPerBase}`;
      data.configHistory.unshift({
        version: nextVersion,
        domain: 'economy',
        timestamp: now,
        adminId: session.userId,
        adminUsername: session.username,
        reason,
        snapshot: { ...updatedConfig },
        changesSummary: summary,
      });

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'economy.update',
        targetType: 'economy',
        targetId: `v${nextVersion}`,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
        metadata: { version: nextVersion, summary },
      });

      io.emit('economy:updated', updatedConfig);
      res.json({ success: true, economyConfig: updatedConfig });
    }
  );

  router.post(
    '/economy/rollback',
    authenticateAdmin,
    requirePermission('economy.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const targetVersion = Number(req.body?.version);
      const reason = sanitizeText(req.body?.reason, 300) || `Rollback to economy version v${targetVersion}`;

      const data = gameStore.getData();
      const entry = data.configHistory.find((h) => h.domain === 'economy' && h.version === targetVersion);
      if (!entry || !entry.snapshot) {
        res.status(404).json({ error: `Economy version v${targetVersion} not found in history.` });
        return;
      }

      const now = Date.now();
      const newVersion = data.economyConfig.version + 1;
      const restored: EconomyConfig = {
        ...entry.snapshot,
        version: newVersion,
        updatedAt: now,
        updatedBy: session.username,
      };

      data.economyConfig = restored;
      data.configHistory.unshift({
        version: newVersion,
        domain: 'economy',
        timestamp: now,
        adminId: session.userId,
        adminUsername: session.username,
        reason,
        snapshot: { ...restored },
        changesSummary: `Rolled back to v${targetVersion} baseline`,
      });

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'economy.rollback',
        targetType: 'economy',
        targetId: `v${newVersion} (from v${targetVersion})`,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      io.emit('economy:updated', restored);
      res.json({ success: true, economyConfig: restored });
    }
  );

  // --------------------------------------------------------------------------
  // 6. UNIT & BUILDING CATALOG MANAGEMENT
  // --------------------------------------------------------------------------
  router.get(
    '/catalog',
    authenticateAdmin,
    requirePermission('maps.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      res.json({
        catalog: gameStore.getFullEffectiveCatalog(),
        overrides: data.catalogState,
        history: data.configHistory.filter((h) => h.domain === 'catalog').slice(0, 20),
      });
    }
  );

  router.put(
    '/catalog/unit/:type',
    authenticateAdmin,
    requirePermission('content.publish'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const unitType = sanitizeText(req.params.type, 40) as UnitType;
      const baseDef = UNIT_CATALOG[unitType];
      if (!baseDef) {
        res.status(404).json({ error: `Unknown unit type '${unitType}'.` });
        return;
      }

      const body = req.body || {};
      const reason = sanitizeText(body.reason, 300) || `Updated ${unitType} unit specification`;
      const maxHealth = Number(body.maxHealth ?? baseDef.maxHealth);
      const armor = Number(body.armor ?? baseDef.armor);
      const speed = Number(body.speed ?? baseDef.speed);
      const attackRange = Number(body.attackRange ?? baseDef.attackRange);
      const attackDamage = Number(body.attackDamage ?? baseDef.attackDamage);
      const cooldownSec = Number(body.cooldownSec ?? baseDef.cooldownSec);
      const trainTimeSec = Number(body.trainTimeSec ?? baseDef.trainTimeSec);
      const populationCost = Number(body.populationCost ?? baseDef.populationCost);

      if (
        !Number.isFinite(maxHealth) ||
        maxHealth < 10 ||
        maxHealth > 20000 ||
        !Number.isFinite(armor) ||
        armor < 0 ||
        armor > 95 ||
        !Number.isFinite(speed) ||
        speed < 0.2 ||
        speed > 20 ||
        !Number.isFinite(attackRange) ||
        attackRange < 1 ||
        attackRange > 40 ||
        !Number.isFinite(attackDamage) ||
        attackDamage < 1 ||
        attackDamage > 5000 ||
        !Number.isFinite(cooldownSec) ||
        cooldownSec < 0.1 ||
        cooldownSec > 30 ||
        !Number.isFinite(trainTimeSec) ||
        trainTimeSec < 1 ||
        trainTimeSec > 600 ||
        !Number.isFinite(populationCost) ||
        populationCost < 1 ||
        populationCost > 25
      ) {
        res.status(400).json({ error: 'One or more unit combat/training stats are out of valid bounds.' });
        return;
      }

      const cost = {
        concrete: Math.max(0, Math.round(Number(body.cost?.concrete ?? baseDef.cost.concrete))),
        steel: Math.max(0, Math.round(Number(body.cost?.steel ?? baseDef.cost.steel))),
        aluminum: Math.max(0, Math.round(Number(body.cost?.aluminum ?? baseDef.cost.aluminum))),
        fuel: Math.max(0, Math.round(Number(body.cost?.fuel ?? baseDef.cost.fuel))),
      };

      const override: UnitCatalogOverride = {
        type: unitType,
        name: sanitizeText(body.name || baseDef.name, 80),
        description: sanitizeText(body.description || baseDef.description, 400),
        maxHealth: Math.round(maxHealth),
        armor: Math.round(armor),
        speed: Math.round(speed * 100) / 100,
        attackRange: Math.round(attackRange * 100) / 100,
        attackDamage: Math.round(attackDamage),
        cooldownSec: Math.round(cooldownSec * 100) / 100,
        trainTimeSec: Math.round(trainTimeSec),
        populationCost: Math.round(populationCost),
        cost,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      };

      const data = gameStore.getData();
      const now = Date.now();
      data.catalogState.version += 1;
      data.catalogState.units[unitType] = override;
      data.catalogState.updatedAt = now;
      data.catalogState.updatedBy = session.username;

      // Update maxHealth of existing active units of this type proportionally
      for (const u of data.units) {
        if (u.type === unitType) {
          u.maxHealth = override.maxHealth;
          u.health = Math.min(u.health, u.maxHealth);
        }
      }

      data.configHistory.unshift({
        version: data.catalogState.version,
        domain: 'catalog',
        timestamp: now,
        adminId: session.userId,
        adminUsername: session.username,
        reason,
        snapshot: JSON.parse(JSON.stringify(data.catalogState)),
        changesSummary: `Unit ${override.name}: HP=${override.maxHealth}, DMG=${override.attackDamage}, Enabled=${override.enabled}`,
      });

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'catalog.unit.update',
        targetType: 'catalog',
        targetId: unitType,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      io.emit('catalog:updated', gameStore.getFullEffectiveCatalog());
      res.json({
        success: true,
        unit: gameStore.getEffectiveUnitDef(unitType),
        catalogVersion: data.catalogState.version,
      });
    }
  );

  router.put(
    '/catalog/building/:type',
    authenticateAdmin,
    requirePermission('content.publish'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const buildingType = sanitizeText(req.params.type, 40) as BuildingType;
      const baseDef = BUILDING_CATALOG[buildingType];
      if (!baseDef) {
        res.status(404).json({ error: `Unknown building type '${buildingType}'.` });
        return;
      }

      const body = req.body || {};
      const reason = sanitizeText(body.reason, 300) || `Updated ${buildingType} facility specification`;
      const buildTimeSec = Number(body.buildTimeSec ?? baseDef.buildTimeSec);
      const maxLevel = Number(body.maxLevel ?? baseDef.maxLevel);

      if (
        !Number.isFinite(buildTimeSec) ||
        buildTimeSec < 1 ||
        buildTimeSec > 600 ||
        !Number.isFinite(maxLevel) ||
        maxLevel < 1 ||
        maxLevel > 20
      ) {
        res.status(400).json({ error: 'Invalid building buildTimeSec or maxLevel bounds.' });
        return;
      }

      const cost = {
        concrete: Math.max(0, Math.round(Number(body.cost?.concrete ?? baseDef.cost.concrete))),
        steel: Math.max(0, Math.round(Number(body.cost?.steel ?? baseDef.cost.steel))),
        aluminum: Math.max(0, Math.round(Number(body.cost?.aluminum ?? baseDef.cost.aluminum))),
        fuel: Math.max(0, Math.round(Number(body.cost?.fuel ?? baseDef.cost.fuel))),
      };

      const override: BuildingCatalogOverride = {
        type: buildingType,
        name: sanitizeText(body.name || baseDef.name, 80),
        description: sanitizeText(body.description || baseDef.description, 400),
        buildTimeSec: Math.round(buildTimeSec),
        maxLevel: Math.round(maxLevel),
        cost,
        productionBonus: body.productionBonus ?? baseDef.productionBonus,
        storageBonus: body.storageBonus ?? baseDef.storageBonus,
        defenseDamage:
          body.defenseDamage !== undefined ? Number(body.defenseDamage) : baseDef.defenseStats?.damage,
        defenseRange: body.defenseRange !== undefined ? Number(body.defenseRange) : baseDef.defenseStats?.range,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      };

      const data = gameStore.getData();
      const now = Date.now();
      data.catalogState.version += 1;
      data.catalogState.buildings[buildingType] = override;
      data.catalogState.updatedAt = now;
      data.catalogState.updatedBy = session.username;

      data.configHistory.unshift({
        version: data.catalogState.version,
        domain: 'catalog',
        timestamp: now,
        adminId: session.userId,
        adminUsername: session.username,
        reason,
        snapshot: JSON.parse(JSON.stringify(data.catalogState)),
        changesSummary: `Building ${override.name}: Build=${override.buildTimeSec}s, MaxLvl=${override.maxLevel}, Enabled=${override.enabled}`,
      });

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'catalog.building.update',
        targetType: 'catalog',
        targetId: buildingType,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      io.emit('catalog:updated', gameStore.getFullEffectiveCatalog());
      res.json({
        success: true,
        building: gameStore.getEffectiveBuildingDef(buildingType),
        catalogVersion: data.catalogState.version,
      });
    }
  );

  router.post(
    '/catalog/rollback',
    authenticateAdmin,
    requirePermission('content.publish'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const reason = sanitizeText(req.body?.reason, 300) || 'Reset unit and building catalog to factory defaults';
      const data = gameStore.getData();
      const now = Date.now();

      data.catalogState = {
        version: data.catalogState.version + 1,
        units: {},
        buildings: {},
        updatedAt: now,
        updatedBy: session.username,
      };

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'catalog.reset_defaults',
        targetType: 'catalog',
        targetId: `v${data.catalogState.version}`,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      io.emit('catalog:updated', gameStore.getFullEffectiveCatalog());
      res.json({ success: true, catalog: gameStore.getFullEffectiveCatalog() });
    }
  );

  // --------------------------------------------------------------------------
  // 7. MAP & CONTENT MANAGEMENT
  // --------------------------------------------------------------------------
  router.get(
    '/maps',
    authenticateAdmin,
    requirePermission('maps.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      res.json({
        maps: data.maps,
        activeWorldConfig: data.worldConfig,
      });
    }
  );

  router.put(
    '/maps/:id',
    authenticateAdmin,
    requirePermission('maps.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const mapId = sanitizeText(req.params.id, 64);
      const data = gameStore.getData();
      const mapEntry = data.maps.find((m) => m.id === mapId);
      if (!mapEntry) {
        res.status(404).json({ error: 'Map configuration not found.' });
        return;
      }

      const body = req.body || {};
      const seed = Number(body.seed ?? mapEntry.seed);
      const maxPlayers = Number(body.maxPlayers ?? mapEntry.maxPlayers);
      if (!Number.isFinite(seed) || seed < 1 || seed > 999999999) {
        res.status(400).json({ error: 'Map seed must be a positive integer between 1 and 999999999.' });
        return;
      }
      if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 16) {
        res.status(400).json({ error: 'maxPlayers must be between 2 and 16.' });
        return;
      }

      mapEntry.name = sanitizeText(body.name || mapEntry.name, 80);
      mapEntry.description = sanitizeText(body.description || mapEntry.description, 400);
      mapEntry.seed = Math.round(seed);
      mapEntry.maxPlayers = Math.round(maxPlayers);
      mapEntry.enabled = body.enabled !== undefined ? Boolean(body.enabled) : mapEntry.enabled;
      mapEntry.objectiveTitle = sanitizeText(body.objectiveTitle || mapEntry.objectiveTitle, 80);
      mapEntry.objectiveDescription = sanitizeText(body.objectiveDescription || mapEntry.objectiveDescription, 240);
      if (['daylight', 'golden_hour', 'overcast'].includes(body.atmospherePreset)) {
        mapEntry.atmospherePreset = body.atmospherePreset;
      }
      mapEntry.updatedAt = Date.now();
      mapEntry.updatedBy = session.username;

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'map.update',
        targetType: 'map',
        targetId: mapId,
        reason: sanitizeText(body.reason, 300) || `Updated map '${mapEntry.name}' configuration`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, map: mapEntry });
    }
  );

  router.post(
    '/maps/import',
    authenticateAdmin,
    requirePermission('maps.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const body = req.body || {};
      const name = sanitizeText(body.name, 80);
      const description = sanitizeText(body.description, 400);
      const seed = Number(body.seed);
      const width = Number(body.width || 100);
      const height = Number(body.height || 75);
      const maxPlayers = Number(body.maxPlayers || 8);

      if (!name || name.length < 3) {
        res.status(400).json({ error: 'Map name (minimum 3 characters) is required.' });
        return;
      }
      if (!Number.isFinite(seed) || seed < 1 || seed > 999999999) {
        res.status(400).json({ error: 'Valid numeric map seed is required.' });
        return;
      }
      if (width < 40 || width > 160 || height < 40 || height > 120) {
        res.status(400).json({ error: 'Map dimensions must be between 40x40 and 160x120.' });
        return;
      }

      // Dry-run world generation to verify valid spawn points & terrain passability
      const preview = generateWorld({ width, height, tileSize: 40, seed });
      if (!preview.bases || preview.bases.length < 2) {
        res.status(400).json({ error: 'Generated map failed validation: insufficient base spawn nodes.' });
        return;
      }

      const now = Date.now();
      const newMap: MapSectorConfig = {
        id: `map_custom_${now}`,
        name,
        description: description || 'Custom tactical sector imported via Admin Command Console.',
        width: Math.round(width),
        height: Math.round(height),
        tileSize: 40,
        seed: Math.round(seed),
        maxPlayers: Math.min(16, Math.max(2, Math.round(maxPlayers))),
        enabled: true,
        isActiveMap: false,
        atmospherePreset: ['daylight', 'golden_hour', 'overcast'].includes(body.atmospherePreset)
          ? body.atmospherePreset
          : 'daylight',
        objectiveTitle: sanitizeText(body.objectiveTitle || 'OPERATION CUSTOM SECTOR', 80),
        objectiveDescription: sanitizeText(
          body.objectiveDescription || 'Seize all neutral outposts and eliminate hostile command nodes.',
          240
        ),
        updatedAt: now,
        updatedBy: session.username,
      };

      const data = gameStore.getData();
      data.maps.push(newMap);
      gameStore.saveData();

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'map.import',
        targetType: 'map',
        targetId: newMap.id,
        reason: `Imported validated map sector '${newMap.name}' (Seed: ${newMap.seed})`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.status(201).json({ success: true, map: newMap, basesCount: preview.bases.length });
    }
  );

  router.get(
    '/maps/migration-preview',
    authenticateAdmin,
    requirePermission('maps.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const preview = gameStore.previewAndMigrateOverlappingBases(true);
      res.json(preview);
    }
  );

  router.post(
    '/maps/migrate-overlaps',
    authenticateAdmin,
    requirePermission('maps.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const result = gameStore.previewAndMigrateOverlappingBases(false);

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'maps.migrate_overlaps',
        targetType: 'map',
        targetId: 'all_sectors',
        reason: sanitizeText(req.body?.reason, 300) || `Relocated ${result.relocatedBases.length} overlapping base(s) to safe sector coordinates`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.json(result);
    }
  );

  router.post(
    '/maps/:id/activate',
    authenticateAdmin,
    requirePermission('maps.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const mapId = sanitizeText(req.params.id, 64);
      const data = gameStore.getData();
      const targetMap = data.maps.find((m) => m.id === mapId);
      if (!targetMap) {
        res.status(404).json({ error: 'Map not found.' });
        return;
      }
      if (!targetMap.enabled) {
        res.status(400).json({ error: 'Cannot activate a disabled map. Enable it first.' });
        return;
      }

      data.maps.forEach((m) => {
        m.isActiveMap = m.id === mapId;
      });

      const existingMapBases = data.bases.filter((b) => (b.mapId || 'map_riverfront_assault') === mapId);
      if (existingMapBases.length === 0) {
        const generated = gameSimulation.regenerateWorldWithSeed(targetMap.seed, targetMap.width, targetMap.height);
        generated.bases.forEach((b) => {
          b.mapId = mapId;
        });
        const homeBase = generated.bases[0];
        if (homeBase && !data.bases.some((b) => b.ownerId === 'player_default' && b.isHomeBase)) {
          homeBase.ownerId = 'player_default';
          homeBase.ownerName = data.users['player_default']?.profile.username || 'Commander';
          homeBase.name = 'Fortress Alpha (HQ)';
          homeBase.isHomeBase = true;
        }
        const enemyBase = generated.bases[1];
        if (enemyBase) {
          enemyBase.ownerId = 'enemy_insurgent';
          enemyBase.ownerName = 'Kodiak PMC';
          enemyBase.name = 'Kodiak Stronghold';
        }
        data.bases.push(...generated.bases);
      } else {
        // Ensure terrain cache is initialized for the activated map without wiping existing bases
        gameSimulation.getTerrain(mapId);
      }
      gameStore.saveData();

      io.emit('world:state', {
        bases: data.bases,
        units: data.units,
        envObjects: data.envObjects,
        alliances: data.alliances,
        chat: data.chat.filter((c) => c.channel !== 'alliance').slice(-50),
        onlineUserIds: Array.from(new Set(onlineSockets.values())),
        timestamp: Date.now(),
      });

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'map.activate',
        targetType: 'map',
        targetId: mapId,
        reason: sanitizeText(req.body?.reason, 300) || `Activated sector map '${targetMap.name}'`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, activeMap: targetMap });
    }
  );

  // --------------------------------------------------------------------------
  // 8. ANNOUNCEMENTS & BROADCAST NOTIFICATIONS
  // --------------------------------------------------------------------------
  router.get(
    '/announcements',
    authenticateAdmin,
    requirePermission('dashboard.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      res.json({ announcements: data.announcements });
    }
  );

  router.post(
    '/announcements',
    authenticateAdmin,
    requirePermission('announcements.manage'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const title = sanitizeText(req.body?.title, 100);
      const message = sanitizeText(req.body?.message, 500);
      const priority = (['info', 'warning', 'critical'].includes(req.body?.priority)
        ? req.body.priority
        : 'info') as AnnouncementPriority;
      const published = req.body?.published !== undefined ? Boolean(req.body.published) : true;
      const expiresAt = req.body?.expiresAt ? Number(req.body.expiresAt) : null;

      if (!title || !message) {
        res.status(400).json({ error: 'Announcement title and message are required.' });
        return;
      }

      const now = Date.now();
      const ann = {
        id: `ann_${now}_${Math.random().toString(36).substring(2, 6)}`,
        title,
        message,
        priority,
        published,
        startsAt: now,
        expiresAt,
        createdBy: session.userId,
        createdByUsername: session.username,
        createdAt: now,
        updatedAt: now,
      };

      const data = gameStore.getData();
      data.announcements.unshift(ann);

      if (published) {
        const sysChat = {
          id: `chat_ann_${now}`,
          senderId: 'system',
          senderName: `HIGH COMMAND [${priority.toUpperCase()}]`,
          channel: 'system' as const,
          content: `${title}: ${message}`,
          timestamp: now,
        };
        data.chat.push(sysChat);
        io.emit('chat:message', sysChat);
        io.emit('notification:new', {
          id: `notif_ann_${now}`,
          userId: 'all',
          type: 'system',
          title: `[${priority.toUpperCase()}] ${title}`,
          message,
          timestamp: now,
          read: false,
        });
      }

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'announcement.create',
        targetType: 'announcement',
        targetId: ann.id,
        reason: `Published ${priority} announcement: ${title}`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.status(201).json({ success: true, announcement: ann });
    }
  );

  router.put(
    '/announcements/:id',
    authenticateAdmin,
    requirePermission('announcements.manage'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const id = sanitizeText(req.params.id, 64);
      const data = gameStore.getData();
      const ann = data.announcements.find((a) => a.id === id);
      if (!ann) {
        res.status(404).json({ error: 'Announcement not found.' });
        return;
      }

      if (req.body?.title !== undefined) ann.title = sanitizeText(req.body.title, 100);
      if (req.body?.message !== undefined) ann.message = sanitizeText(req.body.message, 500);
      if (['info', 'warning', 'critical'].includes(req.body?.priority)) ann.priority = req.body.priority;
      if (req.body?.published !== undefined) ann.published = Boolean(req.body.published);
      ann.updatedAt = Date.now();

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'announcement.update',
        targetType: 'announcement',
        targetId: ann.id,
        reason: `Updated announcement '${ann.title}' (published=${ann.published})`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, announcement: ann });
    }
  );

  router.delete(
    '/announcements/:id',
    authenticateAdmin,
    requirePermission('announcements.manage'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const id = sanitizeText(req.params.id, 64);
      const data = gameStore.getData();
      const idx = data.announcements.findIndex((a) => a.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Announcement not found.' });
        return;
      }
      const removed = data.announcements.splice(idx, 1)[0];
      gameStore.saveData();

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'announcement.delete',
        targetType: 'announcement',
        targetId: id,
        reason: `Deleted announcement '${removed.title}'`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.json({ success: true });
    }
  );

  // --------------------------------------------------------------------------
  // 9. SECURITY & AUDIT LOGS
  // --------------------------------------------------------------------------
  router.get(
    '/audit-logs',
    authenticateAdmin,
    requirePermission('audit.view'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      const search = sanitizeText(req.query.search, 100).toLowerCase();
      const targetType = sanitizeText(req.query.targetType, 32);
      const status = sanitizeText(req.query.status, 32);
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '25'), 10) || 25));

      let logs = data.auditLogs;
      if (search) {
        logs = logs.filter(
          (l) =>
            l.action.toLowerCase().includes(search) ||
            l.adminUsername.toLowerCase().includes(search) ||
            l.targetId.toLowerCase().includes(search) ||
            l.reason.toLowerCase().includes(search)
        );
      }
      if (targetType && targetType !== 'all') {
        logs = logs.filter((l) => l.targetType === targetType);
      }
      if (status && status !== 'all') {
        logs = logs.filter((l) => l.status === status);
      }

      const total = logs.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const items = logs.slice((page - 1) * pageSize, page * pageSize);

      res.json({
        items,
        pagination: { page, pageSize, total, totalPages },
      });
    }
  );

  // --------------------------------------------------------------------------
  // 10. ADMINISTRATORS & RBAC ROLE MANAGEMENT (SUPER_ADMIN ONLY)
  // --------------------------------------------------------------------------
  router.get(
    '/administrators',
    authenticateAdmin,
    requirePermission('admins.manage'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      const data = gameStore.getData();
      const admins = Object.values(data.users)
        .filter((u) => Boolean(u.profile.adminRole || u.profile.isAdmin))
        .map((u) => gameStore.sanitizeProfile(u.profile));

      res.json({
        administrators: admins,
        activeSessions: gameStore.listActiveAdminSessions(),
        rolePermissionsMatrix: ROLE_PERMISSIONS,
      });
    }
  );

  router.post(
    '/administrators/role',
    authenticateAdmin,
    requirePermission('admins.manage'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const targetUserId = sanitizeText(req.body?.userId, 64);
      const newRole = req.body?.role === null ? null : (sanitizeText(req.body?.role, 32) as AdminRole | null);
      const reason = sanitizeText(req.body?.reason, 300);

      if (!reason || reason.length < 3) {
        res.status(400).json({ error: 'A mandatory reason is required for administrator role changes.' });
        return;
      }

      if (newRole !== null && !['super_admin', 'game_admin', 'moderator', 'analyst'].includes(newRole)) {
        res.status(400).json({ error: 'Invalid admin role specified.' });
        return;
      }

      // Prevent self-demotion from super_admin to avoid locking out the system
      if (targetUserId === session.userId && newRole !== 'super_admin') {
        res.status(400).json({ error: 'Cannot demote your own Super Admin account.' });
        return;
      }

      const data = gameStore.getData();
      const targetUser = data.users[targetUserId];
      if (!targetUser) {
        res.status(404).json({ error: 'Target user account not found.' });
        return;
      }

      const oldRole = targetUser.profile.adminRole || null;
      targetUser.profile.adminRole = newRole;
      targetUser.profile.isAdmin = Boolean(newRole);

      if (!newRole) {
        gameStore.revokeUserSessions(targetUserId);
      }

      gameStore.saveData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'admin.role_change',
        targetType: 'admin',
        targetId: targetUserId,
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
        metadata: { oldRole, newRole },
      });

      res.json({
        success: true,
        profile: gameStore.sanitizeProfile(targetUser.profile),
      });
    }
  );

  router.delete(
    '/administrators/sessions/:tokenPrefix',
    authenticateAdmin,
    requirePermission('admins.manage'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const prefix = sanitizeText(req.params.tokenPrefix, 32).replace('...', '');
      const data = gameStore.getData();

      let revokedCount = 0;
      for (const tok of Object.keys(data.adminSessions)) {
        if (tok.startsWith(prefix)) {
          delete data.adminSessions[tok];
          revokedCount += 1;
        }
      }
      gameStore.saveData();

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'admin.session.revoke',
        targetType: 'admin',
        targetId: prefix,
        reason: 'Manually revoked admin session token',
        status: 'success',
        ipAddress: getClientIp(req),
        metadata: { revokedCount },
      });

      res.json({ success: true, revokedCount });
    }
  );

  // --------------------------------------------------------------------------
  // 11. SYSTEM SETTINGS & FEATURE FLAGS
  // --------------------------------------------------------------------------
  router.get(
    '/settings',
    authenticateAdmin,
    requirePermission('dashboard.view'),
    (_req: AuthenticatedAdminRequest, res: Response) => {
      res.json({ settings: gameStore.getSystemSettings() });
    }
  );

  router.put(
    '/settings',
    authenticateAdmin,
    requirePermission('economy.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const body = req.body || {};
      const reason = sanitizeText(body.reason, 300) || 'Updated system operational settings';
      const settings = gameStore.getSystemSettings();

      if (body.gameTitle !== undefined) settings.gameTitle = sanitizeText(body.gameTitle, 80);
      if (body.maintenanceMode !== undefined) settings.maintenanceMode = Boolean(body.maintenanceMode);
      if (body.maintenanceMessage !== undefined) {
        settings.maintenanceMessage = sanitizeText(body.maintenanceMessage, 300);
      }
      if (body.fogOfWarEnforced !== undefined) settings.fogOfWarEnforced = Boolean(body.fogOfWarEnforced);
      if (body.alliancesEnabled !== undefined) settings.alliancesEnabled = Boolean(body.alliancesEnabled);
      if (body.aiAggressionEnabled !== undefined) settings.aiAggressionEnabled = Boolean(body.aiAggressionEnabled);
      if (body.allowNewRegistrations !== undefined) {
        settings.allowNewRegistrations = Boolean(body.allowNewRegistrations);
      }
      if (body.sessionTtlMs !== undefined) {
        const ttl = Number(body.sessionTtlMs);
        if (Number.isFinite(ttl) && ttl >= 300000 && ttl <= 86400000 * 7) {
          settings.sessionTtlMs = Math.round(ttl);
        }
      }

      settings.updatedAt = Date.now();
      settings.updatedBy = session.username;
      gameStore.saveData();

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'system.settings.update',
        targetType: 'system',
        targetId: 'global_settings',
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
        metadata: {
          maintenanceMode: settings.maintenanceMode,
          aiAggressionEnabled: settings.aiAggressionEnabled,
        },
      });

      io.emit('system:settings', settings);
      res.json({ success: true, settings });
    }
  );

  // --------------------------------------------------------------------------
  // 12. SECURED SANDBOX TOOLS (SPAWN UNIT / BOOST RESOURCES)
  // --------------------------------------------------------------------------
  router.post(
    '/spawn_unit',
    authenticateAdmin,
    requirePermission('matches.terminate'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const { unitType, x, y, ownerId } = req.body || {};
      const data = gameStore.getData();
      const uDef = gameStore.getEffectiveUnitDef(unitType as UnitType);
      if (!uDef) {
        res.status(400).json({ error: 'Invalid unitType' });
        return;
      }

      const terrain = gameSimulation.getTerrain();
      let spawnX = Number(x) || 20;
      let spawnY = Number(y) || 28;
      if (!isCellPassable(terrain, Math.round(spawnX), Math.round(spawnY), uDef.category)) {
        let found = false;
        for (let r = 1; r <= 12 && !found; r++) {
          for (let a = 0; a < 16 && !found; a++) {
            const ang = (a / 16) * Math.PI * 2;
            const tx = Math.round(spawnX + Math.cos(ang) * r);
            const ty = Math.round(spawnY + Math.sin(ang) * r);
            if (isCellPassable(terrain, tx, ty, uDef.category)) {
              spawnX = tx;
              spawnY = ty;
              found = true;
            }
          }
        }
      }

      const targetOwnerId = ownerId || 'player_default';
      const newUnit = {
        id: `unit_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: unitType as UnitType,
        ownerId: targetOwnerId,
        ownerName: targetOwnerId === 'enemy_insurgent' ? 'Kodiak PMC' : session.username,
        allianceId: targetOwnerId === 'player_default' ? 'alliance_vanguard' : null,
        x: spawnX,
        y: spawnY,
        rotation: 0,
        health: uDef.maxHealth,
        maxHealth: uDef.maxHealth,
        command: 'idle' as const,
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: data.bases[0]?.id || 'base_home_player',
      };

      data.units.push(newUnit);
      gameStore.saveData();
      io.emit('unit:spawn', newUnit);

      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'sandbox.spawn_unit',
        targetType: 'match',
        targetId: newUnit.id,
        reason: `Spawned ${uDef.name} at (${spawnX}, ${spawnY}) for ${targetOwnerId}`,
        status: 'success',
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, unit: newUnit });
    }
  );

  router.post(
    '/boost_resources',
    authenticateAdmin,
    requirePermission('economy.edit'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const { baseId, amount } = req.body || {};
      const data = gameStore.getData();
      const base = data.bases.find((b) => b.id === baseId) || data.bases[0];
      const add = Math.min(500000, Math.max(100, Number(amount) || 5000));

      if (base) {
        base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + add);
        base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + add);
        base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + add);
        base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + add);
        gameStore.saveData();
        io.emit('world:sync', { units: data.units, bases: data.bases, timestamp: Date.now() });

        gameStore.addAuditLog({
          adminId: session.userId,
          adminUsername: session.username,
          adminRole: session.role,
          action: 'sandbox.boost_resources',
          targetType: 'economy',
          targetId: base.id,
          reason: `Granted +${add} resources to base '${base.name}'`,
          status: 'success',
          ipAddress: getClientIp(req),
        });
      }

      res.json({ success: true, base });
    }
  );

  // --------------------------------------------------------------------------
  // 13. DURABLE STORAGE, BACKUP & RECOVERY (CLOUD SQL POSTGRESQL + SNAPSHOT)
  // --------------------------------------------------------------------------
  router.get(
    '/storage-status',
    authenticateAdmin,
    requirePermission('dashboard.view'),
    async (_req: AuthenticatedAdminRequest, res: Response) => {
      const status = await gameStore.getStorageStatus();
      res.json(status);
    }
  );

  router.post(
    '/backup',
    authenticateAdmin,
    requirePermission('admins.manage'),
    async (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      await gameStore.syncToDatabaseNow();
      const snapshot = gameStore.exportBackupSnapshot();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'storage.backup.export',
        targetType: 'system',
        targetId: 'database_snapshot',
        reason: 'Exported full durable game-state backup snapshot',
        status: 'success',
        ipAddress: getClientIp(req),
      });
      res.json({ success: true, snapshot });
    }
  );

  router.post(
    '/restore',
    authenticateAdmin,
    requirePermission('admins.manage'),
    async (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const result = await gameStore.importBackupSnapshot(req.body?.snapshot || req.body);
      if (!result.success) {
        res.status(400).json({ error: result.message });
        return;
      }
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'storage.backup.restore',
        targetType: 'system',
        targetId: 'database_snapshot',
        reason: sanitizeText(req.body?.reason, 300) || 'Restored game state from backup snapshot',
        status: 'success',
        ipAddress: getClientIp(req),
      });
      gameSimulation.broadcastWorldSync();
      res.json(result);
    }
  );

  router.post(
    '/system/reset',
    authenticateAdmin,
    requirePermission('admins.manage'),
    (req: AuthenticatedAdminRequest, res: Response) => {
      const session = req.adminSession!;
      const confirmed =
        req.body?.confirm === true ||
        req.body?.confirmReset === 'RESET_ALL_DATA' ||
        req.body?.confirmation === 'RESET_ALL_DATA';
      const reason = sanitizeText(req.body?.reason, 300);
      if (!confirmed || !reason || reason.length < 3) {
        res.status(400).json({
          error:
            'WARNING: Full system reset is destructive and irreversible. You must provide explicit confirmation (confirm: true or confirmReset: "RESET_ALL_DATA") and a valid audit reason (minimum 3 characters).',
        });
        return;
      }
      gameStore.resetAllData();
      gameStore.addAuditLog({
        adminId: session.userId,
        adminUsername: session.username,
        adminRole: session.role,
        action: 'system.reset_all_data',
        targetType: 'system',
        targetId: 'all',
        reason,
        status: 'success',
        ipAddress: getClientIp(req),
      });
      gameSimulation.broadcastWorldSync();
      res.json({ success: true, message: 'All users, bases, units, and persistent records have been successfully reset.' });
    }
  );

  return router;
}
