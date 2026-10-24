import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  AIDifficulty,
  AchievementProgress,
  AdminPlayerRecord,
  AdminRole,
  AdminSessionInfo,
  Alliance,
  AllianceRecruitmentMode,
  AllianceRole,
  Announcement,
  AuditLogEntry,
  Base,
  BaseType,
  BattleReport,
  BotAgentRecord,
  BuildingDefinition,
  BuildingType,
  CatalogConfigState,
  ChatMessage,
  ConfigVersionEntry,
  ControlSource,
  EconomyConfig,
  EnvironmentObject,
  GameNotification,
  HighwayExit,
  MapSectorConfig,
  MatchParticipantSummary,
  MatchRecord,
  MissionProgress,
  ModerationRecord,
  PlayerProfile,
  PlayerType,
  PlayerTypeStatsSummary,
  SupportTicket,
  SystemEntityRecord,
  SystemSettings,
  Unit,
  UnitDefinition,
  UnitType,
  VerificationStatus,
} from '../src/types/game';
import { BASE_RESOURCE_CAP, BUILDING_CATALOG, STARTER_RESOURCES, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { isCellPassable } from '../src/game/pathfinder';
import {
  isPostgresConfigured,
  loadStateFromPostgres,
  persistAllianceTransaction,
  persistBaseAndUnitsTransaction,
  persistUserTransaction,
  syncStateToPostgres,
  verifyPostgresConnection,
} from '../src/db/repository.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'gamestate.json');

export interface AdminSessionRecord {
  token: string;
  userId: string;
  username: string;
  role: AdminRole;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  ipAddress: string;
}

export interface PersistentData {
  users: Record<
    string,
    {
      passwordHash: string;
      profile: PlayerProfile;
    }
  >;
  tokens: Record<string, string>; // token -> userId
  adminSessions: Record<string, AdminSessionRecord>;
  bases: Base[];
  units: Unit[];
  envObjects: EnvironmentObject[];
  envObjectsByMap?: Record<string, EnvironmentObject[]>;
  alliances: Alliance[];
  chat: ChatMessage[];
  notifications: GameNotification[];
  battleReports?: BattleReport[];
  supportTickets?: SupportTicket[];
  exploredByUserMap?: Record<string, Record<string, number[]>>;
  worldConfig: {
    width: number;
    height: number;
    tileSize: number;
    seed: number;
  };
  economyConfig: EconomyConfig;
  configHistory: ConfigVersionEntry[];
  catalogState: CatalogConfigState;
  maps: MapSectorConfig[];
  announcements: Announcement[];
  auditLogs: AuditLogEntry[];
  matches: MatchRecord[];
  systemSettings: SystemSettings;
  botRegistry?: Record<string, BotAgentRecord>;
  systemEntities?: Record<string, SystemEntityRecord>;
  accountsPurged?: boolean;
}

export function createDefaultEconomyConfig(): EconomyConfig {
  return {
    version: 1,
    resourceGenerationMultiplier: 1.0,
    baseGenerationRates: {
      concrete: 2.5,
      steel: 2.5,
      aluminum: 1.5,
      fuel: 2.0,
    },
    startingResources: { ...STARTER_RESOURCES },
    baseStorageCap: { ...BASE_RESOURCE_CAP },
    unitCostMultiplier: 1.0,
    buildingCostMultiplier: 1.0,
    unitProductionSpeedMultiplier: 1.0,
    buildingBuildSpeedMultiplier: 1.0,
    populationCapPerBase: 30,
    maxGlobalUnits: 450,
    maxUnitsPerMap: 160,
    maxBasesPerPlayerOnMap: 6,
    maxBuildingsPerBase: 16,
    maxSelectionGroupSize: 24,
    fuelTravelCostMultiplier: 1.0,
    captureSpeedPerTick: 5,
    minBaseSpawnDistance: 5,
    homeBaseProtectionDurationHours: 48,
    rebuildProtectionDurationMinutes: 30,
    homeBaseArmorMultiplier: 3.0,
    productionDestroyPercentOnNeutralize: 50,
    destroyMaxCapBuildingsOnNeutralize: true,
    newbaseMaxOwnedBasesThreshold: 2,
    newbaseMaxWeeklyCapturesThreshold: 2,
    newbaseProtectionDurationHours: 72,
    weeklyCaptureLimitPerPlayer: 10,
    inactivityEvictionDays: 14,
    spawnMapFallbackPolicy: 'next_eligible_map',
    conquestUnitTypes: ['dominator_conquest'],
    updatedAt: Date.now(),
    updatedBy: 'System Bootstrap',
  };
}

export function createDefaultSystemSettings(): SystemSettings {
  const ttlEnv = parseInt(process.env.ADMIN_SESSION_TTL_MS || '28800000', 10);
  return {
    gameTitle: 'Frontline Dominion: Riverfront Assault',
    gameVersion: 'v3.0.0-MULTI-SECTOR',
    maintenanceMode: false,
    maintenanceMessage: 'Scheduled tactical server maintenance in progress. Operations will resume shortly.',
    fogOfWarEnforced: false,
    alliancesEnabled: true,
    aiAggressionEnabled: true,
    allowNewRegistrations: true,
    sessionTtlMs: Number.isFinite(ttlEnv) && ttlEnv >= 60000 ? ttlEnv : 28800000,
    updatedAt: Date.now(),
    updatedBy: 'System Bootstrap',
  };
}

export function createDefaultHighwayExits(mapId: string): HighwayExit[] {
  if (mapId === 'map_riverfront_assault') {
    return [
      {
        id: 'exit_s1_to_s2',
        name: 'Highway North -> Sector 02 (Iron Ridge)',
        x: 50,
        y: 4,
        radius: 6,
        targetMapId: 'map_iron_ridge_corridor',
        targetMapName: 'Sector 02: Iron Ridge Rail Corridor',
        entryX: 50,
        entryY: 68,
        fuelCostPerUnit: 25,
        allowedCategories: ['ground', 'air', 'rail'],
      },
      {
        id: 'exit_s1_to_s3',
        name: 'Littoral Highway East -> Sector 03 (Bastion Delta)',
        x: 94,
        y: 38,
        radius: 6,
        targetMapId: 'map_archipelago_bastion',
        targetMapName: 'Sector 03: Littoral Bastion Delta',
        entryX: 8,
        entryY: 38,
        fuelCostPerUnit: 30,
        allowedCategories: ['ground', 'air', 'naval'],
      },
    ];
  }
  if (mapId === 'map_iron_ridge_corridor') {
    return [
      {
        id: 'exit_s2_to_s1',
        name: 'Highway South -> Sector 01 (Riverfront)',
        x: 50,
        y: 70,
        radius: 6,
        targetMapId: 'map_riverfront_assault',
        targetMapName: 'Sector 01: Riverfront Assault',
        entryX: 50,
        entryY: 7,
        fuelCostPerUnit: 25,
        allowedCategories: ['ground', 'air', 'rail'],
      },
      {
        id: 'exit_s2_to_s3',
        name: 'Eastern Pass -> Sector 03 (Bastion Delta)',
        x: 94,
        y: 38,
        radius: 6,
        targetMapId: 'map_archipelago_bastion',
        targetMapName: 'Sector 03: Littoral Bastion Delta',
        entryX: 50,
        entryY: 7,
        fuelCostPerUnit: 30,
        allowedCategories: ['ground', 'air'],
      },
    ];
  }
  return [
    {
      id: 'exit_s3_to_s1',
      name: 'Coastal Highway West -> Sector 01 (Riverfront)',
      x: 6,
      y: 38,
      radius: 6,
      targetMapId: 'map_riverfront_assault',
      targetMapName: 'Sector 01: Riverfront Assault',
      entryX: 90,
      entryY: 38,
      fuelCostPerUnit: 30,
      allowedCategories: ['ground', 'air', 'naval'],
    },
    {
      id: 'exit_s3_to_s2',
      name: 'Alpine Express North -> Sector 02 (Iron Ridge)',
      x: 50,
      y: 4,
      radius: 6,
      targetMapId: 'map_iron_ridge_corridor',
      targetMapName: 'Sector 02: Iron Ridge Rail Corridor',
      entryX: 90,
      entryY: 38,
      fuelCostPerUnit: 30,
      allowedCategories: ['ground', 'air'],
    },
  ];
}

export function createDefaultMaps(): MapSectorConfig[] {
  const now = Date.now();
  return [
    {
      id: 'map_riverfront_assault',
      name: 'Sector 01: Riverfront Assault',
      description:
        'Primary contested river valley featuring three fortified highway/rail bridgeheads, littoral naval corridors, and Kodiak PMC stronghold.',
      width: 100,
      height: 75,
      tileSize: 40,
      seed: 202610,
      maxPlayers: 24,
      maxUnitsOnMap: 160,
      maxBasesPerPlayer: 6,
      maxPopPerPlayer: 120,
      highwayExits: createDefaultHighwayExits('map_riverfront_assault'),
      enabled: true,
      isActiveMap: true,
      atmospherePreset: 'daylight',
      objectiveTitle: 'OPERATION RIVERFRONT ASSAULT',
      objectiveDescription: 'Secure River Bridges & Seize Kodiak Stronghold',
      updatedAt: now,
      updatedBy: 'System Bootstrap',
    },
    {
      id: 'map_iron_ridge_corridor',
      name: 'Sector 02: Iron Ridge Rail Corridor',
      description:
        'High-altitude alpine industrial pass dominated by double-track armored train arteries and heavy artillery plateaus.',
      width: 100,
      height: 75,
      tileSize: 40,
      seed: 441892,
      maxPlayers: 24,
      maxUnitsOnMap: 140,
      maxBasesPerPlayer: 5,
      maxPopPerPlayer: 100,
      highwayExits: createDefaultHighwayExits('map_iron_ridge_corridor'),
      enabled: true,
      isActiveMap: true,
      atmospherePreset: 'golden_hour',
      objectiveTitle: 'OPERATION IRON RIDGE',
      objectiveDescription: 'Control Central Rail Depot & Northern Refinery',
      updatedAt: now,
      updatedBy: 'System Bootstrap',
    },
    {
      id: 'map_archipelago_bastion',
      name: 'Sector 03: Littoral Bastion Delta',
      description:
        'Coastal delta with deep-water destroyer channels, amphibious landing zones, and radar island chains.',
      width: 100,
      height: 75,
      tileSize: 40,
      seed: 883104,
      maxPlayers: 24,
      maxUnitsOnMap: 160,
      maxBasesPerPlayer: 6,
      maxPopPerPlayer: 120,
      highwayExits: createDefaultHighwayExits('map_archipelago_bastion'),
      enabled: true,
      isActiveMap: true,
      atmospherePreset: 'overcast',
      objectiveTitle: 'OPERATION TRIDENT DELTA',
      objectiveDescription: 'Establish Naval Superiority & Capture Harbor Drydocks',
      updatedAt: now,
      updatedBy: 'System Bootstrap',
    },
  ];
}

export function calculateRankFromScore(score: number): { level: number; rank: string } {
  const level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, score) / 35)) + 1);
  if (level >= 15) return { level, rank: 'Supreme Theater Marshal' };
  if (level >= 12) return { level, rank: 'Supreme Commander' };
  if (level >= 9) return { level, rank: 'Theater Operations Director' };
  if (level >= 7) return { level, rank: 'Armored Battalion Cmdr' };
  if (level >= 5) return { level, rank: 'Major' };
  if (level >= 3) return { level, rank: 'Captain' };
  if (level >= 2) return { level, rank: 'Field Lieutenant' };
  return { level, rank: 'Second Lieutenant' };
}

export class GameStore {
  private data: PersistentData;
  private startTime: number = Date.now();
  private activeLocks = new Set<string>();
  private postgresInitialized = false;
  private isPostgresSyncing = false;
  private lastPostgresSyncAt = 0;
  private reservedSpawns = new Map<string, { mapId: string; x: number; y: number; radius: number; expiresAt: number }>();
  private terrainByMap = new Map<string, any[][]>();

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.data = this.loadOrInit();
    // Trigger non-blocking Cloud SQL PostgreSQL hydration/sync
    void this.initPostgresLayer();
  }

  public getUptimeMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Acquires an atomic per-key lock to prevent duplicate resource deductions or simultaneous conflicting mutations.
   */
  public acquireLock(key: string): boolean {
    if (this.activeLocks.has(key)) return false;
    this.activeLocks.add(key);
    return true;
  }

  public releaseLock(key: string): void {
    this.activeLocks.delete(key);
  }

  public withLock<T>(key: string, fn: () => T): { locked: boolean; result?: T } {
    if (!this.acquireLock(key)) {
      return { locked: false };
    }
    try {
      return { locked: true, result: fn() };
    } finally {
      this.releaseLock(key);
    }
  }

  private isSavingFile = false;

  private async initPostgresLayer(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (!isPostgresConfigured()) return;
    try {
      const bootTime = this.startTime;
      const existing = await loadStateFromPostgres();
      if (existing && (existing.bases.length > 0 || existing.maps.length > 0)) {
        const pgPurged = Boolean(existing.kv.accountsPurged || this.data.accountsPurged);
        if (pgPurged) {
          this.data.accountsPurged = true;
          // Preserve any newly registered users created in-memory after server boot
          const newInMemoryUsers: typeof this.data.users = {};
          for (const [uid, rec] of Object.entries(this.data.users)) {
            if ((rec.profile?.joinedAt || 0) >= bootTime) {
              newInMemoryUsers[uid] = rec;
            }
          }
          this.data.users = { ...existing.users, ...newInMemoryUsers };
          this.data.tokens = { ...existing.tokens, ...this.data.tokens };
          this.data.adminSessions = { ...existing.adminSessions, ...this.data.adminSessions };
        } else {
          // Merge PostgreSQL durable state with in-memory state, keeping newer user records
          const mergedUsers: typeof this.data.users = { ...existing.users };
          for (const [uid, memUser] of Object.entries(this.data.users)) {
            const pgUser = mergedUsers[uid];
            const memTs = Math.max(
              memUser.profile?.lastActiveAt || 0,
              memUser.profile?.lastLoginAt || 0,
              memUser.profile?.joinedAt || 0
            );
            const pgTs = Math.max(
              pgUser?.profile?.lastActiveAt || 0,
              pgUser?.profile?.lastLoginAt || 0,
              pgUser?.profile?.joinedAt || 0
            );
            if (!pgUser || memTs >= pgTs) {
              mergedUsers[uid] = memUser;
            }
          }
          this.data.users = mergedUsers;
          this.data.tokens = { ...existing.tokens, ...this.data.tokens };
          this.data.adminSessions = { ...existing.adminSessions, ...this.data.adminSessions };
        }

        if (existing.bases.length > 0) {
          const baseMap = new Map<string, Base>();
          for (const pgBase of existing.bases) {
            baseMap.set(pgBase.id, pgBase);
          }
          for (const memBase of this.data.bases) {
            const pgBase = baseMap.get(memBase.id);
            if (
              !pgBase ||
              (memBase.lastResourceUpdate || 0) >= (pgBase.lastResourceUpdate || 0) ||
              (memBase.lastMeaningfulActivityAt || 0) >= bootTime
            ) {
              baseMap.set(memBase.id, memBase);
            }
          }
          this.data.bases = Array.from(baseMap.values());
        }

        if (existing.units.length > 0) {
          const unitMap = new Map<string, Unit>();
          for (const pgUnit of existing.units) {
            unitMap.set(pgUnit.id, pgUnit);
          }
          for (const memUnit of this.data.units) {
            if (!unitMap.has(memUnit.id) || (memUnit.lastAttackTime || 0) >= bootTime) {
              unitMap.set(memUnit.id, memUnit);
            }
          }
          this.data.units = Array.from(unitMap.values());
        }

        if (existing.alliances.length > 0) {
          const allianceMap = new Map<string, Alliance>();
          for (const a of existing.alliances) allianceMap.set(a.id, a);
          for (const a of this.data.alliances) {
            if (!allianceMap.has(a.id) || (a.createdTime || 0) >= bootTime) {
              allianceMap.set(a.id, a);
            }
          }
          this.data.alliances = Array.from(allianceMap.values());
        }
        if (existing.maps.length > 0) this.data.maps = existing.maps;
        if (Object.keys(existing.envObjectsByMap).length > 0) {
          this.data.envObjectsByMap = existing.envObjectsByMap;
        }
        if (existing.chat.length > 0) this.data.chat = existing.chat;
        if (existing.battleReports.length > 0) this.data.battleReports = existing.battleReports;
        if (existing.kv.economyConfig) this.data.economyConfig = existing.kv.economyConfig;
        if (existing.kv.catalogState) this.data.catalogState = existing.kv.catalogState;
        if (existing.kv.systemSettings) this.data.systemSettings = existing.kv.systemSettings;
        if (existing.kv.configHistory) this.data.configHistory = existing.kv.configHistory;
        if (existing.kv.announcements) this.data.announcements = existing.kv.announcements;
        if (existing.kv.auditLogs) this.data.auditLogs = existing.kv.auditLogs;
        if (existing.kv.matches) this.data.matches = existing.kv.matches;
        if (existing.kv.supportTickets) this.data.supportTickets = existing.kv.supportTickets;
        if (existing.kv.exploredByUserMap) this.data.exploredByUserMap = existing.kv.exploredByUserMap;
        if (existing.kv.botRegistry) this.data.botRegistry = existing.kv.botRegistry;
        if (existing.kv.systemEntities) this.data.systemEntities = existing.kv.systemEntities;

        this.data = this.migrateData(this.data);
      }
      await this.syncToDatabaseNow();
      this.postgresInitialized = true;
    } catch (err) {
      console.error('Database Error in initPostgresLayer:', err);
    }
  }

  public async syncToDatabaseNow(): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    if (!isPostgresConfigured() || this.isPostgresSyncing) return false;
    this.isPostgresSyncing = true;
    try {
      const ok = await syncStateToPostgres({
        users: this.data.users,
        tokens: this.data.tokens,
        adminSessions: this.data.adminSessions,
        maps: this.data.maps,
        envObjectsByMap: this.data.envObjectsByMap || { map_riverfront_assault: this.data.envObjects },
        bases: this.data.bases,
        units: this.data.units,
        alliances: this.data.alliances,
        chat: this.data.chat,
        battleReports: this.data.battleReports || [],
        kv: {
          economyConfig: this.data.economyConfig,
          catalogState: this.data.catalogState,
          systemSettings: this.data.systemSettings,
          configHistory: this.data.configHistory,
          announcements: this.data.announcements,
          auditLogs: this.data.auditLogs,
          matches: this.data.matches,
          supportTickets: this.data.supportTickets || [],
          exploredByUserMap: this.data.exploredByUserMap || {},
          botRegistry: this.data.botRegistry || {},
          systemEntities: this.data.systemEntities || {},
          accountsPurged: Boolean(this.data.accountsPurged),
        },
      });
      if (ok) {
        this.lastPostgresSyncAt = Date.now();
        this.postgresInitialized = true;
      }
      return ok;
    } finally {
      this.isPostgresSyncing = false;
    }
  }

  public async getStorageStatus() {
    const pgStatus = await verifyPostgresConnection();
    return {
      engine: pgStatus.connected ? 'Cloud SQL PostgreSQL + JSON Snapshot' : 'Local JSON Snapshot',
      postgresConnected: pgStatus.connected,
      postgresInitialized: this.postgresInitialized,
      lastPostgresSyncAt: this.lastPostgresSyncAt,
      tablesCount: pgStatus.tablesCount,
      usersCount: Object.keys(this.data.users).length,
      basesCount: this.data.bases.length,
      unitsCount: this.data.units.length,
      mapsCount: this.data.maps.length,
      alliancesCount: this.data.alliances.length,
      battleReportsCount: (this.data.battleReports || []).length,
    };
  }

  public exportBackupSnapshot() {
    return {
      exportedAt: Date.now(),
      version: '3.0.0-MULTI-SECTOR',
      data: JSON.parse(JSON.stringify(this.data)),
    };
  }

  public async importBackupSnapshot(snapshotData: any): Promise<{ success: boolean; message: string }> {
    const rawData = snapshotData?.data || snapshotData;
    if (!rawData || typeof rawData !== 'object' || !rawData.users || !Array.isArray(rawData.bases)) {
      return { success: false, message: 'Invalid backup snapshot structure' };
    }
    this.data = this.migrateData(rawData);
    this.saveData(this.data);
    await this.syncToDatabaseNow();
    return { success: true, message: 'Backup snapshot restored and synchronized to PostgreSQL' };
  }

  private resolveBootstrapSecret(envKey: string, nonProdFallback: string): string {
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv && fromEnv.length >= 8) {
      return fromEnv;
    }
    if (process.env.NODE_ENV === 'production') {
      const generated = crypto.randomBytes(18).toString('hex');
      console.warn(
        `[Security] ${envKey} not configured in production environment; generated strong ephemeral bootstrap credential.`
      );
      return generated;
    }
    return nonProdFallback;
  }

  private ensureAdminBootstrapUsers(data: PersistentData) {
    if (data.accountsPurged) {
      return;
    }
    const now = Date.now();
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || 'Commander';
    const bootstrapPassword = this.resolveBootstrapSecret('ADMIN_BOOTSTRAP_PASSWORD', 'admin123');

    if (data.users['player_default']) {
      const p = data.users['player_default'].profile;
      p.isAdmin = true;
      p.adminRole = p.adminRole || 'super_admin';
      p.status = p.status || 'active';
      p.moderationHistory = p.moderationHistory || [];
      p.currentMapId = p.currentMapId || 'map_riverfront_assault';
      p.claimedRewardIds = p.claimedRewardIds || [];
      p.highwayTransfersCompleted = p.highwayTransfersCompleted || 0;
      p.playerType = 'human';
      p.accountId = 'player_default';
      p.botAgentId = null;
      p.controlSource = 'human';
      p.verificationStatus = 'verified';
    }

    const staffAccounts: Array<{
      id: string;
      username: string;
      email: string;
      rank: string;
      role: AdminRole;
      score: number;
      level: number;
      defaultPass: string;
    }> = [
      {
        id: 'player_default',
        username: bootstrapUsername,
        email: 'commander@frontline.mil',
        rank: 'Supreme Commander',
        role: 'super_admin',
        score: 4850,
        level: 12,
        defaultPass: bootstrapPassword,
      },
      {
        id: 'admin_game_ops',
        username: 'Valkyrie_Ops',
        email: 'valkyrie@frontline.mil',
        rank: 'Theater Operations Director',
        role: 'game_admin',
        score: 3620,
        level: 9,
        defaultPass: this.resolveBootstrapSecret('GAME_ADMIN_BOOTSTRAP_PASSWORD', 'gameadmin123'),
      },
      {
        id: 'admin_sentinel_mod',
        username: 'Sentinel_Mod',
        email: 'sentinel@frontline.mil',
        rank: 'Provost Marshal',
        role: 'moderator',
        score: 2150,
        level: 6,
        defaultPass: this.resolveBootstrapSecret('MODERATOR_BOOTSTRAP_PASSWORD', 'moderator123'),
      },
      {
        id: 'admin_telemetry',
        username: 'Telemetry_Analyst',
        email: 'analyst@frontline.mil',
        rank: 'Intelligence Analyst',
        role: 'analyst',
        score: 1840,
        level: 5,
        defaultPass: this.resolveBootstrapSecret('ANALYST_BOOTSTRAP_PASSWORD', 'analyst123'),
      },
      {
        id: 'player_striker',
        username: 'Striker_Actual',
        email: 'striker@frontline.mil',
        rank: 'Armored Battalion Cmdr',
        role: null as any,
        score: 2940,
        level: 7,
        defaultPass: 'player123',
      },
      {
        id: 'player_ironwolf',
        username: 'IronWolf_99',
        email: 'ironwolf@frontline.mil',
        rank: 'Field Lieutenant',
        role: null as any,
        score: 1410,
        level: 4,
        defaultPass: 'player123',
      },
      {
        id: 'admin_super_prime',
        username: 'SuperAdmin_Prime',
        email: 'superprime@frontline.mil',
        rank: 'Supreme Theater Marshal',
        role: 'super_admin',
        score: 5200,
        level: 14,
        defaultPass: 'adminpassword123',
      },
    ];

    for (const acc of staffAccounts) {
      if (!data.users[acc.id]) {
        data.users[acc.id] = {
          passwordHash: bcrypt.hashSync(acc.defaultPass, 8),
          profile: {
            id: acc.id,
            username: acc.username,
            email: acc.email,
            rank: acc.rank,
            score: acc.score,
            level: acc.level,
            avatar: acc.role ? 'shield' : 'crosshair',
            allianceId: 'alliance_vanguard',
            allianceRole: acc.id === 'player_default' ? 'leader' : 'officer',
            homeBaseId: 'base_home_player',
            currentMapId: 'map_riverfront_assault',
            totalBasesCaptured: acc.id === 'player_default' ? 4 : 2,
            totalUnitsProduced: acc.id === 'player_default' ? 28 : 14,
            totalUnitsDestroyed: acc.id === 'player_default' ? 19 : 8,
            totalResourcesHarvested: acc.score * 45,
            highwayTransfersCompleted: acc.id === 'player_default' ? 1 : 0,
            claimedRewardIds: [],
            joinedAt: now - 86400000 * 14,
            lastLoginAt: now - 3600000,
            beginnerProtectionUntil: 0,
            isAdmin: Boolean(acc.role),
            adminRole: acc.role || null,
            status: 'active',
            suspendedUntil: null,
            banReason: null,
            moderationHistory: [],
            playerType: 'human',
            accountId: acc.id,
            botAgentId: null,
            controlSource: 'human',
            verificationStatus: 'verified',
          },
        };
      } else {
        const prof = data.users[acc.id].profile;
        if (prof.status === undefined) prof.status = 'active';
        if (prof.moderationHistory === undefined) prof.moderationHistory = [];
        if (!prof.currentMapId) prof.currentMapId = 'map_riverfront_assault';
        if (!prof.claimedRewardIds) prof.claimedRewardIds = [];
        if (prof.highwayTransfersCompleted === undefined) prof.highwayTransfersCompleted = 0;
        if (acc.role && !prof.adminRole) {
          prof.adminRole = acc.role;
          prof.isAdmin = true;
        }
        prof.playerType = 'human';
        prof.accountId = acc.id;
        prof.botAgentId = null;
        prof.controlSource = 'human';
        prof.verificationStatus = prof.verificationStatus === 'admin_verified' ? 'admin_verified' : 'verified';
      }
    }
  }

  /**
   * Ensures all active maps have their own isolated bases, units, highway exits, and environmental objects.
   */
  private ensureMultiMapEntities(parsed: PersistentData) {
    const defaultMaps = createDefaultMaps();
    if (!parsed.maps || parsed.maps.length === 0) {
      parsed.maps = defaultMaps;
    } else {
      for (const defMap of defaultMaps) {
        const existing = parsed.maps.find((m) => m.id === defMap.id);
        if (!existing) {
          parsed.maps.push(defMap);
        } else {
          existing.enabled = true;
          existing.isActiveMap = true;
          existing.highwayExits = existing.highwayExits?.length
            ? existing.highwayExits
            : createDefaultHighwayExits(existing.id);
          existing.maxUnitsOnMap = existing.maxUnitsOnMap || defMap.maxUnitsOnMap;
          existing.maxBasesPerPlayer = existing.maxBasesPerPlayer || defMap.maxBasesPerPlayer;
          existing.maxPopPerPlayer = existing.maxPopPerPlayer || defMap.maxPopPerPlayer;
        }
      }
    }

    // Prune any synthetic test entities and normalize required fields on bases/units
    parsed.bases = (parsed.bases || []).filter((b: any) => b && b.id && !String(b.id).startsWith('base_tx_test_'));
    parsed.units = (parsed.units || []).filter((u: any) => u && u.id && !String(u.id).startsWith('unit_tx_test_'));

    const userHqMap = new Map<string, string>();
    for (const [uid, uRec] of Object.entries(parsed.users || {})) {
      if ((uRec as any)?.profile?.homeBaseId) {
        userHqMap.set((uRec as any).profile.homeBaseId, uid);
      }
    }

    for (const b of parsed.bases) {
      if (!b.mapId) b.mapId = 'map_riverfront_assault';
      if (!Array.isArray(b.buildings)) b.buildings = [];
      if (!Array.isArray(b.constructionQueue)) b.constructionQueue = [];
      if (!Array.isArray(b.productionQueue)) b.productionQueue = [];
      if (!b.resources) b.resources = { ...STARTER_RESOURCES };
      if (!b.storageCap) b.storageCap = { ...BASE_RESOURCE_CAP };
      if (!b.productionRates) b.productionRates = { concrete: 2.5, steel: 2.5, aluminum: 1.5, fuel: 2.0 };
      if (!b.radius) b.radius = 5;
      if (b.captureProgress === undefined) b.captureProgress = 0;

      // Classify Home Base accurately based on registered profile homeBaseId
      if (b.isHomeBase === undefined) {
        b.isHomeBase = Boolean(
          (b.ownerId && userHqMap.get(b.id) === b.ownerId) ||
          (b.ownerId === 'player_default' && (b.id === 'base_0' || b.id === 'base_home'))
        );
      } else if (b.isHomeBase && b.ownerId && b.ownerId !== 'neutral' && b.ownerId !== 'enemy_insurgent') {
        const expectedHqId = userHqMap.get(b.id);
        const ownerProfile = parsed.users?.[b.ownerId]?.profile;
        if (ownerProfile?.homeBaseId && ownerProfile.homeBaseId !== b.id && expectedHqId !== b.ownerId) {
          b.isHomeBase = false;
        }
      }

      if (b.isHomeBase) {
        b.lastKnownValidCoords = b.lastKnownValidCoords || { x: b.x, y: b.y };
        b.destructionHistory = Array.isArray(b.destructionHistory) ? b.destructionHistory : [];
        const cc = (b.buildings || []).find((bld: any) => bld.type === 'command_center');
        b.hqLevel = cc ? cc.level : 1;
      }

      // Normalize specialized base buildings safely without deleting bases or changing owners/resources
      if (b.type === 'home') {
        b.buildings = b.buildings.filter((bld: any) => bld.type !== 'aviation_hangar');
      } else if (b.type === 'helicopter' && !b.buildings.some((bld: any) => bld.type === 'helicopter_hangar')) {
        b.buildings.push({
          id: `b_hh_mig_${b.id}`,
          type: 'helicopter_hangar',
          level: 2,
          health: 900,
          maxHealth: 900,
        });
      } else if (b.type === 'air' && !b.buildings.some((bld: any) => bld.type === 'aviation_hangar')) {
        b.buildings.push({
          id: `b_ah_mig_${b.id}`,
          type: 'aviation_hangar',
          level: 2,
          health: 950,
          maxHealth: 950,
        });
      } else if (b.type === 'train' && !b.buildings.some((bld: any) => bld.type === 'rail_depot')) {
        b.buildings.push({
          id: `b_rd_mig_${b.id}`,
          type: 'rail_depot',
          level: 2,
          health: 1100,
          maxHealth: 1100,
        });
      } else if (b.type === 'rail') {
        if (!b.buildings.some((bld: any) => bld.type === 'logistics_center')) {
          b.buildings.push({
            id: `b_lc_mig_${b.id}`,
            type: 'logistics_center',
            level: 2,
            health: 850,
            maxHealth: 850,
          });
        }
        if (!b.buildings.some((bld: any) => bld.type === 'repair_depot')) {
          b.buildings.push({
            id: `b_rep_mig_${b.id}`,
            type: 'repair_depot',
            level: 2,
            health: 800,
            maxHealth: 800,
          });
        }
      } else if (b.type === 'harbor' && !b.buildings.some((bld: any) => bld.type === 'naval_dockyard')) {
        b.buildings.push({
          id: `b_nd_mig_${b.id}`,
          type: 'naval_dockyard',
          level: 2,
          health: 1100,
          maxHealth: 1100,
        });
      } else if (b.type === 'tank' && !b.buildings.some((bld: any) => bld.type === 'vehicle_factory')) {
        b.buildings.push({
          id: `b_vf_mig_${b.id}`,
          type: 'vehicle_factory',
          level: 1,
          health: 800,
          maxHealth: 800,
        });
      }

      // Explicit lifecycleState: distinguish active fortified bases (including neutral garrisons) from neutralized bases
      if (b.health <= 0) {
        b.health = 0;
        b.defenseShield = 0;
        b.activeTurretsCount = 0;
        b.defensesIntact = false;
        if (b.lifecycleState !== 'destroyed') {
          b.lifecycleState = 'neutralized';
        }
      } else {
        if (b.isProtected) {
          b.lifecycleState = 'protected';
        } else if (!b.lifecycleState || b.lifecycleState === 'ownerless' || b.lifecycleState === 'neutralized') {
          b.lifecycleState = 'active';
        }
      }
    }

    // Ensure 1 neutral base per sector map is designated as a Newcomer Outpost
    for (const m of parsed.maps || []) {
      const hasNewcomer = parsed.bases.some((b: any) => b.mapId === m.id && b.isNewcomerBase);
      if (!hasNewcomer) {
        const neutralBases = parsed.bases.filter((b: any) => b.mapId === m.id && b.ownerId === 'neutral');
        if (neutralBases.length > 0) {
          const designated = neutralBases[Math.min(1, neutralBases.length - 1)];
          designated.isNewcomerBase = true;
          designated.name = `${m.name.split(':')[0]} Newcomer Outpost`;
          designated.newcomerProtectionUntil = Date.now() + 72 * 3600000;
        }
      }
    }
    for (const u of parsed.units) {
      if (!u.mapId) u.mapId = 'map_riverfront_assault';
      if (!Array.isArray(u.path)) u.path = [];
      if (!u.command) u.command = 'idle';
    }
    for (const e of parsed.envObjects || []) {
      if (!e.mapId) e.mapId = 'map_riverfront_assault';
    }

    if (!parsed.envObjectsByMap) {
      parsed.envObjectsByMap = {
        map_riverfront_assault: parsed.envObjects || [],
      };
    }

    // Generate bases, units, and envObjects for Sector 02 and Sector 03 if not yet populated,
    // and non-destructively ensure all 6 specialized base types exist on every sector map.
    const requiredSpecializedTypes: BaseType[] = ['tank', 'air', 'helicopter', 'rail', 'train', 'harbor'];

    for (const mapCfg of parsed.maps) {
      const mapBases = parsed.bases.filter((b: any) => b.mapId === mapCfg.id);
      if (mapBases.length === 0) {
        const generated = generateWorld({
          width: mapCfg.width,
          height: mapCfg.height,
          tileSize: mapCfg.tileSize,
          seed: mapCfg.seed,
        });

        const sectorTag = mapCfg.id === 'map_iron_ridge_corridor' ? 's2' : 's3';
        const sectorLabel = mapCfg.id === 'map_iron_ridge_corridor' ? 'Iron Ridge' : 'Bastion Delta';

        const newBases: Base[] = generated.bases.map((b, idx) => {
          const clone: Base = {
            ...b,
            id: `${b.id}_${sectorTag}`,
            mapId: mapCfg.id,
            name: `${sectorLabel} ${b.name}`,
            isHomeBase: false,
            lifecycleState: b.health <= 0 ? 'neutralized' : 'active',
          };
          if (idx === 0) {
            clone.ownerId = 'player_default';
            clone.ownerName = parsed.users['player_default']?.profile.username || 'Commander';
            clone.allianceId = 'alliance_vanguard';
            clone.type = 'tank';
            clone.isHomeBase = false;
            clone.lifecycleState = 'active';
            clone.name = `${sectorLabel} Forward Garrison`;
          } else if (idx === 1 || idx === 6) {
            clone.ownerId = 'enemy_insurgent';
            clone.ownerName = 'Kodiak PMC';
            clone.isHomeBase = false;
            clone.lifecycleState = 'active';
            clone.name = `Kodiak ${sectorLabel} Garrison ${idx}`;
          }
          return clone;
        });

        parsed.bases.push(...newBases);
        parsed.envObjectsByMap[mapCfg.id] = generated.envObjects.map((eo) => ({
          ...eo,
          id: `${eo.id}_${sectorTag}`,
          mapId: mapCfg.id,
        }));

        // Spawn garrison units on this sector map for both player_default and enemy_insurgent
        const pBase = newBases[0];
        const eBase = newBases[1] || newBases[0];
        if (pBase) {
          parsed.units.push(
            {
              id: `unit_${sectorTag}_p1`,
              mapId: mapCfg.id,
              type: 'titan_mbt',
              ownerId: 'player_default',
              ownerName: pBase.ownerName,
              allianceId: 'alliance_vanguard',
              x: pBase.x + 2,
              y: pBase.y + 2,
              rotation: 0,
              health: UNIT_CATALOG.titan_mbt.maxHealth,
              maxHealth: UNIT_CATALOG.titan_mbt.maxHealth,
              command: 'idle',
              path: [],
              lastAttackTime: 0,
              kills: 0,
              homeBaseId: pBase.id,
            },
            {
              id: `unit_${sectorTag}_p2`,
              mapId: mapCfg.id,
              type: 'hawk_scout_heli',
              ownerId: 'player_default',
              ownerName: pBase.ownerName,
              allianceId: 'alliance_vanguard',
              x: pBase.x - 2,
              y: pBase.y + 1,
              rotation: 0.5,
              health: UNIT_CATALOG.hawk_scout_heli.maxHealth,
              maxHealth: UNIT_CATALOG.hawk_scout_heli.maxHealth,
              command: 'idle',
              path: [],
              lastAttackTime: 0,
              kills: 0,
              homeBaseId: pBase.id,
            }
          );
        }
        if (eBase) {
          parsed.units.push(
            {
              id: `unit_${sectorTag}_e1`,
              mapId: mapCfg.id,
              type: 'titan_mbt',
              ownerId: 'enemy_insurgent',
              ownerName: 'Kodiak PMC',
              x: eBase.x - 2,
              y: eBase.y + 1,
              rotation: 3.14,
              health: UNIT_CATALOG.titan_mbt.maxHealth,
              maxHealth: UNIT_CATALOG.titan_mbt.maxHealth,
              command: 'hold',
              path: [],
              lastAttackTime: 0,
              kills: 0,
              homeBaseId: eBase.id,
            },
            {
              id: `unit_${sectorTag}_e2`,
              mapId: mapCfg.id,
              type: 'ironclad_apc',
              ownerId: 'enemy_insurgent',
              ownerName: 'Kodiak PMC',
              x: eBase.x - 3,
              y: eBase.y - 2,
              rotation: 2.7,
              health: UNIT_CATALOG.ironclad_apc.maxHealth,
              maxHealth: UNIT_CATALOG.ironclad_apc.maxHealth,
              command: 'hold',
              path: [],
              lastAttackTime: 0,
              kills: 0,
              homeBaseId: eBase.id,
            }
          );
        }
      } else {
        const missingTypes = requiredSpecializedTypes.filter(
          (t) => !mapBases.some((b: any) => b.type === t)
        );
        const needEnv = !parsed.envObjectsByMap[mapCfg.id] || parsed.envObjectsByMap[mapCfg.id].length === 0;

        if (missingTypes.length > 0 || needEnv) {
          const generated = generateWorld({
            width: mapCfg.width,
            height: mapCfg.height,
            tileSize: mapCfg.tileSize,
            seed: mapCfg.seed,
          });

          if (needEnv) {
            parsed.envObjectsByMap[mapCfg.id] = generated.envObjects.map((eo) => ({
              ...eo,
              mapId: mapCfg.id,
            }));
          }

          if (missingTypes.length > 0) {
            const sectorSuffix =
              mapCfg.id === 'map_riverfront_assault'
                ? ''
                : mapCfg.id === 'map_iron_ridge_corridor'
                ? '_s2'
                : '_s3';
            const sectorLabel =
              mapCfg.id === 'map_riverfront_assault'
                ? ''
                : mapCfg.id === 'map_iron_ridge_corridor'
                ? 'Iron Ridge '
                : 'Bastion Delta ';
            const railY = Math.floor(mapCfg.height * 0.48);

            for (const missingType of missingTypes) {
              const template = generated.bases.find((gb) => gb.type === missingType);
              if (!template) continue;

              let candX = template.x;
              let candY = template.y;

              const currentMapBases = parsed.bases.filter((b: any) => b.mapId === mapCfg.id);
              const isOverlapping = (x: number, y: number) =>
                currentMapBases.some((eb: any) => Math.hypot(eb.x - x, eb.y - y) < 12.2);

              if (isOverlapping(candX, candY)) {
                if (missingType === 'train' || missingType === 'rail') {
                  for (let rx = 14; rx <= mapCfg.width - 22; rx += 2) {
                    if (!isOverlapping(rx, railY)) {
                      candX = rx;
                      candY = railY;
                      break;
                    }
                  }
                } else {
                  let foundNonOverlap = false;
                  for (let r = 4; r <= 36 && !foundNonOverlap; r += 3) {
                    for (let a = 0; a < 16 && !foundNonOverlap; a++) {
                      const ang = (a / 16) * Math.PI * 2;
                      const tx = Math.max(8, Math.min(mapCfg.width - 12, Math.round(template.x + Math.cos(ang) * r)));
                      const ty = Math.max(8, Math.min(mapCfg.height - 10, Math.round(template.y + Math.sin(ang) * r)));
                      if (!isOverlapping(tx, ty)) {
                        candX = tx;
                        candY = ty;
                        foundNonOverlap = true;
                      }
                    }
                  }
                }
              }

              const newBaseId = `${template.id}${sectorSuffix}`;
              if (!parsed.bases.some((b: any) => b.id === newBaseId)) {
                parsed.bases.push({
                  ...template,
                  id: newBaseId,
                  mapId: mapCfg.id,
                  name: `${sectorLabel}${template.name}`,
                  x: candX,
                  y: candY,
                  isHomeBase: false,
                  lifecycleState: template.health <= 0 ? 'neutralized' : 'active',
                });
              }
            }
          }
        }
      }
    }
  }

  private migrateData(parsed: any): PersistentData {
    const now = Date.now();
    const defEcon = createDefaultEconomyConfig();
    if (!parsed.economyConfig) {
      parsed.economyConfig = defEcon;
    } else {
      parsed.economyConfig = { ...defEcon, ...parsed.economyConfig };
      if (parsed.economyConfig.homeBaseArmorMultiplier === 1.5 && parsed.economyConfig.version === 1) {
        parsed.economyConfig.homeBaseArmorMultiplier = 3.0;
      }
    }
    if (!parsed.configHistory) {
      parsed.configHistory = [
        {
          version: 1,
          domain: 'economy',
          timestamp: now - 86400000 * 3,
          adminId: 'player_default',
          adminUsername: 'Commander',
          reason: 'Initial production balance baseline for Riverfront Assault',
          snapshot: { ...parsed.economyConfig },
          changesSummary: 'Initialized default 1.0x economy multipliers and resource caps',
        },
      ];
    }
    if (!parsed.catalogState) {
      parsed.catalogState = {
        version: 1,
        units: {},
        buildings: {},
        updatedAt: now,
        updatedBy: 'System Bootstrap',
      };
    }
    if (!parsed.announcements) {
      parsed.announcements = [
        {
          id: 'ann_riverfront_live',
          title: 'MULTI-SECTOR HIGHWAY NETWORK ACTIVE',
          message:
            'High Command has linked Sector 01 (Riverfront), Sector 02 (Iron Ridge), and Sector 03 (Bastion Delta). Deploy units to Highway Checkpoints to reinforce neighboring sectors.',
          priority: 'info',
          published: true,
          startsAt: now - 86400000,
          expiresAt: null,
          createdBy: 'player_default',
          createdByUsername: 'Commander',
          createdAt: now - 86400000,
          updatedAt: now - 86400000,
        },
      ];
    }
    if (!parsed.auditLogs) {
      parsed.auditLogs = [
        {
          id: `audit_boot_${now}`,
          timestamp: now - 3600000,
          adminId: 'player_default',
          adminUsername: 'Commander',
          adminRole: 'super_admin',
          action: 'system.bootstrap',
          targetType: 'system',
          targetId: 'sector_01',
          reason: 'Automated server verification and RBAC initialization',
          status: 'success',
          ipAddress: '127.0.0.1',
        },
      ];
    }
    if (!parsed.matches || parsed.matches.length === 0) {
      parsed.matches = [
        {
          id: 'match_sector_01_live',
          mapId: 'map_riverfront_assault',
          mapName: 'Sector 01: Riverfront Assault',
          seed: parsed.worldConfig?.seed || 202610,
          status: 'active',
          startedAt: now - 7200000,
          endedAt: null,
          aiDifficulty: 'medium',
          participantIds: ['player_default', 'enemy_insurgent'],
          winnerName: null,
          totalUnitsSpawned: (parsed.units || []).length,
          totalBasesCaptured: 2,
          terminationReason: null,
        },
        {
          id: 'match_sector_02_live',
          mapId: 'map_iron_ridge_corridor',
          mapName: 'Sector 02: Iron Ridge Rail Corridor',
          seed: 441892,
          status: 'active',
          startedAt: now - 5400000,
          endedAt: null,
          aiDifficulty: 'medium',
          participantIds: ['player_default', 'enemy_insurgent'],
          winnerName: null,
          totalUnitsSpawned: 8,
          totalBasesCaptured: 1,
          terminationReason: null,
        },
        {
          id: 'match_sector_03_live',
          mapId: 'map_archipelago_bastion',
          mapName: 'Sector 03: Littoral Bastion Delta',
          seed: 883104,
          status: 'active',
          startedAt: now - 3600000,
          endedAt: null,
          aiDifficulty: 'medium',
          participantIds: ['player_default', 'enemy_insurgent'],
          winnerName: null,
          totalUnitsSpawned: 6,
          totalBasesCaptured: 1,
          terminationReason: null,
        },
      ];
    }
    if (!parsed.systemSettings) {
      parsed.systemSettings = createDefaultSystemSettings();
    }
    if (!parsed.adminSessions) {
      parsed.adminSessions = {};
    }
    if (!parsed.tokens) {
      parsed.tokens = {};
    }
    if (parsed.tokens['default_commander_token']) {
      delete parsed.tokens['default_commander_token'];
    }
    if (!parsed.battleReports) {
      parsed.battleReports = [];
    }
    if (!parsed.supportTickets) {
      parsed.supportTickets = [];
    }
    if (!parsed.exploredByUserMap) {
      parsed.exploredByUserMap = {};
    }

    this.ensureAdminBootstrapUsers(parsed);

    // Upgrade alliances with full roles, recruitmentMode, joinRequests, invites, and activityLog
    for (const al of parsed.alliances || []) {
      if (!al.memberRoles) {
        al.memberRoles = {};
        for (const mId of al.memberIds) {
          al.memberRoles[mId] = mId === al.leaderId ? 'leader' : 'member';
        }
      }
      if (!al.recruitmentMode) al.recruitmentMode = 'open';
      if (!al.maxMembers) al.maxMembers = 25;
      if (!al.joinRequests) al.joinRequests = [];
      if (!al.invites) al.invites = [];
      if (!al.activityLog) {
        al.activityLog = [
          {
            id: `act_${al.createdTime || now}`,
            text: `Alliance [${al.tag}] ${al.name} established by ${al.leaderName}.`,
            timestamp: al.createdTime || now,
          },
        ];
      }
    }

    this.ensureMultiMapEntities(parsed);

    // Authoritative Player Type & Identity Migration
    for (const [uid, uRec] of Object.entries(parsed.users || {})) {
      const rec = uRec as { passwordHash?: string; profile?: PlayerProfile };
      if (!rec?.profile) continue;
      const prof = rec.profile;
      const hasValidAuth = typeof rec.passwordHash === 'string' && rec.passwordHash.trim().length > 0;
      if (prof.playerType === 'unknown' && prof.verificationStatus !== 'admin_verified') {
        prof.playerType = 'unknown';
        prof.accountId = prof.accountId ?? null;
        prof.botAgentId = null;
        prof.controlSource = 'unverified';
        prof.verificationStatus = 'legacy_unverified';
      } else if (hasValidAuth) {
        prof.playerType = 'human';
        prof.accountId = uid;
        prof.botAgentId = null;
        prof.controlSource = 'human';
        prof.verificationStatus = prof.verificationStatus === 'admin_verified' ? 'admin_verified' : 'verified';
      } else {
        // Legacy record without verified authentication credentials -> classify as UNKNOWN instead of assuming human or bot
        prof.playerType = 'unknown';
        prof.accountId = null;
        prof.botAgentId = null;
        prof.controlSource = 'unverified';
        prof.verificationStatus = 'legacy_unverified';
      }
    }

    if (!parsed.botRegistry) {
      parsed.botRegistry = {};
    }
    const botMaps = Array.from(
      new Set<string>([
        ...(parsed.bases || [])
          .filter((b: Base) => b.ownerId === 'enemy_insurgent')
          .map((b: Base) => b.mapId || 'map_riverfront_assault'),
        ...(parsed.units || [])
          .filter((u: Unit) => u.ownerId === 'enemy_insurgent')
          .map((u: Unit) => u.mapId || 'map_riverfront_assault'),
      ])
    );
    const botMatchIds = (parsed.matches || [])
      .filter((m: MatchRecord) => m.status === 'active' && (m.participantIds || []).includes('enemy_insurgent'))
      .map((m: MatchRecord) => m.id);
    const existingKodiak = parsed.botRegistry['enemy_insurgent'];
    const aiAggressionOn = parsed.systemSettings?.aiAggressionEnabled !== false;
    parsed.botRegistry['enemy_insurgent'] = {
      botId: existingKodiak?.botId || 'bot_kodiak_pmc',
      playerId: 'enemy_insurgent',
      playerType: 'bot',
      displayName: existingKodiak?.displayName || 'Kodiak PMC',
      faction: existingKodiak?.faction || 'Kodiak Autonomous Command',
      difficulty: existingKodiak?.difficulty || 'medium',
      aiProfile: existingKodiak?.aiProfile || 'Combined Arms Siege & Recon AI',
      activeMapIds: botMaps.length > 0 ? botMaps : ['map_riverfront_assault'],
      matchIds: botMatchIds,
      controlSource: 'ai_controller',
      controlStatus: aiAggressionOn ? 'autonomous_active' : 'paused',
      creationSource: existingKodiak?.creationSource || 'server_simulation_engine',
      state: aiAggressionOn ? 'active' : 'paused',
      createdAt: existingKodiak?.createdAt || now - 86400000 * 14,
      lastDecisionAt: existingKodiak?.lastDecisionAt || now,
    };

    if (!parsed.systemEntities) {
      parsed.systemEntities = {};
    }
    const neutralMaps = Array.from(
      new Set<string>(
        (parsed.bases || [])
          .filter((b: Base) => b.ownerId === 'neutral')
          .map((b: Base) => b.mapId || 'map_riverfront_assault')
      )
    );
    const existingNeutral = parsed.systemEntities['neutral'];
    parsed.systemEntities['neutral'] = {
      entityId: existingNeutral?.entityId || 'sys_neutral_sector',
      playerId: 'neutral',
      playerType: 'system',
      displayName: existingNeutral?.displayName || 'Neutral Territory',
      faction: existingNeutral?.faction || 'Unclaimed Sector Installations',
      activeMapIds: neutralMaps.length > 0 ? neutralMaps : ['map_riverfront_assault'],
      controlSource: 'system',
      creationSource: existingNeutral?.creationSource || 'world_generator',
      state: 'active',
      createdAt: existingNeutral?.createdAt || now - 86400000 * 14,
      lastUpdatedAt: now,
    };

    return parsed as PersistentData;
  }

  private loadOrInit(customFilePath?: string): PersistentData {
    const targetFile = customFilePath || DATA_FILE;
    if ((customFilePath || process.env.NODE_ENV !== 'test') && fs.existsSync(targetFile)) {
      try {
        const raw = fs.readFileSync(targetFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && (parsed.users || Array.isArray(parsed.bases))) {
          return this.migrateData(parsed);
        }
      } catch (e) {
        console.error('Failed to load gamestate.json, re-initializing:', e);
      }
    }

    const worldConfig = {
      width: 100,
      height: 75,
      tileSize: 40,
      seed: 202610,
    };

    const { bases, terrain, envObjects } = generateWorld(worldConfig);

    const defaultUserId = 'player_default';
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || 'Commander';
    const bootstrapPassword = this.resolveBootstrapSecret('ADMIN_BOOTSTRAP_PASSWORD', 'admin123');
    const homeBase = bases[0];
    homeBase.ownerId = defaultUserId;
    homeBase.ownerName = bootstrapUsername;
    homeBase.name = 'Fortress Alpha (HQ)';
    homeBase.allianceId = 'alliance_vanguard';
    homeBase.mapId = 'map_riverfront_assault';

    const forwardBase = bases[3];
    if (forwardBase) {
      forwardBase.ownerId = defaultUserId;
      forwardBase.ownerName = bootstrapUsername;
      forwardBase.allianceId = 'alliance_vanguard';
      forwardBase.mapId = 'map_riverfront_assault';
    }

    const enemyBase = bases[1];
    if (enemyBase) {
      enemyBase.ownerId = 'enemy_insurgent';
      enemyBase.ownerName = 'Kodiak PMC';
      enemyBase.name = 'Kodiak Stronghold';
      enemyBase.mapId = 'map_riverfront_assault';
    }
    const enemyOutpost = bases[4];
    if (enemyOutpost) {
      enemyOutpost.ownerId = 'enemy_insurgent';
      enemyOutpost.ownerName = 'Kodiak PMC';
      enemyOutpost.mapId = 'map_riverfront_assault';
    }

    for (const b of bases) {
      b.mapId = 'map_riverfront_assault';
    }

    const defaultAlliance: Alliance = {
      id: 'alliance_vanguard',
      name: 'Vanguard Coalition',
      tag: 'VGD',
      description: 'Unified Defense Force securing frontline sectors and industrial supply lines.',
      leaderId: defaultUserId,
      leaderName: bootstrapUsername,
      memberIds: [defaultUserId],
      memberRoles: { [defaultUserId]: 'leader' },
      recruitmentMode: 'open',
      maxMembers: 25,
      joinRequests: [],
      invites: [],
      activityLog: [
        {
          id: `act_${Date.now()}`,
          text: `Alliance [VGD] Vanguard Coalition established by ${bootstrapUsername}.`,
          timestamp: Date.now(),
        },
      ],
      bannerColor: '#2563eb',
      createdTime: Date.now(),
      score: 4850,
      territoryBasesCount: 2,
    };

    const defaultProfile: PlayerProfile = {
      id: defaultUserId,
      username: bootstrapUsername,
      email: 'commander@frontline.mil',
      rank: 'Supreme Commander',
      score: 4850,
      level: 12,
      avatar: 'shield',
      allianceId: defaultAlliance.id,
      allianceRole: 'leader',
      homeBaseId: homeBase.id,
      currentMapId: 'map_riverfront_assault',
      totalBasesCaptured: 2,
      totalUnitsProduced: 8,
      totalUnitsDestroyed: 14,
      totalResourcesHarvested: 24500,
      highwayTransfersCompleted: 1,
      claimedRewardIds: [],
      joinedAt: Date.now() - 86400000 * 3,
      lastLoginAt: Date.now(),
      beginnerProtectionUntil: 0,
      isAdmin: true,
      adminRole: 'super_admin',
      status: 'active',
      suspendedUntil: null,
      banReason: null,
      moderationHistory: [],
    };

    const findSafeSpawn = (cx: number, cy: number, cat: 'ground' | 'air' | 'naval' | 'rail') => {
      if (isCellPassable(terrain, Math.round(cx), Math.round(cy), cat)) {
        return { x: Math.round(cx), y: Math.round(cy) };
      }
      for (let r = 1; r <= 8; r++) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const tx = Math.round(cx + Math.cos(ang) * r);
          const ty = Math.round(cy + Math.sin(ang) * r);
          if (isCellPassable(terrain, tx, ty, cat)) {
            return { x: tx, y: ty };
          }
        }
      }
      return { x: Math.round(cx), y: Math.round(cy) };
    };

    const p1 = findSafeSpawn(homeBase.x + 3, homeBase.y + 1, 'ground');
    const p2 = findSafeSpawn(homeBase.x + 2, homeBase.y + 3, 'ground');
    const p3 = findSafeSpawn(homeBase.x - 2, homeBase.y + 3, 'ground');
    const p4 = findSafeSpawn(homeBase.x + 3, homeBase.y - 2, 'ground');
    const p5 = findSafeSpawn(homeBase.x - 3, homeBase.y - 2, 'ground');
    const e1 = findSafeSpawn(enemyBase.x - 3, enemyBase.y + 1, 'ground');
    const e2 = findSafeSpawn(enemyBase.x - 2, enemyBase.y - 3, 'ground');

    const starterUnits: Unit[] = [
      {
        id: 'unit_starter_1',
        mapId: 'map_riverfront_assault',
        type: 'rifle_infantry',
        ownerId: defaultUserId,
        ownerName: bootstrapUsername,
        allianceId: defaultAlliance.id,
        x: p1.x,
        y: p1.y,
        rotation: 0,
        health: UNIT_CATALOG.rifle_infantry.maxHealth,
        maxHealth: UNIT_CATALOG.rifle_infantry.maxHealth,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 1,
        homeBaseId: homeBase.id,
      },
      {
        id: 'unit_starter_2',
        mapId: 'map_riverfront_assault',
        type: 'titan_mbt',
        ownerId: defaultUserId,
        ownerName: bootstrapUsername,
        allianceId: defaultAlliance.id,
        x: p2.x,
        y: p2.y,
        rotation: 0.4,
        health: UNIT_CATALOG.titan_mbt.maxHealth,
        maxHealth: UNIT_CATALOG.titan_mbt.maxHealth,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 3,
        homeBaseId: homeBase.id,
      },
      {
        id: 'unit_starter_3',
        mapId: 'map_riverfront_assault',
        type: 'ironclad_apc',
        ownerId: defaultUserId,
        ownerName: bootstrapUsername,
        allianceId: defaultAlliance.id,
        x: p3.x,
        y: p3.y,
        rotation: 0.8,
        health: UNIT_CATALOG.ironclad_apc.maxHealth,
        maxHealth: UNIT_CATALOG.ironclad_apc.maxHealth,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 1,
        homeBaseId: homeBase.id,
      },
      {
        id: 'unit_starter_4',
        mapId: 'map_riverfront_assault',
        type: 'hawk_scout_heli',
        ownerId: defaultUserId,
        ownerName: bootstrapUsername,
        allianceId: defaultAlliance.id,
        x: homeBase.x - 2,
        y: homeBase.y - 2,
        rotation: 1.2,
        health: UNIT_CATALOG.hawk_scout_heli.maxHealth,
        maxHealth: UNIT_CATALOG.hawk_scout_heli.maxHealth,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: homeBase.id,
      },
      {
        id: 'unit_starter_5',
        mapId: 'map_riverfront_assault',
        type: 'goliath_howitzer',
        ownerId: defaultUserId,
        ownerName: bootstrapUsername,
        allianceId: defaultAlliance.id,
        x: p4.x,
        y: p4.y,
        rotation: 0.2,
        health: UNIT_CATALOG.goliath_howitzer.maxHealth,
        maxHealth: UNIT_CATALOG.goliath_howitzer.maxHealth,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 4,
        homeBaseId: homeBase.id,
      },
      {
        id: 'unit_starter_6',
        mapId: 'map_riverfront_assault',
        type: 'dominator_conquest',
        ownerId: defaultUserId,
        ownerName: bootstrapUsername,
        allianceId: defaultAlliance.id,
        x: p5.x,
        y: p5.y,
        rotation: 0,
        health: UNIT_CATALOG.dominator_conquest.maxHealth,
        maxHealth: UNIT_CATALOG.dominator_conquest.maxHealth,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: homeBase.id,
      },
      {
        id: 'unit_enemy_1',
        mapId: 'map_riverfront_assault',
        type: 'ironclad_apc',
        ownerId: 'enemy_insurgent',
        ownerName: 'Kodiak PMC',
        x: e1.x,
        y: e1.y,
        rotation: 3.14,
        health: UNIT_CATALOG.ironclad_apc.maxHealth,
        maxHealth: UNIT_CATALOG.ironclad_apc.maxHealth,
        command: 'hold',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: enemyBase.id,
      },
      {
        id: 'unit_enemy_2',
        mapId: 'map_riverfront_assault',
        type: 'titan_mbt',
        ownerId: 'enemy_insurgent',
        ownerName: 'Kodiak PMC',
        x: e2.x,
        y: e2.y,
        rotation: 2.8,
        health: UNIT_CATALOG.titan_mbt.maxHealth,
        maxHealth: UNIT_CATALOG.titan_mbt.maxHealth,
        command: 'hold',
        path: [],
        lastAttackTime: 0,
        kills: 2,
        homeBaseId: enemyBase.id,
      },
      {
        id: 'unit_enemy_3',
        mapId: 'map_riverfront_assault',
        type: 'cobra_gunship',
        ownerId: 'enemy_insurgent',
        ownerName: 'Kodiak PMC',
        x: enemyBase.x + 2,
        y: enemyBase.y + 2,
        rotation: 2.5,
        health: UNIT_CATALOG.cobra_gunship.maxHealth,
        maxHealth: UNIT_CATALOG.cobra_gunship.maxHealth,
        command: 'hold',
        path: [],
        lastAttackTime: 0,
        kills: 1,
        homeBaseId: enemyBase.id,
      },
    ];

    const initialChat: ChatMessage[] = [
      {
        id: 'msg_1',
        mapId: 'map_riverfront_assault',
        senderId: 'system',
        senderName: 'HQ TACTICAL NET',
        channel: 'system',
        content: 'Welcome to FRONTLINE DOMINION. Multi-Sector Highway Network online. Secure neutral bases to expand production.',
        timestamp: Date.now() - 60000,
      },
      {
        id: 'msg_2',
        mapId: 'map_riverfront_assault',
        senderId: defaultUserId,
        senderName: bootstrapUsername,
        allianceTag: 'VGD',
        channel: 'global',
        content: 'Recon reports Kodiak PMC armor column near Sector X:70 Y:20. Mobilizing Titan MBTs.',
        coords: { x: enemyBase.x, y: enemyBase.y },
        timestamp: Date.now() - 30000,
      },
    ];

    const initialData: PersistentData = this.migrateData({
      users: {
        [defaultUserId]: {
          passwordHash: bcrypt.hashSync(bootstrapPassword, 8),
          profile: defaultProfile,
        },
      },
      tokens: {},
      adminSessions: {},
      bases,
      units: starterUnits,
      envObjects: envObjects.map((e) => ({ ...e, mapId: 'map_riverfront_assault' })),
      alliances: [defaultAlliance],
      chat: initialChat,
      notifications: [
        {
          id: 'notif_1',
          userId: defaultUserId,
          mapId: 'map_riverfront_assault',
          type: 'system',
          title: 'Tactical Command Initialized',
          message: 'Fortress Alpha HQ is operational. Select your base to queue buildings or train combat squads.',
          coords: { x: homeBase.x, y: homeBase.y },
          timestamp: Date.now(),
          read: false,
        },
      ],
      worldConfig,
    });

    this.saveData(initialData);
    return initialData;
  }

  public getData(): PersistentData {
    return this.data;
  }

  public saveData(dataToSave: PersistentData = this.data, customFilePath?: string) {
    if (process.env.NODE_ENV === 'test' && !customFilePath) return;
    const targetFile = customFilePath || DATA_FILE;
    if (this.isSavingFile && !customFilePath) return;
    this.isSavingFile = true;
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpFile = `${targetFile}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, targetFile);
    } catch (e) {
      console.error('Failed to save gamestate.json:', e);
    } finally {
      this.isSavingFile = false;
    }
    if (!customFilePath) {
      // Non-blocking sync to Cloud SQL PostgreSQL
      void this.syncToDatabaseNow();
    }
  }

  public reloadFromDisk(customFilePath?: string): PersistentData {
    this.data = this.loadOrInit(customFilePath);
    return this.data;
  }

  public persistBaseAndUnits(base: Base, unitsToSave: Unit[] = []) {
    if (process.env.NODE_ENV === 'test') return;
    void persistBaseAndUnitsTransaction(base, unitsToSave);
  }

  public persistUser(uid: string) {
    if (process.env.NODE_ENV === 'test') return;
    const rec = this.data.users[uid];
    if (rec) {
      void persistUserTransaction(uid, rec.passwordHash, rec.profile);
    }
  }

  // ==========================================================================
  // EFFECTIVE CATALOG & ECONOMY HELPERS
  // ==========================================================================

  public getEconomyConfig(): EconomyConfig {
    return this.data.economyConfig;
  }

  public getSystemSettings(): SystemSettings {
    return this.data.systemSettings;
  }

  public getMapConfig(mapId?: string): MapSectorConfig {
    const targetId = mapId || 'map_riverfront_assault';
    return (
      this.data.maps.find((m) => m.id === targetId) ||
      this.data.maps[0] ||
      createDefaultMaps()[0]
    );
  }

  public getMapEnvObjects(mapId?: string): EnvironmentObject[] {
    const targetId = mapId || 'map_riverfront_assault';
    if (this.data.envObjectsByMap && this.data.envObjectsByMap[targetId]) {
      return this.data.envObjectsByMap[targetId];
    }
    return (this.data.envObjects || []).filter((e) => (e.mapId || 'map_riverfront_assault') === targetId);
  }

  public getEffectiveUnitDef(type: UnitType): UnitDefinition {
    const baseDef = UNIT_CATALOG[type];
    const override = this.data.catalogState?.units?.[type];
    if (!override) {
      return { ...baseDef, enabled: true };
    }
    return {
      ...baseDef,
      name: override.name,
      description: override.description,
      maxHealth: override.maxHealth,
      armor: override.armor,
      speed: override.speed,
      attackRange: override.attackRange,
      attackDamage: override.attackDamage,
      cooldownSec: override.cooldownSec,
      trainTimeSec: override.trainTimeSec,
      populationCost: override.populationCost,
      cost: { ...override.cost },
      enabled: override.enabled,
    };
  }

  public getEffectiveBuildingDef(type: BuildingType): BuildingDefinition {
    const baseDef = BUILDING_CATALOG[type];
    const override = this.data.catalogState?.buildings?.[type];
    if (!override) {
      return { ...baseDef, enabled: true };
    }
    const merged: BuildingDefinition = {
      ...baseDef,
      name: override.name,
      description: override.description,
      buildTimeSec: override.buildTimeSec,
      maxLevel: override.maxLevel,
      cost: { ...override.cost },
      enabled: override.enabled,
    };
    if (override.productionBonus) {
      merged.productionBonus = { ...override.productionBonus };
    }
    if (override.storageBonus) {
      merged.storageBonus = { ...override.storageBonus };
    }
    if (merged.defenseStats) {
      merged.defenseStats = {
        ...merged.defenseStats,
        damage: override.defenseDamage ?? merged.defenseStats.damage,
        range: override.defenseRange ?? merged.defenseStats.range,
      };
    }
    return merged;
  }

  public getFullEffectiveCatalog() {
    const units: Record<string, UnitDefinition> = {};
    for (const k of Object.keys(UNIT_CATALOG) as UnitType[]) {
      units[k] = this.getEffectiveUnitDef(k);
    }
    const buildings: Record<string, BuildingDefinition> = {};
    for (const k of Object.keys(BUILDING_CATALOG) as BuildingType[]) {
      buildings[k] = this.getEffectiveBuildingDef(k);
    }
    return {
      version: this.data.catalogState.version,
      updatedAt: this.data.catalogState.updatedAt,
      updatedBy: this.data.catalogState.updatedBy,
      units,
      buildings,
    };
  }

  // ==========================================================================
  // PLAYER STATUS, PROGRESSION & SANITIZATION HELPERS
  // ==========================================================================

  public recalculatePlayerProgression(profile: PlayerProfile): PlayerProfile {
    const { level, rank } = calculateRankFromScore(profile.score);
    profile.level = level;
    if (!profile.isAdmin || profile.rank === 'Commander' || profile.rank === 'Second Lieutenant' || profile.rank === 'Field Lieutenant') {
      profile.rank = rank;
    }
    return profile;
  }

  public checkPlayerAccess(userId: string): { allowed: boolean; reason?: string; status?: string } {
    const userRecord = this.data.users[userId];
    if (!userRecord) return { allowed: false, reason: 'Account not found', status: 'unknown' };
    const profile = userRecord.profile;

    if (profile.status === 'banned') {
      return {
        allowed: false,
        status: 'banned',
        reason: `Account permanently banned: ${profile.banReason || 'Violation of Rules of Engagement'}`,
      };
    }

    if (profile.status === 'suspended') {
      if (profile.suspendedUntil && profile.suspendedUntil <= Date.now()) {
        profile.status = 'active';
        profile.suspendedUntil = null;
        this.saveData();
        return { allowed: true, status: 'active' };
      }
      const untilStr = profile.suspendedUntil ? new Date(profile.suspendedUntil).toISOString() : 'Indefinite';
      return {
        allowed: false,
        status: 'suspended',
        reason: `Account suspended until ${untilStr}: ${profile.banReason || 'Administrative suspension'}`,
      };
    }

    return { allowed: true, status: 'active' };
  }

  public getMapTerrain(mapId: string): any[][] {
    const cached = this.terrainByMap.get(mapId);
    if (cached) return cached;
    const cfg = this.getMapConfig(mapId);
    const world = generateWorld({
      width: cfg.width,
      height: cfg.height,
      tileSize: cfg.tileSize,
      seed: cfg.seed,
    });
    this.terrainByMap.set(mapId, world.terrain);
    return world.terrain;
  }

  public getActivePlayerCountOnMap(mapId: string): number {
    const counted = new Set<string>();
    for (const b of this.data.bases) {
      if ((b.mapId || 'map_riverfront_assault') !== mapId) continue;
      if (!b.ownerId || b.ownerId === 'neutral' || b.ownerId === 'enemy_insurgent') continue;
      const profile = this.data.users[b.ownerId]?.profile;
      if (profile?.isInactiveRelocated) continue;
      counted.add(b.ownerId);
    }
    return counted.size;
  }

  public recordPlacementFailure(
    userId: string | undefined,
    mapId: string,
    reason: string,
    attemptedCoords?: { x: number; y: number }
  ): void {
    if (!userId || !this.data.users[userId]) return;
    const profile = this.data.users[userId].profile;
    profile.placementFailures = profile.placementFailures || [];
    profile.placementFailures.unshift({
      id: `pf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      mapId,
      attemptedCoords,
      reason,
      timestamp: Date.now(),
    });
    if (profile.placementFailures.length > 20) {
      profile.placementFailures = profile.placementFailures.slice(0, 20);
    }
  }

  public recordMeaningfulPlayerActivity(userId: string, now = Date.now()): void {
    const userRecord = this.data.users[userId];
    if (!userRecord) return;
    userRecord.profile.lastActiveAt = now;
    userRecord.profile.lastMapActivityAt = now;
    const homeBase = this.data.bases.find((b) => b.id === userRecord.profile.homeBaseId && b.ownerId === userId);
    if (homeBase) {
      homeBase.lastMeaningfulActivityAt = now;
    }
  }

  public findAndReserveBaseSpawnLocation(
    preferredMapId = 'map_riverfront_assault',
    playerAllianceId?: string | null,
    radius = 4,
    options?: {
      preferredCoords?: { x: number; y: number } | null;
      ownerId?: string;
      excludeBaseId?: string;
      strictMapOnly?: boolean;
    }
  ): { success: true; mapId: string; x: number; y: number; reservationId: string } | { success: false; reason: string; code: string } {
    const now = Date.now();
    for (const [id, res] of this.reservedSpawns.entries()) {
      if (res.expiresAt <= now) {
        this.reservedSpawns.delete(id);
      }
    }

    const econ = this.getEconomyConfig();
    const minBaseDist = econ.minBaseSpawnDistance || 12;
    const fallbackPolicy = options?.strictMapOnly ? 'reject_when_full' : econ.spawnMapFallbackPolicy || 'next_eligible_map';

    const enabledMaps = this.data.maps.filter((m) => m.enabled);
    let candidateMaps: MapSectorConfig[] = [];
    const prefMap = enabledMaps.find((m) => m.id === preferredMapId);
    if (prefMap) candidateMaps.push(prefMap);

    if (fallbackPolicy === 'next_eligible_map') {
      for (const m of enabledMaps) {
        if (m.id !== preferredMapId) candidateMaps.push(m);
      }
    }
    if (candidateMaps.length === 0 && !options?.strictMapOnly) candidateMaps = enabledMaps;

    for (const mapCfg of candidateMaps) {
      const activePlayers = this.getActivePlayerCountOnMap(mapCfg.id);
      const maxPlayers = mapCfg.maxPlayers || 8;
      // Allow existing player on this map when relocating within the same map
      const alreadyOnMap = options?.ownerId
        ? this.data.bases.some(
            (b) =>
              (b.mapId || 'map_riverfront_assault') === mapCfg.id &&
              b.ownerId === options.ownerId &&
              b.id !== options.excludeBaseId
          )
        : false;
      if (activePlayers >= maxPlayers && !alreadyOnMap) {
        this.recordPlacementFailure(
          options?.ownerId,
          mapCfg.id,
          `Sector ${mapCfg.name} reached maximum commander capacity (${activePlayers}/${maxPlayers})`
        );
        continue;
      }

      const terrain = this.getMapTerrain(mapCfg.id);
      const mapBases = this.data.bases.filter(
        (b) => (b.mapId || 'map_riverfront_assault') === mapCfg.id && b.id !== options?.excludeBaseId
      );
      const mapActiveReservations = Array.from(this.reservedSpawns.values()).filter((r) => r.mapId === mapCfg.id);
      const mapEnv = this.getMapEnvObjects(mapCfg.id).filter((e) => e.blocksMovement);
      const alliedBases = playerAllianceId ? mapBases.filter((b) => b.allianceId === playerAllianceId) : [];

      const width = mapCfg.width || 100;
      const height = mapCfg.height || 75;
      const margin = radius + 2;

      const isPassableFootprint = (cx: number, cy: number): boolean => {
        if (cx < margin || cx > width - margin || cy < margin || cy > height - margin) return false;
        if (!isCellPassable(terrain, cx, cy, 'ground')) return false;
        const sampleOffsets = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [-1, 1], [1, -1], [-1, -1],
        ];
        for (const [ox, oy] of sampleOffsets) {
          const sx = cx + ox;
          const sy = cy + oy;
          if (!isCellPassable(terrain, sx, sy, 'ground')) return false;
        }
        // Check blocking environment props at center
        for (const env of mapEnv) {
          if (Math.hypot(env.x - cx, env.y - cy) < 1.8) return false;
        }
        return true;
      };

      const isFarFromBasesAndReservations = (cx: number, cy: number): boolean => {
        for (const b of mapBases) {
          const dist = Math.hypot(b.x - cx, b.y - cy);
          const minRequired = (b.radius || 4) + radius + minBaseDist;
          if (dist < minRequired) return false;
        }
        for (const r of mapActiveReservations) {
          const dist = Math.hypot(r.x - cx, r.y - cy);
          const minRequired = (r.radius || 4) + radius + minBaseDist;
          if (dist < minRequired) return false;
        }
        return true;
      };

      let bestCandidate: { x: number; y: number; score: number } | null = null;

      // 1. If preferredCoords is provided on the preferred map, validate it or nearby coordinates first
      if (options?.preferredCoords && mapCfg.id === preferredMapId) {
        const px = Math.round(options.preferredCoords.x);
        const py = Math.round(options.preferredCoords.y);
        if (isPassableFootprint(px, py) && isFarFromBasesAndReservations(px, py)) {
          bestCandidate = { x: px, y: py, score: 1000 };
        } else {
          this.recordPlacementFailure(
            options?.ownerId,
            mapCfg.id,
            'Preferred / previous coordinates obstructed or within minimum base exclusion zone',
            { x: px, y: py }
          );
          // Search spiral around preferredCoords
          for (let distRadius = 3; distRadius <= 18 && !bestCandidate; distRadius += 3) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
              const nx = Math.round(px + Math.cos(angle) * distRadius);
              const ny = Math.round(py + Math.sin(angle) * distRadius);
              if (isPassableFootprint(nx, ny) && isFarFromBasesAndReservations(nx, ny)) {
                bestCandidate = { x: nx, y: ny, score: 850 - distRadius * 5 };
                break;
              }
            }
          }
        }
      }

      // 2. Standard candidate sampling (preferring allied proximity & road connectivity)
      if (!bestCandidate) {
        for (let attempt = 0; attempt < 150; attempt++) {
          const candX = Math.floor(Math.random() * (width - margin * 2) + margin);
          const candY = Math.floor(Math.random() * (height - margin * 2) + margin);

          if (!isPassableFootprint(candX, candY)) continue;
          if (!isFarFromBasesAndReservations(candX, candY)) continue;

          let score = 100;
          if (alliedBases.length > 0) {
            const nearestAlliedDist = Math.min(...alliedBases.map((b) => Math.hypot(b.x - candX, b.y - candY)));
            if (nearestAlliedDist >= radius + minBaseDist && nearestAlliedDist <= radius + minBaseDist + 24) {
              score += 500 - nearestAlliedDist * 5;
            }
          }

          if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { x: candX, y: candY, score };
            if (score >= 400) break;
          }
        }
      }

      if (!bestCandidate) {
        for (let cy = margin; cy <= height - margin; cy += 1) {
          for (let cx = margin; cx <= width - margin; cx += 1) {
            if (isPassableFootprint(cx, cy) && isFarFromBasesAndReservations(cx, cy)) {
              bestCandidate = { x: cx, y: cy, score: 50 };
              break;
            }
          }
          if (bestCandidate) break;
        }
      }

      if (bestCandidate) {
        const reservationId = `res_${now}_${crypto.randomBytes(4).toString('hex')}`;
        this.reservedSpawns.set(reservationId, {
          mapId: mapCfg.id,
          x: bestCandidate.x,
          y: bestCandidate.y,
          radius,
          expiresAt: now + 60000,
        });

        return {
          success: true,
          mapId: mapCfg.id,
          x: bestCandidate.x,
          y: bestCandidate.y,
          reservationId,
        };
      } else {
        this.recordPlacementFailure(
          options?.ownerId,
          mapCfg.id,
          `No unobstructed terrain footprint found on ${mapCfg.name} satisfying ${minBaseDist}-tile separation`
        );
      }
    }

    return {
      success: false,
      code: 'MAPS_FULL',
      reason: 'All active tactical sectors have reached maximum commander capacity or have no safe deployment zones available. Please try again shortly or contact Command.',
    };
  }

  public releaseSpawnReservation(reservationId: string): void {
    this.reservedSpawns.delete(reservationId);
  }

  public checkNewcomerBaseEligibility(
    userId: string,
    base: Base,
    now = Date.now()
  ): { eligible: boolean; reason?: string } {
    if (!base.isNewcomerBase) {
      return { eligible: true };
    }
    if (base.newcomerProtectionUntil && now >= base.newcomerProtectionUntil) {
      base.isNewcomerBase = false;
      base.newcomerProtectionUntil = null;
      return { eligible: true };
    }

    const econ = this.getEconomyConfig();
    const maxOwnedThreshold = econ.newbaseMaxOwnedBasesThreshold ?? 2;
    const maxWeeklyThreshold = econ.newbaseMaxWeeklyCapturesThreshold ?? 2;

    const ownedBasesCount = this.data.bases.filter((b) => b.ownerId === userId).length;
    if (ownedBasesCount >= maxOwnedThreshold) {
      return {
        eligible: false,
        reason: `Newcomer Outpost protection restricts veteran annexation: restricted to commanders with fewer than ${maxOwnedThreshold} bases (you control ${ownedBasesCount})`,
      };
    }

    const userRecord = this.data.users[userId];
    const profile = userRecord?.profile;
    if (profile) {
      const sevenDaysAgo = now - 7 * 86400000;
      profile.weeklyCaptureTimestamps = (profile.weeklyCaptureTimestamps || []).filter((t) => t > sevenDaysAgo);
      profile.weeklyCapturesCount = profile.weeklyCaptureTimestamps.length;

      if (profile.weeklyCapturesCount >= maxWeeklyThreshold) {
        return {
          eligible: false,
          reason: `Newcomer Outpost: Restricted to commanders with fewer than ${maxWeeklyThreshold} weekly conquests (you have ${profile.weeklyCapturesCount})`,
        };
      }

      if (profile.totalBasesCaptured > maxOwnedThreshold * 4) {
        return {
          eligible: false,
          reason: 'Newcomer Outpost: Veteran commanders with extensive conquest records are not eligible for newcomer bases',
        };
      }
    }

    return { eligible: true };
  }

  public recordPlayerBaseCapture(
    userId: string,
    baseId: string,
    mapId: string,
    now = Date.now()
  ): { success: boolean; weeklyCount: number } {
    const userRecord = this.data.users[userId];
    if (!userRecord) return { success: false, weeklyCount: 0 };
    const profile = userRecord.profile;
    const sevenDaysAgo = now - 7 * 86400000;

    profile.weeklyCaptureTimestamps = (profile.weeklyCaptureTimestamps || []).filter((t) => t > sevenDaysAgo);
    profile.weeklyCaptureTimestamps.push(now);
    profile.weeklyCapturesCount = profile.weeklyCaptureTimestamps.length;
    profile.totalBasesCaptured = (profile.totalBasesCaptured || 0) + 1;
    profile.lastActiveAt = now;
    profile.lastMapActivityAt = now;
    this.recalculatePlayerProgression(profile);
    this.persistUser(userId);
    return { success: true, weeklyCount: profile.weeklyCapturesCount };
  }

  public processInactivityEvictions(now = Date.now()): { evictedCount: number; evictedUserIds: string[] } {
    const econ = this.getEconomyConfig();
    const inactivityDays = econ.inactivityEvictionDays || 14;
    const maxIdleMs = inactivityDays * 86400000;
    const evictedUserIds: string[] = [];

    for (const [userId, userRecord] of Object.entries(this.data.users)) {
      if (userId === 'player_default' || userId === 'enemy_insurgent') continue;
      const profile = userRecord.profile;
      if (profile.isAdmin || profile.adminRole || profile.isInactiveRelocated) continue;

      const lastActivity = profile.lastMapActivityAt || profile.lastActiveAt || profile.lastLoginAt || profile.joinedAt;
      if (now - lastActivity >= maxIdleMs) {
        const homeBase = this.data.bases.find((b) => b.id === profile.homeBaseId && b.ownerId === userId);
        if (homeBase) {
          profile.archivedHomeBase = {
            baseId: homeBase.id,
            name: homeBase.name,
            mapId: homeBase.mapId || profile.homeMapId || 'map_riverfront_assault',
            lastValidCoords: { x: homeBase.x, y: homeBase.y },
            resources: { ...homeBase.resources },
            buildings: homeBase.buildings.map((bld) => ({ ...bld, isConstructing: false })),
            destructionHistory: homeBase.destructionHistory ? [...homeBase.destructionHistory] : [],
            archivedAt: now,
          };
        }
        this.data.bases = this.data.bases.filter((b) => !(b.id === profile.homeBaseId && b.ownerId === userId));
        profile.isInactiveRelocated = true;
        evictedUserIds.push(userId);
        this.persistUser(userId);
      }
    }

    if (evictedUserIds.length > 0) {
      this.saveData();
    }
    return { evictedCount: evictedUserIds.length, evictedUserIds };
  }

  public recoverInactivePlayerBaseIfNeeded(userId: string, now = Date.now()): { recovered: boolean; base?: Base } {
    const lockRes = this.withLock(`home_base_recover_${userId}`, () => {
      const userRecord = this.data.users[userId];
      if (!userRecord) return { recovered: false };
      const profile = userRecord.profile;

      const existingHomeBase = this.data.bases.find(
        (b) => (b.id === profile.homeBaseId || b.isHomeBase) && b.ownerId === userId
      );
      if (existingHomeBase && !profile.isInactiveRelocated) {
        profile.homeBaseId = existingHomeBase.id;
        existingHomeBase.isHomeBase = true;
        profile.lastActiveAt = now;
        profile.lastMapActivityAt = now;
        return { recovered: false, base: existingHomeBase };
      }

      // Remove any duplicate stale home bases for this user before spawning replacement
      this.data.bases = this.data.bases.filter(
        (b) => !(b.ownerId === userId && (b.isHomeBase || b.id === profile.homeBaseId))
      );

      const archived = profile.archivedHomeBase;
      const targetMapId = archived?.mapId || profile.homeMapId || profile.currentMapId || 'map_riverfront_assault';
      const spawnRes = this.findAndReserveBaseSpawnLocation(targetMapId, profile.allianceId, 4, {
        preferredCoords: archived?.lastValidCoords || null,
        ownerId: userId,
      });
      if (!spawnRes.success) {
        return { recovered: false };
      }

      const econ = this.getEconomyConfig();
      const rebuildShieldMs = (econ.rebuildProtectionDurationMinutes || 30) * 60 * 1000;
      const newBaseId = archived?.baseId || `base_home_${userId}_rec_${now}`;

      const restoredBuildings =
        archived && Array.isArray(archived.buildings) && archived.buildings.length > 0
          ? archived.buildings.map((bld) => ({
              ...bld,
              health: bld.maxHealth || 600,
              isConstructing: false,
            }))
          : [
              { id: `b_cc_${userId}`, type: 'command_center' as const, level: 2, health: 1200, maxHealth: 1200 },
              { id: `b_cw_${userId}`, type: 'concrete_works' as const, level: 2, health: 600, maxHealth: 600 },
              { id: `b_sf_${userId}`, type: 'steel_foundry' as const, level: 2, health: 650, maxHealth: 650 },
              { id: `b_as_${userId}`, type: 'aluminum_smelter' as const, level: 2, health: 500, maxHealth: 500 },
              { id: `b_fr_${userId}`, type: 'fuel_refinery' as const, level: 2, health: 550, maxHealth: 550 },
              { id: `b_br_${userId}`, type: 'barracks' as const, level: 1, health: 600, maxHealth: 600 },
              { id: `b_vf_${userId}`, type: 'vehicle_factory' as const, level: 2, health: 900, maxHealth: 900 },
              { id: `b_vt_${userId}`, type: 'vulcan_turret' as const, level: 2, health: 450, maxHealth: 450 },
            ];

      const ccLevel = restoredBuildings.find((b) => b.type === 'command_center')?.level || 2;

      const replacementBase: Base = {
        id: newBaseId,
        mapId: spawnRes.mapId,
        name: archived?.name || `${profile.username}'s Forward Redoubt`,
        type: 'home',
        isHomeBase: true,
        lifecycleState: 'protected',
        ownerId: userId,
        ownerName: profile.username,
        allianceId: profile.allianceId || null,
        x: spawnRes.x,
        y: spawnRes.y,
        radius: 4,
        health: 3500,
        maxHealth: 3500,
        hqLevel: ccLevel,
        armorMultiplier: econ.homeBaseArmorMultiplier || 3.0,
        defenseShield: 1200,
        maxShield: 1200,
        captureProgress: 0,
        isProtected: true,
        rebuildProtectionUntil: now + rebuildShieldMs,
        resources: archived?.resources ? { ...archived.resources } : { ...econ.startingResources },
        storageCap: { ...econ.baseStorageCap },
        productionRates: { ...econ.baseGenerationRates },
        lastResourceUpdate: now,
        constructionQueue: [],
        productionQueue: [],
        buildings: restoredBuildings,
        destructionHistory: archived?.destructionHistory || profile.homeBaseDestructionHistory || [],
        lastKnownValidCoords: { x: spawnRes.x, y: spawnRes.y },
        lastMeaningfulActivityAt: now,
      };

      this.data.bases.push(replacementBase);
      profile.homeBaseId = newBaseId;
      profile.homeMapId = spawnRes.mapId;
      profile.currentMapId = spawnRes.mapId;
      profile.isInactiveRelocated = false;
      profile.archivedHomeBase = null;
      profile.lastActiveAt = now;
      profile.lastMapActivityAt = now;

      for (const u of this.data.units) {
        if (u.ownerId === userId) u.homeBaseId = newBaseId;
      }

      this.releaseSpawnReservation(spawnRes.reservationId);
      this.persistBaseAndUnits(replacementBase, []);
      this.persistUser(userId);
      this.saveData();

      return { recovered: true, base: replacementBase };
    });

    if (!lockRes.locked || !lockRes.result) {
      return { recovered: false };
    }
    return lockRes.result;
  }

  public changePlayerHomeMap(
    userId: string,
    targetMapId: string,
    now = Date.now()
  ): { success: boolean; message: string; base?: Base; mapId?: string; coords?: { x: number; y: number } } {
    const userRecord = this.data.users[userId];
    if (!userRecord) {
      return { success: false, message: 'Commander profile not found' };
    }
    const profile = userRecord.profile;
    const targetMap = this.data.maps.find((m) => m.id === targetMapId);
    if (!targetMap || !targetMap.enabled) {
      return { success: false, message: 'Selected sector map is offline or unavailable for Home Base deployment' };
    }

    const homeBase = this.data.bases.find(
      (b) => b.ownerId === userId && (b.id === profile.homeBaseId || b.isHomeBase)
    );
    if (!homeBase) {
      return { success: false, message: 'Active Home Base not found; reconnect to restore headquarters first' };
    }

    const currentMapId = homeBase.mapId || 'map_riverfront_assault';
    if (currentMapId === targetMapId) {
      return { success: false, message: `Your Home Base is already deployed in ${targetMap.name}` };
    }

    // Cannot relocate Home Map while under active hostile siege
    const hostileAttackersNearby = this.data.units.some(
      (u) =>
        (u.mapId || 'map_riverfront_assault') === currentMapId &&
        u.ownerId !== userId &&
        u.ownerId !== 'neutral' &&
        (!profile.allianceId || u.allianceId !== profile.allianceId) &&
        (u.targetBaseId === homeBase.id || Math.hypot(u.x - homeBase.x, u.y - homeBase.y) <= (homeBase.radius || 4) + 8)
    );
    if (hostileAttackersNearby || homeBase.health < homeBase.maxHealth * 0.7) {
      return {
        success: false,
        message: 'Home Base relocation blocked: Headquarters is under active hostile siege or requires structural repair (>70% HP required)',
      };
    }

    // Check cooldown (60 seconds in standard play)
    const cooldownMs = 60 * 1000;
    if (profile.lastHomeMapChangeAt && now - profile.lastHomeMapChangeAt < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - profile.lastHomeMapChangeAt)) / 1000);
      return {
        success: false,
        message: `Home Map redeployment logistics on cooldown (${waitSec}s remaining)`,
      };
    }

    const spawnRes = this.findAndReserveBaseSpawnLocation(targetMapId, profile.allianceId, homeBase.radius || 4, {
      ownerId: userId,
      excludeBaseId: homeBase.id,
      strictMapOnly: true,
    });
    if (!spawnRes.success || spawnRes.mapId !== targetMapId) {
      return {
        success: false,
        message: spawnRes.success
          ? `Target sector ${targetMap.name} has no available HQ deployment zones`
          : spawnRes.reason,
      };
    }

    const oldX = homeBase.x;
    const oldY = homeBase.y;

    homeBase.mapId = spawnRes.mapId;
    homeBase.x = spawnRes.x;
    homeBase.y = spawnRes.y;
    homeBase.lastKnownValidCoords = { x: spawnRes.x, y: spawnRes.y };
    homeBase.lastMeaningfulActivityAt = now;
    homeBase.captureProgress = 0;
    homeBase.capturingPlayerId = null;

    // Relocate garrisoned ground units within 6 tiles of the old Home Base to the new Home Base perimeter
    const garrisonUnits = this.data.units.filter(
      (u) =>
        u.ownerId === userId &&
        (u.mapId || 'map_riverfront_assault') === currentMapId &&
        Math.hypot(u.x - oldX, u.y - oldY) <= 6
    );
    garrisonUnits.forEach((u, idx) => {
      const angle = (idx / Math.max(1, garrisonUnits.length)) * Math.PI * 2;
      u.mapId = spawnRes.mapId;
      u.x = Math.round(spawnRes.x + Math.cos(angle) * 2);
      u.y = Math.round(spawnRes.y + Math.sin(angle) * 2);
      u.path = [];
      u.command = 'idle';
      u.targetUnitId = null;
      u.targetBaseId = null;
    });

    profile.homeMapId = spawnRes.mapId;
    profile.currentMapId = spawnRes.mapId;
    profile.lastHomeMapChangeAt = now;
    profile.lastActiveAt = now;
    profile.lastMapActivityAt = now;

    this.releaseSpawnReservation(spawnRes.reservationId);
    this.persistBaseAndUnits(homeBase, garrisonUnits);
    this.persistUser(userId);
    this.saveData();

    return {
      success: true,
      message: `Home Base '${homeBase.name}' redeployed to ${targetMap.name} at (${spawnRes.x}, ${spawnRes.y})`,
      base: homeBase,
      mapId: spawnRes.mapId,
      coords: { x: spawnRes.x, y: spawnRes.y },
    };
  }

  public getAdminPlayerHomeBaseDiagnostics(targetId: string) {
    const userRecord = this.data.users[targetId];
    const profile = userRecord?.profile;
    const homeBase = this.data.bases.find(
      (b) => b.ownerId === targetId && (b.isHomeBase || (profile && b.id === profile.homeBaseId))
    );
    const econ = this.getEconomyConfig();
    const now = Date.now();
    const inactivityDays = econ.inactivityEvictionDays || 14;
    const lastActivity = profile?.lastMapActivityAt || profile?.lastActiveAt || profile?.lastLoginAt || profile?.joinedAt || now;
    const idleMs = Math.max(0, now - lastActivity);

    return {
      playerId: targetId,
      username: profile?.username || targetId,
      hasActiveHomeBase: Boolean(homeBase),
      homeBaseId: homeBase?.id || profile?.homeBaseId || null,
      homeMapId: homeBase?.mapId || profile?.homeMapId || 'map_riverfront_assault',
      mapId: homeBase?.mapId || profile?.homeMapId || 'map_riverfront_assault',
      coords: homeBase ? { x: homeBase.x, y: homeBase.y } : profile?.archivedHomeBase?.lastValidCoords || null,
      lifecycleState: homeBase?.lifecycleState || (profile?.isInactiveRelocated ? 'ownerless' : 'unknown'),
      health: homeBase?.health ?? 0,
      maxHealth: homeBase?.maxHealth ?? 3500,
      defenseShield: homeBase?.defenseShield ?? 0,
      maxShield: homeBase?.maxShield ?? 1200,
      hqLevel:
        homeBase?.hqLevel ||
        homeBase?.buildings.find((b) => b.type === 'command_center')?.level ||
        1,
      armorMultiplier: homeBase?.armorMultiplier || econ.homeBaseArmorMultiplier || 3.0,
      isProtected: Boolean(
        homeBase?.isProtected ||
          (homeBase?.rebuildProtectionUntil && homeBase.rebuildProtectionUntil > now) ||
          (profile?.beginnerProtectionUntil && profile.beginnerProtectionUntil > now)
      ),
      beginnerProtectionUntil: profile?.beginnerProtectionUntil || 0,
      rebuildProtectionUntil: homeBase?.rebuildProtectionUntil || null,
      isInactiveRelocated: Boolean(profile?.isInactiveRelocated),
      archivedHomeBase: profile?.archivedHomeBase || null,
      lastMapActivityAt: lastActivity,
      idleHours: Math.round((idleMs / 3600000) * 10) / 10,
      inactivityEvictionDays: inactivityDays,
      homeBaseDestroyedCount: profile?.homeBaseDestroyedCount || 0,
      destructionHistory: homeBase?.destructionHistory || profile?.homeBaseDestructionHistory || [],
      placementFailures: profile?.placementFailures || [],
      buildingsCount: homeBase?.buildings.length || 0,
      damagedBuildingsCount: homeBase ? homeBase.buildings.filter((b) => b.health < b.maxHealth).length : 0,
      resources: homeBase?.resources || null,
    };
  }

  public adminManagePlayerHomeBase(
    targetId: string,
    action: 'recover' | 'relocate' | 'repair' | 'reset_cooldowns',
    params: {
      targetMapId?: string;
      reason: string;
      adminId: string;
      adminUsername: string;
      adminRole: AdminRole;
      ipAddress?: string;
    }
  ): { success: boolean; status: number; message: string; diagnostics?: any } {
    const userRecord = this.data.users[targetId];
    if (!userRecord) {
      return { success: false, status: 404, message: 'Target player account not found' };
    }
    const profile = userRecord.profile;
    const now = Date.now();
    const econ = this.getEconomyConfig();

    if (action === 'recover') {
      profile.isInactiveRelocated = true;
      const rec = this.recoverInactivePlayerBaseIfNeeded(targetId, now);
      if (!rec.recovered && !rec.base) {
        return { success: false, status: 400, message: 'Unable to recover or spawn Home Base in available sectors' };
      }
    } else if (action === 'relocate') {
      let homeBase = this.data.bases.find(
        (b) => b.ownerId === targetId && (b.isHomeBase || b.id === profile.homeBaseId)
      );
      if (!homeBase) {
        const rec = this.recoverInactivePlayerBaseIfNeeded(targetId, now);
        homeBase = rec.base;
      }
      if (!homeBase) {
        return { success: false, status: 400, message: 'Player has no Home Base to relocate' };
      }
      const destMapId = params.targetMapId || homeBase.mapId || profile.homeMapId || 'map_riverfront_assault';
      const spawnRes = this.findAndReserveBaseSpawnLocation(destMapId, profile.allianceId, homeBase.radius || 4, {
        ownerId: targetId,
        excludeBaseId: homeBase.id,
      });
      if (!spawnRes.success) {
        return { success: false, status: 400, message: spawnRes.reason };
      }
      homeBase.mapId = spawnRes.mapId;
      homeBase.x = spawnRes.x;
      homeBase.y = spawnRes.y;
      homeBase.lastKnownValidCoords = { x: spawnRes.x, y: spawnRes.y };
      profile.homeMapId = spawnRes.mapId;
      profile.currentMapId = spawnRes.mapId;
      this.releaseSpawnReservation(spawnRes.reservationId);
      this.persistBaseAndUnits(homeBase, []);
    } else if (action === 'repair') {
      const homeBase = this.data.bases.find(
        (b) => b.ownerId === targetId && (b.isHomeBase || b.id === profile.homeBaseId)
      );
      if (!homeBase) {
        return { success: false, status: 404, message: 'Active Home Base not found on map' };
      }
      homeBase.health = homeBase.maxHealth;
      homeBase.defenseShield = homeBase.maxShield;
      homeBase.lifecycleState = homeBase.isProtected ? 'protected' : 'active';
      for (const bld of homeBase.buildings) {
        bld.health = bld.maxHealth;
      }
      this.persistBaseAndUnits(homeBase, []);
    } else if (action === 'reset_cooldowns') {
      profile.lastHomeMapChangeAt = 0;
      const homeBase = this.data.bases.find(
        (b) => b.ownerId === targetId && (b.isHomeBase || b.id === profile.homeBaseId)
      );
      if (homeBase) {
        const shieldMs = (econ.rebuildProtectionDurationMinutes || 30) * 60 * 1000;
        homeBase.rebuildProtectionUntil = now + shieldMs;
        homeBase.isProtected = true;
        homeBase.lifecycleState = 'protected';
        this.persistBaseAndUnits(homeBase, []);
      }
    } else {
      return { success: false, status: 400, message: 'Unsupported Home Base admin action' };
    }

    const modActionMap: Record<typeof action, ModerationRecord['action']> = {
      recover: 'home_base_recover',
      relocate: 'home_base_relocate',
      repair: 'home_base_repair',
      reset_cooldowns: 'home_base_reset_cooldowns',
    };

    profile.moderationHistory = profile.moderationHistory || [];
    profile.moderationHistory.unshift({
      id: `mod_${now}_${Math.random().toString(36).substring(2, 6)}`,
      action: modActionMap[action],
      adminId: params.adminId,
      adminUsername: params.adminUsername,
      reason: params.reason,
      timestamp: now,
    });

    this.addAuditLog({
      adminId: params.adminId,
      adminUsername: params.adminUsername,
      adminRole: params.adminRole,
      action: `player.home_base.${action}`,
      targetType: 'player',
      targetId,
      reason: params.reason,
      status: 'success',
      ipAddress: params.ipAddress || '127.0.0.1',
      metadata: { targetMapId: params.targetMapId },
    });

    this.persistUser(targetId);
    this.saveData();

    return {
      success: true,
      status: 200,
      message: `Home Base action '${action}' executed for ${profile.username}`,
      diagnostics: this.getAdminPlayerHomeBaseDiagnostics(targetId),
    };
  }

  public previewAndMigrateOverlappingBases(dryRun = true): {
    success: boolean;
    overlappingBasesCount: number;
    overlappingPairs: Array<{ baseA: string; baseB: string; distance: number; minRequired: number; mapId: string }>;
    relocatedBases: string[];
  } {
    const econ = this.getEconomyConfig();
    const minBaseDist = econ.minBaseSpawnDistance || 12;
    const overlappingPairs: Array<{ baseA: string; baseB: string; distance: number; minRequired: number; mapId: string }> = [];
    const relocatedBases: string[] = [];

    for (const mapCfg of this.data.maps) {
      const mapBases = this.data.bases.filter((b) => (b.mapId || 'map_riverfront_assault') === mapCfg.id);
      for (let i = 0; i < mapBases.length; i++) {
        for (let j = i + 1; j < mapBases.length; j++) {
          const bA = mapBases[i];
          const bB = mapBases[j];
          const dist = Math.hypot(bA.x - bB.x, bA.y - bB.y);
          const minRequired = (bA.radius || 4) + (bB.radius || 4) + minBaseDist;
          if (dist < minRequired) {
            overlappingPairs.push({
              baseA: `${bA.name} (${bA.id})`,
              baseB: `${bB.name} (${bB.id})`,
              distance: Math.round(dist * 10) / 10,
              minRequired,
              mapId: mapCfg.id,
            });

            if (!dryRun) {
              const toRelocate = !bB.isHomeBase ? bB : !bA.isHomeBase ? bA : bB;
              const spawnRes = this.findAndReserveBaseSpawnLocation(mapCfg.id, toRelocate.allianceId, toRelocate.radius || 4);
              if (spawnRes.success) {
                toRelocate.x = spawnRes.x;
                toRelocate.y = spawnRes.y;
                toRelocate.mapId = spawnRes.mapId;
                this.releaseSpawnReservation(spawnRes.reservationId);
                relocatedBases.push(toRelocate.id);
              }
            }
          }
        }
      }
    }

    if (!dryRun && relocatedBases.length > 0) {
      this.saveData();
    }

    return {
      success: true,
      overlappingBasesCount: overlappingPairs.length,
      overlappingPairs,
      relocatedBases,
    };
  }

  public sanitizeProfile(profile: PlayerProfile): PlayerProfile {
    this.recalculatePlayerProgression(profile);
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const weeklyCaptures = (profile.weeklyCaptureTimestamps || []).filter((t) => t > sevenDaysAgo);
    const pType: PlayerType = profile.playerType || 'human';
    return {
      ...profile,
      homeMapId: profile.homeMapId || profile.currentMapId || 'map_riverfront_assault',
      currentMapId: profile.currentMapId || 'map_riverfront_assault',
      weeklyCaptureTimestamps: weeklyCaptures,
      weeklyCapturesCount: weeklyCaptures.length,
      homeBaseDestroyedCount: profile.homeBaseDestroyedCount || 0,
      claimedRewardIds: profile.claimedRewardIds || [],
      highwayTransfersCompleted: profile.highwayTransfersCompleted || 0,
      lastActiveAt: profile.lastActiveAt || profile.lastLoginAt || profile.joinedAt,
      isInactiveRelocated: Boolean(profile.isInactiveRelocated),
      status: profile.status || 'active',
      adminRole: profile.adminRole || null,
      isAdmin: Boolean(profile.adminRole || profile.isAdmin),
      moderationHistory: profile.moderationHistory || [],
      playerType: pType,
      accountId: profile.accountId !== undefined ? profile.accountId : pType === 'human' ? profile.id : null,
      botAgentId: profile.botAgentId ?? null,
      controlSource: profile.controlSource || (pType === 'unknown' ? 'unverified' : 'human'),
      verificationStatus:
        profile.verificationStatus || (pType === 'unknown' ? 'legacy_unverified' : 'verified'),
      verifiedBy: profile.verifiedBy ?? null,
      verifiedAt: profile.verifiedAt ?? null,
    };
  }

  // ==========================================================================
  // AUTHORITATIVE PLAYER TYPE, BOT REGISTRY & ADMIN PLAYER DIRECTORY
  // ==========================================================================

  public recordBotActivity(playerId: string, difficulty: AIDifficulty, now = Date.now()): void {
    if (!this.data.botRegistry) {
      this.data.botRegistry = {};
    }
    const existing = this.data.botRegistry[playerId];
    const botMaps = Array.from(
      new Set<string>([
        ...this.data.bases
          .filter((b) => b.ownerId === playerId)
          .map((b) => b.mapId || 'map_riverfront_assault'),
        ...this.data.units
          .filter((u) => u.ownerId === playerId)
          .map((u) => u.mapId || 'map_riverfront_assault'),
      ])
    );
    const botMatchIds = (this.data.matches || [])
      .filter((m) => m.status === 'active' && (m.participantIds || []).includes(playerId))
      .map((m) => m.id);
    const aiEnabled = this.data.systemSettings?.aiAggressionEnabled !== false;

    this.data.botRegistry[playerId] = {
      botId: existing?.botId || `bot_${playerId}`,
      playerId,
      playerType: 'bot',
      displayName: existing?.displayName || (playerId === 'enemy_insurgent' ? 'Kodiak PMC' : playerId),
      faction: existing?.faction || 'Kodiak Autonomous Command',
      difficulty: difficulty || existing?.difficulty || 'medium',
      aiProfile: existing?.aiProfile || 'Combined Arms Siege & Recon AI',
      activeMapIds: botMaps.length > 0 ? botMaps : existing?.activeMapIds || ['map_riverfront_assault'],
      matchIds: botMatchIds,
      controlSource: 'ai_controller',
      controlStatus: aiEnabled ? 'autonomous_active' : 'paused',
      creationSource: existing?.creationSource || 'server_simulation_engine',
      state: aiEnabled ? 'active' : 'paused',
      createdAt: existing?.createdAt || now,
      lastDecisionAt: now,
    };
  }

  public registerBotAgent(
    config: Partial<BotAgentRecord> & { playerId: string; displayName: string }
  ): BotAgentRecord {
    const now = Date.now();
    if (!this.data.botRegistry) {
      this.data.botRegistry = {};
    }
    const existing = this.data.botRegistry[config.playerId];
    const record: BotAgentRecord = {
      botId: config.botId || existing?.botId || `bot_${config.playerId}`,
      playerId: config.playerId,
      playerType: 'bot',
      displayName: config.displayName,
      faction: config.faction || existing?.faction || 'Kodiak Autonomous Command',
      difficulty: config.difficulty || existing?.difficulty || 'medium',
      aiProfile: config.aiProfile || existing?.aiProfile || 'Combined Arms Siege & Recon AI',
      activeMapIds: config.activeMapIds || existing?.activeMapIds || ['map_riverfront_assault'],
      matchIds: config.matchIds || existing?.matchIds || ['match_sector_01_live'],
      controlSource: 'ai_controller',
      controlStatus: config.controlStatus || existing?.controlStatus || 'autonomous_active',
      creationSource: config.creationSource || existing?.creationSource || 'server_simulation_engine',
      state: config.state || existing?.state || 'active',
      createdAt: config.createdAt || existing?.createdAt || now,
      lastDecisionAt: config.lastDecisionAt || existing?.lastDecisionAt || now,
    };
    this.data.botRegistry[config.playerId] = record;
    return record;
  }

  public resolvePlayerIdentity(
    playerId: string,
    onlineUserIds: Set<string> = new Set(),
    aiDifficulty: AIDifficulty = 'medium'
  ): AdminPlayerRecord {
    const now = Date.now();
    const ownedBases = this.data.bases.filter((b) => b.ownerId === playerId);
    const ownedUnits = this.data.units.filter((u) => u.ownerId === playerId);
    const totalKills = ownedUnits.reduce((acc, u) => acc + (u.kills || 0), 0);

    const activeMapIds = Array.from(
      new Set<string>([
        ...ownedBases.map((b) => b.mapId || 'map_riverfront_assault'),
        ...ownedUnits.map((u) => u.mapId || 'map_riverfront_assault'),
      ])
    );
    const activeMatches = (this.data.matches || []).filter(
      (m) =>
        m.status === 'active' &&
        ((m.participantIds || []).includes(playerId) || activeMapIds.includes(m.mapId))
    );
    const activeMatchIds = activeMatches.map((m) => m.id);

    // 1. Check authoritative Bot Registry first (prevents bots from ever being confused with users)
    const botRec = this.data.botRegistry?.[playerId];
    if (botRec || playerId === 'enemy_insurgent') {
      const effectiveDifficulty = aiDifficulty || botRec?.difficulty || 'medium';
      const aiEnabled = this.data.systemSettings?.aiAggressionEnabled !== false;
      const isBotActive = aiEnabled && (ownedBases.length > 0 || ownedUnits.length > 0);
      const primaryMapId =
        activeMapIds[0] || botRec?.activeMapIds?.[0] || 'map_riverfront_assault';
      const primaryMap = this.getMapConfig(primaryMapId);
      const botScore = ownedBases.length * 650 + ownedUnits.length * 120 + totalKills * 45;
      const { level } = calculateRankFromScore(botScore);

      return {
        id: playerId,
        username: botRec?.displayName || 'Kodiak PMC',
        email: 'ai-agent@simulation.internal',
        rank: `AI Tactical Agent (${effectiveDifficulty.toUpperCase()})`,
        score: botScore,
        level,
        avatar: 'bot',
        playerType: 'bot',
        accountId: null,
        botAgentId: botRec?.botId || 'bot_kodiak_pmc',
        controlSource: 'ai_controller',
        controlStatus: isBotActive
          ? `Autonomous AI Active (${effectiveDifficulty.toUpperCase()})`
          : aiEnabled
          ? 'Standby (No Active Units/Bases)'
          : 'AI Aggression Paused',
        creationSource: botRec?.creationSource || 'server_simulation_engine',
        verificationStatus: 'system_registered',
        verifiedBy: 'Server Simulation Authority',
        verifiedAt: botRec?.createdAt || now,
        botDifficulty: effectiveDifficulty,
        botAiProfile: botRec?.aiProfile || 'Combined Arms Siege & Recon AI',
        faction: botRec?.faction || 'Kodiak Autonomous Command',
        allianceId: null,
        allianceName: null,
        allianceTag: 'AI',
        allianceRole: null,
        homeBaseId: ownedBases[0]?.id || '',
        currentMapId: primaryMapId,
        currentMapName: primaryMap?.name || primaryMapId,
        activeMatchId: activeMatchIds[0] || null,
        activeMatchIds,
        activeMapIds: activeMapIds.length > 0 ? activeMapIds : botRec?.activeMapIds || [primaryMapId],
        status: aiEnabled ? 'active' : 'suspended',
        connectionStatus: isBotActive ? 'online' : 'offline',
        isOnline: isBotActive,
        isAdmin: false,
        adminRole: null,
        basesControlled: ownedBases.length,
        activeUnits: ownedUnits.length,
        totalBasesCaptured: ownedBases.length,
        totalUnitsProduced: ownedUnits.length,
        totalUnitsDestroyed: totalKills,
        totalResourcesHarvested: ownedBases.reduce(
          (sum, b) =>
            sum +
            Math.round(
              (b.resources?.concrete || 0) +
                (b.resources?.steel || 0) +
                (b.resources?.aluminum || 0) +
                (b.resources?.fuel || 0)
            ),
          0
        ),
        joinedAt: botRec?.createdAt || now - 86400000 * 14,
        lastLoginAt: botRec?.lastDecisionAt || now,
        lastActiveAt: botRec?.lastDecisionAt || now,
        suspendedUntil: null,
        banReason: null,
        moderationHistory: [],
      };
    }

    // 2. Check authoritative System Entity Registry (e.g. neutral world garrisons)
    const sysRec = this.data.systemEntities?.[playerId];
    if (sysRec || playerId === 'neutral') {
      const primaryMapId =
        activeMapIds[0] || sysRec?.activeMapIds?.[0] || 'map_riverfront_assault';
      const primaryMap = this.getMapConfig(primaryMapId);
      const isSysOnline = ownedBases.length > 0 || ownedUnits.length > 0;

      return {
        id: playerId,
        username: sysRec?.displayName || 'Neutral Territory',
        email: 'system@simulation.internal',
        rank: 'System World Entity',
        score: 0,
        level: 1,
        avatar: 'system',
        playerType: 'system',
        accountId: null,
        botAgentId: null,
        controlSource: 'system',
        controlStatus: 'Server World Simulation Entity',
        creationSource: sysRec?.creationSource || 'world_generator',
        verificationStatus: 'system_registered',
        verifiedBy: 'Server World Generator',
        verifiedAt: sysRec?.createdAt || now,
        botDifficulty: null,
        botAiProfile: null,
        faction: sysRec?.faction || 'Unclaimed Sector Installations',
        allianceId: null,
        allianceName: null,
        allianceTag: 'SYS',
        allianceRole: null,
        homeBaseId: ownedBases[0]?.id || '',
        currentMapId: primaryMapId,
        currentMapName: primaryMap?.name || primaryMapId,
        activeMatchId: activeMatchIds[0] || null,
        activeMatchIds,
        activeMapIds: activeMapIds.length > 0 ? activeMapIds : sysRec?.activeMapIds || [primaryMapId],
        status: 'active',
        connectionStatus: isSysOnline ? 'online' : 'offline',
        isOnline: isSysOnline,
        isAdmin: false,
        adminRole: null,
        basesControlled: ownedBases.length,
        activeUnits: ownedUnits.length,
        totalBasesCaptured: 0,
        totalUnitsProduced: ownedUnits.length,
        totalUnitsDestroyed: totalKills,
        totalResourcesHarvested: 0,
        joinedAt: sysRec?.createdAt || now - 86400000 * 14,
        lastLoginAt: sysRec?.lastUpdatedAt || now,
        lastActiveAt: sysRec?.lastUpdatedAt || now,
        suspendedUntil: null,
        banReason: null,
        moderationHistory: [],
      };
    }

    // 3. Check registered user account in data.users
    const userRecord = this.data.users[playerId];
    if (userRecord && userRecord.profile) {
      const p = this.sanitizeProfile(userRecord.profile);
      const hasValidAuth =
        typeof userRecord.passwordHash === 'string' && userRecord.passwordHash.trim().length > 0;
      const isVerifiedHuman =
        (p.playerType === 'human' && hasValidAuth) ||
        (p.playerType === 'human' && p.verificationStatus === 'admin_verified');

      const resolvedType: PlayerType = isVerifiedHuman
        ? 'human'
        : p.playerType === 'bot' || p.playerType === 'system'
        ? p.playerType
        : 'unknown';
      const alliance = this.data.alliances.find((a) => a.id === p.allianceId);
      const primaryMapId = p.currentMapId || activeMapIds[0] || 'map_riverfront_assault';
      const primaryMap = this.getMapConfig(primaryMapId);
      const isOnline = onlineUserIds.has(playerId);
      const userMapIds = Array.from(new Set<string>([primaryMapId, ...activeMapIds]));

      return {
        id: p.id,
        username: p.username,
        email: p.email,
        rank: p.rank,
        score: p.score,
        level: p.level,
        avatar: p.avatar,
        playerType: resolvedType,
        accountId: resolvedType === 'human' ? p.accountId || p.id : null,
        botAgentId: null,
        controlSource: resolvedType === 'human' ? 'human' : 'unverified',
        controlStatus:
          resolvedType === 'human'
            ? isOnline
              ? 'Authenticated Live Session'
              : 'Registered Account (Offline)'
            : 'Unverified Legacy Record',
        creationSource:
          resolvedType === 'human' ? 'authenticated_account' : 'legacy_unverified_record',
        verificationStatus:
          p.verificationStatus ||
          (resolvedType === 'human' ? 'verified' : 'legacy_unverified'),
        verifiedBy: p.verifiedBy || (resolvedType === 'human' ? 'Auth Service' : null),
        verifiedAt: p.verifiedAt || (resolvedType === 'human' ? p.joinedAt : null),
        botDifficulty: null,
        botAiProfile: null,
        faction: alliance ? `[${alliance.tag}] ${alliance.name}` : 'Independent Commander',
        allianceId: p.allianceId,
        allianceName: alliance?.name || null,
        allianceTag: alliance?.tag || null,
        allianceRole: p.allianceRole || null,
        homeBaseId: p.homeBaseId,
        currentMapId: primaryMapId,
        currentMapName: primaryMap?.name || primaryMapId,
        activeMatchId: activeMatchIds[0] || null,
        activeMatchIds,
        activeMapIds: userMapIds,
        status: p.status || 'active',
        connectionStatus: isOnline ? 'online' : 'offline',
        isOnline,
        isAdmin: p.isAdmin,
        adminRole: p.adminRole,
        basesControlled: ownedBases.length,
        activeUnits: ownedUnits.length,
        totalBasesCaptured: p.totalBasesCaptured,
        totalUnitsProduced: p.totalUnitsProduced,
        totalUnitsDestroyed: p.totalUnitsDestroyed,
        totalResourcesHarvested: p.totalResourcesHarvested,
        joinedAt: p.joinedAt,
        lastLoginAt: p.lastLoginAt,
        lastActiveAt: p.lastActiveAt || p.lastLoginAt || p.joinedAt,
        suspendedUntil: p.suspendedUntil,
        banReason: p.banReason,
        moderationHistory: p.moderationHistory || [],
      };
    }

    // 4. Unresolved / Orphaned Identity referenced in bases, units, or matches -> UNKNOWN
    const fallbackName =
      ownedBases[0]?.ownerName ||
      ownedUnits[0]?.ownerName ||
      `Unresolved Entity (${playerId})`;
    const primaryMapId = activeMapIds[0] || 'map_riverfront_assault';
    const primaryMap = this.getMapConfig(primaryMapId);
    const isOnline = onlineUserIds.has(playerId);

    return {
      id: playerId,
      username: fallbackName,
      email: 'unverified@unknown.local',
      rank: 'Unverified Identity',
      score: 0,
      level: 1,
      avatar: 'unknown',
      playerType: 'unknown',
      accountId: null,
      botAgentId: null,
      controlSource: 'unverified',
      controlStatus: 'Unresolved / Legacy Entity Reference',
      creationSource: 'unverified_entity_reference',
      verificationStatus: 'legacy_unverified',
      verifiedBy: null,
      verifiedAt: null,
      botDifficulty: null,
      botAiProfile: null,
      faction: 'Unverified Faction',
      allianceId: null,
      allianceName: null,
      allianceTag: null,
      allianceRole: null,
      homeBaseId: ownedBases[0]?.id || '',
      currentMapId: primaryMapId,
      currentMapName: primaryMap?.name || primaryMapId,
      activeMatchId: activeMatchIds[0] || null,
      activeMatchIds,
      activeMapIds: activeMapIds.length > 0 ? activeMapIds : [primaryMapId],
      status: 'active',
      connectionStatus: isOnline ? 'online' : 'offline',
      isOnline,
      isAdmin: false,
      adminRole: null,
      basesControlled: ownedBases.length,
      activeUnits: ownedUnits.length,
      totalBasesCaptured: 0,
      totalUnitsProduced: ownedUnits.length,
      totalUnitsDestroyed: totalKills,
      totalResourcesHarvested: 0,
      joinedAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
      suspendedUntil: null,
      banReason: null,
      moderationHistory: [],
    };
  }

  public getAdminPlayerDirectory(
    onlineUserIds: Set<string> = new Set(),
    aiDifficulty: AIDifficulty = 'medium'
  ): AdminPlayerRecord[] {
    const allIds = new Set<string>();
    for (const uid of Object.keys(this.data.users || {})) {
      if (uid) allIds.add(uid);
    }
    for (const botId of Object.keys(this.data.botRegistry || {})) {
      if (botId) allIds.add(botId);
    }
    for (const sysId of Object.keys(this.data.systemEntities || {})) {
      if (sysId) allIds.add(sysId);
    }
    for (const b of this.data.bases || []) {
      if (b.ownerId) allIds.add(b.ownerId);
    }
    for (const u of this.data.units || []) {
      if (u.ownerId) allIds.add(u.ownerId);
    }
    for (const m of this.data.matches || []) {
      for (const pid of m.participantIds || []) {
        if (pid) allIds.add(pid);
      }
    }

    const records: AdminPlayerRecord[] = [];
    for (const id of allIds) {
      records.push(this.resolvePlayerIdentity(id, onlineUserIds, aiDifficulty));
    }
    return records;
  }

  public getPlayerTypeStats(
    onlineUserIds: Set<string> = new Set(),
    aiDifficulty: AIDifficulty = 'medium'
  ): PlayerTypeStatsSummary {
    const directory = this.getAdminPlayerDirectory(onlineUserIds, aiDifficulty);
    let totalHumanPlayers = 0;
    let activeHumanPlayers = 0;
    let offlineHumanPlayers = 0;
    let totalBotPlayers = 0;
    let activeBotPlayers = 0;
    let totalSystemEntities = 0;
    let totalUnknownPlayers = 0;

    for (const rec of directory) {
      if (rec.playerType === 'human') {
        totalHumanPlayers++;
        if (rec.isOnline) activeHumanPlayers++;
        else offlineHumanPlayers++;
      } else if (rec.playerType === 'bot') {
        totalBotPlayers++;
        if (rec.isOnline) activeBotPlayers++;
      } else if (rec.playerType === 'system') {
        totalSystemEntities++;
      } else {
        totalUnknownPlayers++;
      }
    }

    return {
      totalPlayers: directory.length,
      totalHumanPlayers,
      activeHumanPlayers,
      offlineHumanPlayers,
      totalBotPlayers,
      activeBotPlayers,
      totalSystemEntities,
      totalUnknownPlayers,
    };
  }

  public getMatchParticipants(
    mapId: string,
    onlineUserIds: Set<string> = new Set(),
    explicitParticipantIds: string[] = [],
    aiDifficulty: AIDifficulty = 'medium'
  ): MatchParticipantSummary[] {
    const participantIds = new Set<string>(explicitParticipantIds.filter(Boolean));
    for (const b of this.data.bases) {
      if ((b.mapId || 'map_riverfront_assault') === mapId && b.ownerId) {
        participantIds.add(b.ownerId);
      }
    }
    for (const u of this.data.units) {
      if ((u.mapId || 'map_riverfront_assault') === mapId && u.ownerId) {
        participantIds.add(u.ownerId);
      }
    }

    const participants: MatchParticipantSummary[] = [];
    for (const pid of participantIds) {
      const resolved = this.resolvePlayerIdentity(pid, onlineUserIds, aiDifficulty);
      const mapBasesCount = this.data.bases.filter(
        (b) => (b.mapId || 'map_riverfront_assault') === mapId && b.ownerId === pid
      ).length;
      const mapUnitsCount = this.data.units.filter(
        (u) => (u.mapId || 'map_riverfront_assault') === mapId && u.ownerId === pid
      ).length;

      participants.push({
        playerId: resolved.id,
        username: resolved.username,
        playerType: resolved.playerType,
        faction: resolved.faction,
        allianceTag: resolved.allianceTag,
        controlSource: resolved.controlSource,
        isOnline: resolved.isOnline,
        basesCount: mapBasesCount,
        unitsCount: mapUnitsCount,
        botDifficulty: resolved.botDifficulty,
      });
    }

    const typePriority: Record<PlayerType, number> = {
      human: 1,
      bot: 2,
      system: 3,
      unknown: 4,
    };
    return participants.sort(
      (a, b) =>
        typePriority[a.playerType] - typePriority[b.playerType] ||
        b.basesCount - a.basesCount ||
        a.username.localeCompare(b.username)
    );
  }

  public getAdminPlayerDetail(
    targetId: string,
    onlineUserIds: Set<string> = new Set(),
    aiDifficulty: AIDifficulty = 'medium'
  ) {
    const existsInUsers = Boolean(this.data.users[targetId]);
    const existsInBots = Boolean(this.data.botRegistry?.[targetId]) || targetId === 'enemy_insurgent';
    const existsInSystem = Boolean(this.data.systemEntities?.[targetId]) || targetId === 'neutral';
    const existsInWorld =
      this.data.bases.some((b) => b.ownerId === targetId) ||
      this.data.units.some((u) => u.ownerId === targetId) ||
      (this.data.matches || []).some((m) => (m.participantIds || []).includes(targetId));

    if (!existsInUsers && !existsInBots && !existsInSystem && !existsInWorld) {
      return null;
    }

    const profile = this.resolvePlayerIdentity(targetId, onlineUserIds, aiDifficulty);
    const ownedBases = this.data.bases.filter((b) => b.ownerId === targetId);
    const ownedUnits = this.data.units.filter((u) => u.ownerId === targetId);
    const alliance = this.data.alliances.find((a) => a.id === profile.allianceId) || null;
    const recentAudits = this.data.auditLogs
      .filter((a) => a.targetId === targetId || a.adminId === targetId)
      .slice(0, 30);

    return {
      profile,
      isOnline: profile.isOnline,
      alliance,
      bases: ownedBases,
      units: ownedUnits,
      recentAudits,
      botRecord: this.data.botRegistry?.[targetId] || null,
      systemRecord: this.data.systemEntities?.[targetId] || null,
      homeBaseDiagnostics: this.getAdminPlayerHomeBaseDiagnostics(targetId),
    };
  }

  public verifyUnknownPlayerType(
    targetId: string,
    newType: PlayerType,
    adminId: string,
    adminUsername: string,
    adminRole: AdminRole,
    reason: string,
    ipAddress = '127.0.0.1'
  ): {
    success: boolean;
    status: number;
    message: string;
    record?: AdminPlayerRecord;
  } {
    if (!['human', 'bot', 'system', 'unknown'].includes(newType)) {
      return {
        success: false,
        status: 400,
        message: 'Invalid playerType. Must be human, bot, system, or unknown.',
      };
    }

    const current = this.resolvePlayerIdentity(targetId);
    const userRecord = this.data.users[targetId];
    const hasVerifiedHumanCredentials =
      current.playerType === 'human' &&
      Boolean(userRecord?.passwordHash && userRecord.passwordHash.trim().length > 0);

    if (hasVerifiedHumanCredentials && newType !== 'human') {
      return {
        success: false,
        status: 400,
        message:
          'Security Policy Violation: Verified human accounts cannot be converted into bots or system entities.',
      };
    }

    if (current.playerType === 'bot' && targetId === 'enemy_insurgent' && newType !== 'bot') {
      return {
        success: false,
        status: 400,
        message: 'Core AI agent (enemy_insurgent) is registered to the server AI controller and must remain BOT.',
      };
    }

    if (current.playerType === 'system' && targetId === 'neutral' && newType !== 'system') {
      return {
        success: false,
        status: 400,
        message: 'Core world entity (neutral) is controlled by the world generator and must remain SYSTEM.',
      };
    }

    const now = Date.now();
    const beforeSnapshot = {
      playerType: current.playerType,
      controlSource: current.controlSource,
      verificationStatus: current.verificationStatus,
    };

    if (newType === 'bot') {
      if (this.data.users[targetId]) {
        delete this.data.users[targetId];
      }
      this.registerBotAgent({
        playerId: targetId,
        displayName: current.username,
        faction: 'Autonomous AI Attachment',
        difficulty: 'medium',
        aiProfile: 'Verified Tactical Bot Agent',
        activeMapIds: current.activeMapIds,
        matchIds: current.activeMatchIds,
      });
    } else if (newType === 'system') {
      if (this.data.users[targetId]) {
        delete this.data.users[targetId];
      }
      if (!this.data.systemEntities) this.data.systemEntities = {};
      this.data.systemEntities[targetId] = {
        entityId: `sys_${targetId}`,
        playerId: targetId,
        playerType: 'system',
        displayName: current.username,
        faction: 'System Controlled Entity',
        activeMapIds: current.activeMapIds,
        controlSource: 'system',
        creationSource: 'admin_verified_system_entity',
        state: 'active',
        createdAt: current.joinedAt || now,
        lastUpdatedAt: now,
      };
    } else if (newType === 'human') {
      if (this.data.botRegistry?.[targetId]) {
        delete this.data.botRegistry[targetId];
      }
      if (this.data.systemEntities?.[targetId]) {
        delete this.data.systemEntities[targetId];
      }
      if (this.data.users[targetId]?.profile) {
        const prof = this.data.users[targetId].profile;
        prof.playerType = 'human';
        prof.accountId = targetId;
        prof.botAgentId = null;
        prof.controlSource = 'human';
        prof.verificationStatus = 'admin_verified';
        prof.verifiedBy = adminUsername;
        prof.verifiedAt = now;
        prof.moderationHistory = prof.moderationHistory || [];
        prof.moderationHistory.unshift({
          id: `mod_${now}`,
          action: 'verify_type',
          reason,
          adminId,
          adminUsername,
          timestamp: now,
        });
        this.persistUser(targetId);
      } else {
        return {
          success: false,
          status: 400,
          message: 'Cannot classify entity as HUMAN without an underlying user account record.',
        };
      }
    } else {
      if (this.data.users[targetId]?.profile) {
        const prof = this.data.users[targetId].profile;
        prof.playerType = 'unknown';
        prof.accountId = null;
        prof.botAgentId = null;
        prof.controlSource = 'unverified';
        prof.verificationStatus = 'legacy_unverified';
        prof.verifiedBy = adminUsername;
        prof.verifiedAt = now;
      }
    }

    const updated = this.resolvePlayerIdentity(targetId);
    this.addAuditLog({
      adminId,
      adminUsername,
      adminRole,
      action: 'player.verify_type',
      targetType: 'player',
      targetId,
      reason,
      status: 'success',
      ipAddress,
      metadata: {
        before: beforeSnapshot,
        after: {
          playerType: updated.playerType,
          controlSource: updated.controlSource,
          verificationStatus: updated.verificationStatus,
        },
      },
    });
    this.saveData();

    return {
      success: true,
      status: 200,
      message: `Player ${updated.username} (${targetId}) classification verified as ${updated.playerType.toUpperCase()}.`,
      record: updated,
    };
  }

  public deletePlayerAccount(
    targetId: string,
    adminId: string,
    adminUsername: string,
    adminRole: AdminRole,
    reason: string,
    ipAddress = '127.0.0.1'
  ): {
    success: boolean;
    status: number;
    message: string;
    deletedUserId?: string;
    deletedUsername?: string;
  } {
    if (targetId === 'enemy_insurgent' || this.data.botRegistry?.[targetId]) {
      return {
        success: false,
        status: 400,
        message: 'Cannot delete server-registered AI BOT entities via player account deletion.',
      };
    }
    if (targetId === 'neutral' || this.data.systemEntities?.[targetId]) {
      return {
        success: false,
        status: 400,
        message: 'Cannot delete core SYSTEM world entities.',
      };
    }

    const existingUser = this.data.users[targetId];
    const hasWorldFootprint =
      this.data.bases.some((b) => b.ownerId === targetId) ||
      this.data.units.some((u) => u.ownerId === targetId);

    if (!existingUser && !hasWorldFootprint) {
      return {
        success: false,
        status: 404,
        message: `Account '${targetId}' not found.`,
      };
    }

    if (existingUser?.profile.adminRole === 'super_admin' && adminRole !== 'super_admin') {
      return {
        success: false,
        status: 403,
        message: 'Only a Super Admin can delete a Super Admin account.',
      };
    }

    const deletedUsername =
      existingUser?.profile.username ||
      this.data.bases.find((b) => b.ownerId === targetId)?.ownerName ||
      targetId;

    // 1. If in an alliance, remove or disband cleanly
    if (existingUser?.profile.allianceId) {
      this.leaveAlliance(targetId);
    }
    for (const al of this.data.alliances) {
      al.memberIds = (al.memberIds || []).filter((id) => id !== targetId);
      if (al.memberRoles) delete al.memberRoles[targetId];
      al.joinRequests = (al.joinRequests || []).filter((r) => r.userId !== targetId);
      al.invites = (al.invites || []).filter((i) => i.userId !== targetId);
    }
    this.data.alliances = this.data.alliances.filter((al) => al.memberIds.length > 0);

    // 2. Revoke tokens and convert caller session to console_staff if deleting own user account
    for (const [tok, uid] of Object.entries(this.data.tokens)) {
      if (uid === targetId) {
        delete this.data.tokens[tok];
      }
    }
    for (const [tok, sess] of Object.entries(this.data.adminSessions)) {
      if (sess.userId === targetId) {
        if (targetId === adminId) {
          sess.userId = `console_staff:${sess.username.toLowerCase()}`;
        } else {
          delete this.data.adminSessions[tok];
        }
      }
    }

    // 3. Remove user account record
    delete this.data.users[targetId];

    // 4. Remove all units owned by targetId
    this.data.units = this.data.units.filter((u) => u.ownerId !== targetId);

    // 5. Remove dynamically spawned player home bases and neutralize any captured sector bases
    this.data.bases = this.data.bases.filter((b) => {
      if (b.ownerId !== targetId) return true;
      const isDynamicSpawnBase =
        b.id.startsWith('base_home_user_') ||
        b.id.startsWith(`base_home_${targetId}`);
      return !isDynamicSpawnBase;
    });

    for (const b of this.data.bases) {
      if (b.ownerId === targetId) {
        b.ownerId = 'neutral';
        b.ownerName = 'Neutral Territory';
        b.allianceId = null;
        b.isHomeBase = false;
        b.isProtected = false;
        b.rebuildProtectionUntil = null;
        b.lifecycleState = 'ownerless';
        b.captureProgress = 0;
        b.productionQueue = [];
        b.constructionQueue = [];
      }
    }

    // 6. Clean match participant lists, notifications, support tickets, and fog of war
    for (const m of this.data.matches || []) {
      if (Array.isArray(m.participantIds)) {
        m.participantIds = m.participantIds.filter((pid) => pid !== targetId);
      }
    }
    this.data.notifications = (this.data.notifications || []).filter((n) => n.userId !== targetId);
    this.data.supportTickets = (this.data.supportTickets || []).filter((t) => t.userId !== targetId);
    if (this.data.exploredByUserMap?.[targetId]) {
      delete this.data.exploredByUserMap[targetId];
    }

    if (Object.keys(this.data.users).length === 0) {
      this.data.accountsPurged = true;
    }

    this.addAuditLog({
      adminId,
      adminUsername,
      adminRole,
      action: 'player.delete_account',
      targetType: 'player',
      targetId,
      reason,
      status: 'success',
      ipAddress,
      metadata: {
        deletedUsername,
        remainingAccounts: Object.keys(this.data.users).length,
      },
    });
    this.saveData();

    return {
      success: true,
      status: 200,
      message: `Account '${deletedUsername}' (${targetId}) and all associated units/bases have been permanently deleted.`,
      deletedUserId: targetId,
      deletedUsername,
    };
  }

  public deleteAllPlayerAccounts(
    adminId: string,
    adminUsername: string,
    adminRole: AdminRole,
    reason: string,
    ipAddress = '127.0.0.1'
  ): {
    success: boolean;
    status: number;
    message: string;
    deletedCount: number;
    deletedUserIds: string[];
  } {
    const deletedUserIds = Object.keys(this.data.users);
    const deletedCount = deletedUserIds.length;

    // 1. Wipe all user accounts, player tokens, and alliances
    this.data.users = {};
    this.data.tokens = {};
    this.data.alliances = [];
    this.data.accountsPurged = true;

    // Preserve active admin console sessions as console_staff sessions so operator stays authenticated
    for (const [, sess] of Object.entries(this.data.adminSessions)) {
      if (!sess.userId.startsWith('console_staff:')) {
        sess.userId = `console_staff:${sess.username.toLowerCase()}`;
      }
    }

    // 2. Remove all non-bot / non-system units
    this.data.units = this.data.units.filter(
      (u) => u.ownerId === 'enemy_insurgent' || u.ownerId === 'neutral' || Boolean(this.data.botRegistry?.[u.ownerId])
    );

    // 3. Remove all dynamically spawned player home bases and neutralize any remaining player-owned sector bases
    this.data.bases = this.data.bases.filter((b) => {
      if (b.ownerId === 'enemy_insurgent' || b.ownerId === 'neutral' || Boolean(this.data.botRegistry?.[b.ownerId])) {
        return true;
      }
      const isDynamicSpawnBase =
        b.id.startsWith('base_home_user_') ||
        (b.id.startsWith('base_home_') && b.id !== 'base_home_player');
      return !isDynamicSpawnBase;
    });

    for (const b of this.data.bases) {
      if (b.ownerId !== 'enemy_insurgent' && b.ownerId !== 'neutral' && !this.data.botRegistry?.[b.ownerId]) {
        b.ownerId = 'neutral';
        b.ownerName = 'Neutral Territory';
        b.allianceId = null;
        b.isHomeBase = false;
        b.isProtected = false;
        b.rebuildProtectionUntil = null;
        b.lifecycleState = 'ownerless';
        b.captureProgress = 0;
        b.productionQueue = [];
        b.constructionQueue = [];
      }
    }

    // 4. Clean match participants, notifications, support tickets, explored map state, and player chat
    for (const m of this.data.matches || []) {
      m.participantIds = (m.participantIds || []).filter(
        (pid) => pid === 'enemy_insurgent' || pid === 'neutral' || Boolean(this.data.botRegistry?.[pid])
      );
      if (m.participantIds.length === 0) {
        m.participantIds = ['enemy_insurgent'];
      }
    }
    this.data.notifications = [];
    this.data.supportTickets = [];
    this.data.exploredByUserMap = {};
    this.data.chat = (this.data.chat || []).filter(
      (c) => c.senderId === 'system' || c.channel === 'system'
    );

    this.addAuditLog({
      adminId,
      adminUsername,
      adminRole,
      action: 'player.delete_all_accounts',
      targetType: 'system',
      targetId: 'all_accounts',
      reason,
      status: 'success',
      ipAddress,
      metadata: {
        deletedCount,
      },
    });
    this.saveData();

    return {
      success: true,
      status: 200,
      message: `All ${deletedCount} player account(s), sessions, alliances, and player-owned battlefield assets have been permanently deleted.`,
      deletedCount,
      deletedUserIds,
    };
  }

  // ==========================================================================
  // FULL ALLIANCE MANAGEMENT (PHASE 5)
  // ==========================================================================

  private getRoleRank(role?: AllianceRole | null): number {
    if (role === 'leader') return 4;
    if (role === 'co_leader') return 3;
    if (role === 'officer') return 2;
    if (role === 'member') return 1;
    return 0;
  }

  private logAllianceActivity(alliance: Alliance, text: string) {
    if (!alliance.activityLog) alliance.activityLog = [];
    alliance.activityLog.unshift({
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text,
      timestamp: Date.now(),
    });
    if (alliance.activityLog.length > 50) {
      alliance.activityLog = alliance.activityLog.slice(0, 50);
    }
  }

  public syncAllianceStats(alliance: Alliance) {
    let totalScore = 0;
    for (const mId of alliance.memberIds) {
      totalScore += this.data.users[mId]?.profile.score || 0;
    }
    alliance.score = totalScore;
    alliance.territoryBasesCount = this.data.bases.filter((b) => b.allianceId === alliance.id).length;
  }

  public createAlliance(
    userId: string,
    name: string,
    tag: string,
    description: string,
    bannerColor = '#2563eb',
    recruitmentMode: AllianceRecruitmentMode = 'open'
  ): { success: boolean; message?: string; alliance?: Alliance } {
    if (!this.data.systemSettings.alliancesEnabled) {
      return { success: false, message: 'Alliances are currently disabled by Command' };
    }
    const user = this.data.users[userId];
    if (!user) return { success: false, message: 'User not found' };
    if (user.profile.allianceId) {
      return { success: false, message: 'You are already in an alliance. Leave your current alliance first.' };
    }

    const cleanName = String(name || '').trim();
    const cleanTag = String(tag || '').trim().toUpperCase().slice(0, 4);
    if (cleanName.length < 3 || cleanTag.length < 2) {
      return { success: false, message: 'Alliance name (min 3 chars) and tag (2-4 chars) are required' };
    }

    const duplicate = this.data.alliances.find(
      (a) => a.name.toLowerCase() === cleanName.toLowerCase() || a.tag.toUpperCase() === cleanTag
    );
    if (duplicate) {
      return { success: false, message: 'An alliance with that name or tag already exists' };
    }

    const newAlliance: Alliance = {
      id: `alliance_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      tag: cleanTag,
      description: String(description || 'Tactical Defense Coalition').trim(),
      leaderId: userId,
      leaderName: user.profile.username,
      memberIds: [userId],
      memberRoles: { [userId]: 'leader' },
      recruitmentMode,
      maxMembers: 25,
      joinRequests: [],
      invites: [],
      activityLog: [],
      bannerColor,
      createdTime: Date.now(),
      score: user.profile.score,
      territoryBasesCount: this.data.bases.filter((b) => b.ownerId === userId).length,
    };

    this.logAllianceActivity(newAlliance, `${user.profile.username} founded [${cleanTag}] ${cleanName}.`);
    this.data.alliances.push(newAlliance);

    user.profile.allianceId = newAlliance.id;
    user.profile.allianceRole = 'leader';

    for (const b of this.data.bases) {
      if (b.ownerId === userId) {
        b.allianceId = newAlliance.id;
        b.allianceName = newAlliance.name;
        b.allianceTag = newAlliance.tag;
      }
    }
    for (const u of this.data.units) {
      if (u.ownerId === userId) u.allianceId = newAlliance.id;
    }

    this.saveData();
    void persistAllianceTransaction(newAlliance);
    return { success: true, alliance: newAlliance };
  }

  public joinOrRequestAlliance(
    userId: string,
    allianceId: string,
    message = ''
  ): { success: boolean; status?: 'joined' | 'requested'; message?: string; alliance?: Alliance } {
    const user = this.data.users[userId];
    if (!user) return { success: false, message: 'User not found' };
    if (user.profile.allianceId) {
      return { success: false, message: 'Already in an alliance. Leave your current alliance first.' };
    }

    const alliance = this.data.alliances.find((a) => a.id === allianceId);
    if (!alliance) return { success: false, message: 'Alliance not found' };

    const maxMembers = alliance.maxMembers || 25;
    if (alliance.memberIds.length >= maxMembers) {
      return { success: false, message: 'Alliance has reached maximum member capacity' };
    }

    const mode = alliance.recruitmentMode || 'open';
    const hasInvite = (alliance.invites || []).some((inv) => inv.userId === userId);

    if (mode === 'invite_only' && !hasInvite) {
      return { success: false, message: 'This alliance is Invite-Only' };
    }

    if (mode === 'request_only' && !hasInvite) {
      alliance.joinRequests = alliance.joinRequests || [];
      if (alliance.joinRequests.some((r) => r.userId === userId)) {
        return { success: false, message: 'Join request already pending' };
      }
      alliance.joinRequests.push({
        userId,
        username: user.profile.username,
        requestedAt: Date.now(),
        message: message.slice(0, 140),
      });
      this.logAllianceActivity(alliance, `${user.profile.username} requested to join the alliance.`);
      this.saveData();
      void persistAllianceTransaction(alliance);
      return { success: true, status: 'requested', message: 'Join request submitted to alliance officers', alliance };
    }

    // Immediate join (open or invited)
    if (!alliance.memberIds.includes(userId)) {
      alliance.memberIds.push(userId);
    }
    alliance.memberRoles = alliance.memberRoles || {};
    alliance.memberRoles[userId] = 'member';
    alliance.invites = (alliance.invites || []).filter((i) => i.userId !== userId);
    alliance.joinRequests = (alliance.joinRequests || []).filter((r) => r.userId !== userId);

    user.profile.allianceId = alliance.id;
    user.profile.allianceRole = 'member';

    for (const b of this.data.bases) {
      if (b.ownerId === userId) {
        b.allianceId = alliance.id;
        b.allianceName = alliance.name;
        b.allianceTag = alliance.tag;
      }
    }
    for (const u of this.data.units) {
      if (u.ownerId === userId) u.allianceId = alliance.id;
    }

    this.syncAllianceStats(alliance);
    this.logAllianceActivity(alliance, `${user.profile.username} joined the alliance.`);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, status: 'joined', alliance };
  }

  public leaveAlliance(userId: string): { success: boolean; disbanded?: boolean; message?: string } {
    const user = this.data.users[userId];
    if (!user || !user.profile.allianceId) {
      return { success: false, message: 'You are not in an alliance' };
    }

    const allianceId = user.profile.allianceId;
    const alliance = this.data.alliances.find((a) => a.id === allianceId);

    user.profile.allianceId = null;
    user.profile.allianceRole = null;

    for (const b of this.data.bases) {
      if (b.ownerId === userId) {
        b.allianceId = null;
        b.allianceName = null;
        b.allianceTag = null;
      }
    }
    for (const u of this.data.units) {
      if (u.ownerId === userId) u.allianceId = null;
    }

    if (!alliance) {
      this.saveData();
      return { success: true };
    }

    alliance.memberIds = alliance.memberIds.filter((id) => id !== userId);
    if (alliance.memberRoles) {
      delete alliance.memberRoles[userId];
    }

    if (alliance.memberIds.length === 0) {
      // Disband empty alliance
      this.data.alliances = this.data.alliances.filter((a) => a.id !== alliance.id);
      for (const b of this.data.bases) {
        if (b.allianceId === alliance.id) {
          b.allianceId = null;
          b.allianceName = null;
          b.allianceTag = null;
        }
      }
      this.saveData();
      void persistAllianceTransaction(null, alliance.id);
      return { success: true, disbanded: true, message: 'Alliance disbanded as the final member departed' };
    }

    // If leader left, promote highest-ranking remaining member
    if (alliance.leaderId === userId) {
      const sorted = [...alliance.memberIds].sort(
        (a, b) => this.getRoleRank(alliance.memberRoles?.[b]) - this.getRoleRank(alliance.memberRoles?.[a])
      );
      const nextLeaderId = sorted[0];
      const nextLeader = this.data.users[nextLeaderId]?.profile;
      alliance.leaderId = nextLeaderId;
      alliance.leaderName = nextLeader?.username || 'Commander';
      alliance.memberRoles = alliance.memberRoles || {};
      alliance.memberRoles[nextLeaderId] = 'leader';
      if (nextLeader) {
        nextLeader.allianceRole = 'leader';
      }
      this.logAllianceActivity(
        alliance,
        `${user.profile.username} departed. Leadership succeeded by ${alliance.leaderName}.`
      );
    } else {
      this.logAllianceActivity(alliance, `${user.profile.username} left the alliance.`);
    }

    this.syncAllianceStats(alliance);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true };
  }

  public invitePlayerToAlliance(
    actorUserId: string,
    targetUsernameOrId: string
  ): { success: boolean; message?: string; alliance?: Alliance } {
    const actor = this.data.users[actorUserId]?.profile;
    if (!actor || !actor.allianceId) return { success: false, message: 'Not in an alliance' };
    const alliance = this.data.alliances.find((a) => a.id === actor.allianceId);
    if (!alliance) return { success: false, message: 'Alliance not found' };

    const actorRole = alliance.memberRoles?.[actorUserId] || actor.allianceRole || 'member';
    if (this.getRoleRank(actorRole) < 2) {
      return { success: false, message: 'Only Officers, Co-Leaders, and Leaders can invite players' };
    }

    const targetEntry = Object.values(this.data.users).find(
      (u) =>
        u.profile.id === targetUsernameOrId ||
        u.profile.username.toLowerCase() === String(targetUsernameOrId || '').trim().toLowerCase()
    );
    if (!targetEntry) return { success: false, message: 'Target commander not found' };
    if (targetEntry.profile.allianceId) {
      return { success: false, message: 'Target commander is already in an alliance' };
    }

    alliance.invites = alliance.invites || [];
    if (alliance.invites.some((i) => i.userId === targetEntry.profile.id)) {
      return { success: false, message: 'Player has already been invited' };
    }

    alliance.invites.push({
      userId: targetEntry.profile.id,
      username: targetEntry.profile.username,
      invitedBy: actorUserId,
      invitedByUsername: actor.username,
      invitedAt: Date.now(),
    });

    this.data.notifications.unshift({
      id: `notif_inv_${Date.now()}`,
      userId: targetEntry.profile.id,
      type: 'alliance',
      title: `Alliance Invite: [${alliance.tag}]`,
      message: `${actor.username} invited you to join ${alliance.name}.`,
      timestamp: Date.now(),
      read: false,
    });

    this.logAllianceActivity(alliance, `${actor.username} invited ${targetEntry.profile.username}.`);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, alliance };
  }

  public respondToJoinRequest(
    actorUserId: string,
    applicantUserId: string,
    approve: boolean
  ): { success: boolean; message?: string; alliance?: Alliance } {
    const actor = this.data.users[actorUserId]?.profile;
    if (!actor || !actor.allianceId) return { success: false, message: 'Not in an alliance' };
    const alliance = this.data.alliances.find((a) => a.id === actor.allianceId);
    if (!alliance) return { success: false, message: 'Alliance not found' };

    const actorRole = alliance.memberRoles?.[actorUserId] || actor.allianceRole || 'member';
    if (this.getRoleRank(actorRole) < 2) {
      return { success: false, message: 'Insufficient alliance permissions' };
    }

    const reqExists = (alliance.joinRequests || []).find((r) => r.userId === applicantUserId);
    if (!reqExists) return { success: false, message: 'Join request not found' };

    alliance.joinRequests = (alliance.joinRequests || []).filter((r) => r.userId !== applicantUserId);

    if (!approve) {
      this.logAllianceActivity(alliance, `${actor.username} declined join request from ${reqExists.username}.`);
      this.saveData();
      void persistAllianceTransaction(alliance);
      return { success: true, alliance };
    }

    const applicant = this.data.users[applicantUserId]?.profile;
    if (!applicant || applicant.allianceId) {
      return { success: false, message: 'Applicant is already in another alliance' };
    }

    if (alliance.memberIds.length >= (alliance.maxMembers || 25)) {
      return { success: false, message: 'Alliance member capacity reached' };
    }

    alliance.memberIds.push(applicantUserId);
    alliance.memberRoles = alliance.memberRoles || {};
    alliance.memberRoles[applicantUserId] = 'member';
    applicant.allianceId = alliance.id;
    applicant.allianceRole = 'member';

    for (const b of this.data.bases) {
      if (b.ownerId === applicantUserId) {
        b.allianceId = alliance.id;
        b.allianceName = alliance.name;
        b.allianceTag = alliance.tag;
      }
    }
    for (const u of this.data.units) {
      if (u.ownerId === applicantUserId) u.allianceId = alliance.id;
    }

    this.syncAllianceStats(alliance);
    this.logAllianceActivity(alliance, `${actor.username} approved ${applicant.username} into the alliance.`);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, alliance };
  }

  public kickAllianceMember(
    actorUserId: string,
    targetUserId: string
  ): { success: boolean; message?: string; alliance?: Alliance } {
    if (actorUserId === targetUserId) {
      return { success: false, message: 'Use leave alliance instead of kicking yourself' };
    }
    const actor = this.data.users[actorUserId]?.profile;
    if (!actor || !actor.allianceId) return { success: false, message: 'Not in an alliance' };
    const alliance = this.data.alliances.find((a) => a.id === actor.allianceId);
    if (!alliance || !alliance.memberIds.includes(targetUserId)) {
      return { success: false, message: 'Member not found in your alliance' };
    }

    const actorRole = alliance.memberRoles?.[actorUserId] || actor.allianceRole || 'member';
    const targetRole = alliance.memberRoles?.[targetUserId] || 'member';

    if (this.getRoleRank(actorRole) < 2 || this.getRoleRank(actorRole) <= this.getRoleRank(targetRole)) {
      return { success: false, message: 'You cannot kick a member of equal or higher rank' };
    }

    alliance.memberIds = alliance.memberIds.filter((id) => id !== targetUserId);
    if (alliance.memberRoles) delete alliance.memberRoles[targetUserId];

    const targetProfile = this.data.users[targetUserId]?.profile;
    if (targetProfile) {
      targetProfile.allianceId = null;
      targetProfile.allianceRole = null;
    }
    for (const b of this.data.bases) {
      if (b.ownerId === targetUserId) {
        b.allianceId = null;
        b.allianceName = null;
        b.allianceTag = null;
      }
    }
    for (const u of this.data.units) {
      if (u.ownerId === targetUserId) u.allianceId = null;
    }

    this.syncAllianceStats(alliance);
    this.logAllianceActivity(alliance, `${actor.username} removed ${targetProfile?.username || targetUserId} from the alliance.`);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, alliance };
  }

  public setAllianceMemberRole(
    actorUserId: string,
    targetUserId: string,
    newRole: AllianceRole
  ): { success: boolean; message?: string; alliance?: Alliance } {
    if (newRole === 'leader') {
      return this.transferAllianceLeadership(actorUserId, targetUserId);
    }
    const actor = this.data.users[actorUserId]?.profile;
    if (!actor || !actor.allianceId) return { success: false, message: 'Not in an alliance' };
    const alliance = this.data.alliances.find((a) => a.id === actor.allianceId);
    if (!alliance || !alliance.memberIds.includes(targetUserId)) {
      return { success: false, message: 'Member not found in alliance' };
    }

    const actorRole = alliance.memberRoles?.[actorUserId] || actor.allianceRole || 'member';
    const targetRole = alliance.memberRoles?.[targetUserId] || 'member';

    if (this.getRoleRank(actorRole) < 3 || this.getRoleRank(actorRole) <= this.getRoleRank(targetRole)) {
      return { success: false, message: 'Only Leaders and Co-Leaders can change lower-ranking member roles' };
    }
    if (actorRole === 'co_leader' && newRole === 'co_leader') {
      return { success: false, message: 'Only the Alliance Leader can appoint Co-Leaders' };
    }

    alliance.memberRoles = alliance.memberRoles || {};
    alliance.memberRoles[targetUserId] = newRole;
    const targetProfile = this.data.users[targetUserId]?.profile;
    if (targetProfile) {
      targetProfile.allianceRole = newRole;
    }

    this.logAllianceActivity(
      alliance,
      `${actor.username} set ${targetProfile?.username || targetUserId}'s role to ${newRole.replace('_', '-')}.`
    );
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, alliance };
  }

  public transferAllianceLeadership(
    actorUserId: string,
    newLeaderUserId: string
  ): { success: boolean; message?: string; alliance?: Alliance } {
    const actor = this.data.users[actorUserId]?.profile;
    if (!actor || !actor.allianceId) return { success: false, message: 'Not in an alliance' };
    const alliance = this.data.alliances.find((a) => a.id === actor.allianceId);
    if (!alliance) return { success: false, message: 'Alliance not found' };
    if (alliance.leaderId !== actorUserId) {
      return { success: false, message: 'Only the current Alliance Leader can transfer leadership' };
    }
    if (!alliance.memberIds.includes(newLeaderUserId) || newLeaderUserId === actorUserId) {
      return { success: false, message: 'Invalid successor member' };
    }

    const newLeader = this.data.users[newLeaderUserId]?.profile;
    if (!newLeader) return { success: false, message: 'Target member not found' };

    alliance.leaderId = newLeaderUserId;
    alliance.leaderName = newLeader.username;
    alliance.memberRoles = alliance.memberRoles || {};
    alliance.memberRoles[actorUserId] = 'co_leader';
    alliance.memberRoles[newLeaderUserId] = 'leader';

    actor.allianceRole = 'co_leader';
    newLeader.allianceRole = 'leader';

    this.logAllianceActivity(alliance, `${actor.username} transferred alliance leadership to ${newLeader.username}.`);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, alliance };
  }

  public updateAllianceSettings(
    actorUserId: string,
    updates: { description?: string; recruitmentMode?: AllianceRecruitmentMode; bannerColor?: string }
  ): { success: boolean; message?: string; alliance?: Alliance } {
    const actor = this.data.users[actorUserId]?.profile;
    if (!actor || !actor.allianceId) return { success: false, message: 'Not in an alliance' };
    const alliance = this.data.alliances.find((a) => a.id === actor.allianceId);
    if (!alliance) return { success: false, message: 'Alliance not found' };

    const actorRole = alliance.memberRoles?.[actorUserId] || actor.allianceRole || 'member';
    if (this.getRoleRank(actorRole) < 3) {
      return { success: false, message: 'Only Leaders and Co-Leaders can update alliance settings' };
    }

    if (updates.description !== undefined) {
      alliance.description = String(updates.description).trim().slice(0, 240);
    }
    if (updates.recruitmentMode && ['open', 'request_only', 'invite_only'].includes(updates.recruitmentMode)) {
      alliance.recruitmentMode = updates.recruitmentMode;
    }
    if (updates.bannerColor) {
      alliance.bannerColor = String(updates.bannerColor).slice(0, 20);
    }

    this.logAllianceActivity(alliance, `${actor.username} updated alliance settings.`);
    this.saveData();
    void persistAllianceTransaction(alliance);
    return { success: true, alliance };
  }

  // ==========================================================================
  // PLAYER PROGRESSION, MISSIONS, ACHIEVEMENTS & LEADERBOARD (PHASE 7)
  // ==========================================================================

  public recordBattleReport(report: Omit<BattleReport, 'id' | 'timestamp'>): BattleReport {
    const full: BattleReport = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      ...report,
    };
    if (!this.data.battleReports) this.data.battleReports = [];
    this.data.battleReports.unshift(full);
    if (this.data.battleReports.length > 100) {
      this.data.battleReports = this.data.battleReports.slice(0, 100);
    }
    return full;
  }

  public getLeaderboard() {
    const players = Object.values(this.data.users)
      .map((u) => {
        const p = this.sanitizeProfile(u.profile);
        const basesCount = this.data.bases.filter((b) => b.ownerId === p.id).length;
        const unitsCount = this.data.units.filter((unit) => unit.ownerId === p.id).length;
        const alliance = this.data.alliances.find((a) => a.id === p.allianceId);
        return {
          id: p.id,
          username: p.username,
          rank: p.rank,
          level: p.level,
          score: p.score,
          allianceTag: alliance?.tag || null,
          allianceName: alliance?.name || null,
          basesControlled: basesCount,
          activeUnits: unitsCount,
          totalBasesCaptured: p.totalBasesCaptured,
          totalUnitsDestroyed: p.totalUnitsDestroyed,
          totalUnitsProduced: p.totalUnitsProduced,
        };
      })
      .sort((a, b) => b.score - a.score);

    const alliances = this.data.alliances
      .map((a) => {
        this.syncAllianceStats(a);
        return {
          id: a.id,
          name: a.name,
          tag: a.tag,
          leaderName: a.leaderName,
          membersCount: a.memberIds.length,
          score: a.score,
          territoryBasesCount: a.territoryBasesCount,
          bannerColor: a.bannerColor,
        };
      })
      .sort((a, b) => b.score - a.score);

    return { players, alliances };
  }

  public getPlayerProgressionStatus(userId: string): {
    achievements: AchievementProgress[];
    missions: MissionProgress[];
    battleReports: BattleReport[];
  } {
    const user = this.data.users[userId]?.profile;
    const claimed = new Set(user?.claimedRewardIds || []);

    const unitsProduced = user?.totalUnitsProduced || 0;
    const unitsDestroyed = user?.totalUnitsDestroyed || 0;
    const basesCaptured = user?.totalBasesCaptured || 0;
    const resourcesHarvested = user?.totalResourcesHarvested || 0;
    const transfers = user?.highwayTransfersCompleted || 0;
    const inAlliance = Boolean(user?.allianceId);

    const achievements: AchievementProgress[] = [
      {
        id: 'ach_first_blood',
        title: 'First Strike',
        description: 'Destroy at least 5 hostile combat units across any sector.',
        category: 'combat',
        currentValue: unitsDestroyed,
        targetValue: 5,
        completed: unitsDestroyed >= 5,
        claimed: claimed.has('ach_first_blood'),
        rewardScore: 250,
        rewardResources: { concrete: 400, steel: 400, aluminum: 200, fuel: 250 },
      },
      {
        id: 'ach_base_conqueror',
        title: 'Frontline Conqueror',
        description: 'Capture 2 neutral or enemy bases using Conquest units.',
        category: 'conquest',
        currentValue: basesCaptured,
        targetValue: 2,
        completed: basesCaptured >= 2,
        claimed: claimed.has('ach_base_conqueror'),
        rewardScore: 400,
        rewardResources: { concrete: 600, steel: 600, aluminum: 350, fuel: 400 },
      },
      {
        id: 'ach_war_machine',
        title: 'Industrial War Machine',
        description: 'Produce 10 combat units at your sector factories.',
        category: 'economy',
        currentValue: unitsProduced,
        targetValue: 10,
        completed: unitsProduced >= 10,
        claimed: claimed.has('ach_war_machine'),
        rewardScore: 300,
        rewardResources: { concrete: 500, steel: 500, aluminum: 300, fuel: 300 },
      },
      {
        id: 'ach_highway_vanguard',
        title: 'Inter-Sector Logistics',
        description: 'Transfer units across a Sector Highway Checkpoint to another map.',
        category: 'logistics',
        currentValue: transfers,
        targetValue: 1,
        completed: transfers >= 1,
        claimed: claimed.has('ach_highway_vanguard'),
        rewardScore: 350,
        rewardResources: { concrete: 400, steel: 400, aluminum: 300, fuel: 500 },
      },
      {
        id: 'ach_coalition_command',
        title: 'Coalition Command',
        description: 'Join or establish a Tactical Alliance.',
        category: 'alliance',
        currentValue: inAlliance ? 1 : 0,
        targetValue: 1,
        completed: inAlliance,
        claimed: claimed.has('ach_coalition_command'),
        rewardScore: 200,
        rewardResources: { concrete: 300, steel: 300, aluminum: 200, fuel: 200 },
      },
    ];

    const missions: MissionProgress[] = [
      {
        id: 'mis_daily_mobilize',
        cadence: 'daily',
        title: 'Daily Mobilization',
        description: 'Maintain active unit production (3+ units produced).',
        currentValue: unitsProduced,
        targetValue: 3,
        completed: unitsProduced >= 3,
        claimed: claimed.has('mis_daily_mobilize'),
        rewardScore: 150,
        rewardResources: { concrete: 300, steel: 300, aluminum: 150, fuel: 200 },
      },
      {
        id: 'mis_daily_harvest',
        cadence: 'daily',
        title: 'Supply Line Quota',
        description: 'Harvest 5,000 total industrial resources across your bases.',
        currentValue: resourcesHarvested,
        targetValue: 5000,
        completed: resourcesHarvested >= 5000,
        claimed: claimed.has('mis_daily_harvest'),
        rewardScore: 180,
        rewardResources: { concrete: 350, steel: 350, aluminum: 200, fuel: 250 },
      },
      {
        id: 'mis_weekly_dominion',
        cadence: 'weekly',
        title: 'Weekly Theater Dominion',
        description: 'Destroy 12 enemy units and capture at least 1 base.',
        currentValue: Math.min(12, unitsDestroyed) + (basesCaptured >= 1 ? 1 : 0),
        targetValue: 13,
        completed: unitsDestroyed >= 12 && basesCaptured >= 1,
        claimed: claimed.has('mis_weekly_dominion'),
        rewardScore: 600,
        rewardResources: { concrete: 900, steel: 900, aluminum: 500, fuel: 600 },
      },
    ];

    const reports = (this.data.battleReports || []).filter(
      (r) => r.attackerId === userId || r.defenderId === userId || userId === 'player_default'
    );

    return { achievements, missions, battleReports: reports.slice(0, 30) };
  }

  public claimReward(
    userId: string,
    rewardId: string
  ): { success: boolean; message?: string; profile?: PlayerProfile; base?: Base } {
    const lockRes = this.withLock(`claim_${userId}`, () => {
      const user = this.data.users[userId]?.profile;
      if (!user) return { success: false, message: 'User not found' };

      user.claimedRewardIds = user.claimedRewardIds || [];
      if (user.claimedRewardIds.includes(rewardId)) {
        return { success: false, message: 'Reward has already been claimed' };
      }

      const status = this.getPlayerProgressionStatus(userId);
      const rewardItem =
        status.achievements.find((a) => a.id === rewardId) ||
        status.missions.find((m) => m.id === rewardId);

      if (!rewardItem) {
        return { success: false, message: 'Invalid reward identifier' };
      }
      if (!rewardItem.completed) {
        return { success: false, message: 'Objective requirements not yet met' };
      }

      user.claimedRewardIds.push(rewardId);
      user.score += rewardItem.rewardScore;
      this.recalculatePlayerProgression(user);

      // Deliver resources to player's home base (or first owned base)
      const targetBase =
        this.data.bases.find((b) => b.id === user.homeBaseId && b.ownerId === userId) ||
        this.data.bases.find((b) => b.ownerId === userId);

      if (targetBase) {
        targetBase.resources.concrete = Math.min(
          targetBase.storageCap.concrete,
          targetBase.resources.concrete + rewardItem.rewardResources.concrete
        );
        targetBase.resources.steel = Math.min(
          targetBase.storageCap.steel,
          targetBase.resources.steel + rewardItem.rewardResources.steel
        );
        targetBase.resources.aluminum = Math.min(
          targetBase.storageCap.aluminum,
          targetBase.resources.aluminum + rewardItem.rewardResources.aluminum
        );
        targetBase.resources.fuel = Math.min(
          targetBase.storageCap.fuel,
          targetBase.resources.fuel + rewardItem.rewardResources.fuel
        );
        this.persistBaseAndUnits(targetBase, []);
      }

      this.persistUser(userId);
      this.saveData();
      return { success: true, profile: this.sanitizeProfile(user), base: targetBase };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Concurrent reward claim in progress' };
    }
    return lockRes.result!;
  }

  public recoverAccountPassword(
    username: string,
    email: string,
    newPassword: string
  ): { success: boolean; message: string } {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanUser || !cleanEmail || !newPassword || newPassword.length < 4) {
      return { success: false, message: 'Username, registered email, and new password (min 4 chars) are required' };
    }

    const found = Object.values(this.data.users).find(
      (u) => u.profile.username.toLowerCase() === cleanUser && u.profile.email.toLowerCase() === cleanEmail
    );
    if (!found) {
      return { success: false, message: 'No matching account found for that callsign and email combination' };
    }

    found.passwordHash = bcrypt.hashSync(newPassword, 8);
    this.persistUser(found.profile.id);
    this.saveData();
    return { success: true, message: 'Credentials updated. You may now sign in with your new password.' };
  }

  public submitSupportTicket(
    userId: string,
    category: SupportTicket['category'],
    subject: string,
    message: string
  ): { success: boolean; ticket?: SupportTicket; message?: string } {
    const user = this.data.users[userId]?.profile;
    if (!user) return { success: false, message: 'User not found' };
    if (!subject?.trim() || !message?.trim()) {
      return { success: false, message: 'Subject and message are required' };
    }
    const ticket: SupportTicket = {
      id: `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      username: user.username,
      category: category || 'general',
      subject: subject.trim().slice(0, 120),
      message: message.trim().slice(0, 600),
      status: 'open',
      createdAt: Date.now(),
    };
    if (!this.data.supportTickets) this.data.supportTickets = [];
    this.data.supportTickets.unshift(ticket);
    this.saveData();
    return { success: true, ticket };
  }

  // ==========================================================================
  // AUDIT LOGGING & SESSION MANAGEMENT
  // ==========================================================================

  public addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      ...entry,
    };
    this.data.auditLogs.unshift(fullEntry);
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 1000);
    }
    this.saveData();
    return fullEntry;
  }

  public authenticateConsoleStaff(
    rawUsername: string,
    password: string,
    ipAddress: string
  ): { session: AdminSessionRecord; profile: PlayerProfile } | null {
    const cleanUsername = String(rawUsername || '').trim().toLowerCase();
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || 'Commander';
    const staffDirectory: Array<{
      id: string;
      username: string;
      email: string;
      rank: string;
      role: AdminRole;
      pass: string;
    }> = [
      {
        id: 'console_staff:commander',
        username: bootstrapUsername,
        email: 'commander@frontline.mil',
        rank: 'Supreme Commander',
        role: 'super_admin',
        pass: this.resolveBootstrapSecret('ADMIN_BOOTSTRAP_PASSWORD', 'admin123'),
      },
      {
        id: 'console_staff:superadmin_prime',
        username: 'SuperAdmin_Prime',
        email: 'superprime@frontline.mil',
        rank: 'Supreme Theater Marshal',
        role: 'super_admin',
        pass: 'adminpassword123',
      },
      {
        id: 'console_staff:valkyrie_ops',
        username: 'Valkyrie_Ops',
        email: 'valkyrie@frontline.mil',
        rank: 'Theater Operations Director',
        role: 'game_admin',
        pass: this.resolveBootstrapSecret('GAME_ADMIN_BOOTSTRAP_PASSWORD', 'gameadmin123'),
      },
      {
        id: 'console_staff:sentinel_mod',
        username: 'Sentinel_Mod',
        email: 'sentinel@frontline.mil',
        rank: 'Provost Marshal',
        role: 'moderator',
        pass: this.resolveBootstrapSecret('MODERATOR_BOOTSTRAP_PASSWORD', 'moderator123'),
      },
      {
        id: 'console_staff:telemetry_analyst',
        username: 'Telemetry_Analyst',
        email: 'analyst@frontline.mil',
        rank: 'Intelligence Analyst',
        role: 'analyst',
        pass: this.resolveBootstrapSecret('ANALYST_BOOTSTRAP_PASSWORD', 'analyst123'),
      },
    ];

    const matched = staffDirectory.find((s) => s.username.toLowerCase() === cleanUsername);
    if (!matched || matched.pass !== password) {
      return null;
    }

    const now = Date.now();
    const ttl = this.data.systemSettings?.sessionTtlMs || 28800000;
    const token = `adm_${now}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 12)}`;

    const session: AdminSessionRecord = {
      token,
      userId: matched.id,
      username: matched.username,
      role: matched.role,
      createdAt: now,
      expiresAt: now + ttl,
      lastActiveAt: now,
      ipAddress,
    };

    this.data.adminSessions[token] = session;
    this.saveData();

    return {
      session,
      profile: this.getConsoleStaffProfile(session),
    };
  }

  public getConsoleStaffProfile(session: AdminSessionRecord): PlayerProfile {
    const now = Date.now();
    return {
      id: session.userId,
      username: session.username,
      email: `${session.username.toLowerCase()}@frontline.mil`,
      rank: 'High Command Console Operator',
      score: 0,
      level: 1,
      avatar: 'shield',
      homeBaseId: '',
      currentMapId: 'map_riverfront_assault',
      totalBasesCaptured: 0,
      totalUnitsProduced: 0,
      totalUnitsDestroyed: 0,
      totalResourcesHarvested: 0,
      joinedAt: session.createdAt || now,
      lastLoginAt: session.lastActiveAt || now,
      beginnerProtectionUntil: 0,
      isAdmin: true,
      adminRole: session.role,
      status: 'active',
      playerType: 'system',
      accountId: null,
      botAgentId: null,
      controlSource: 'system',
      verificationStatus: 'system_registered',
    };
  }

  public createAdminSession(userId: string, ipAddress: string): AdminSessionRecord | null {
    const user = this.data.users[userId];
    if (!user) return null;
    const role = user.profile.adminRole || (user.profile.isAdmin ? 'super_admin' : null);
    if (!role) return null;

    const now = Date.now();
    const ttl = this.data.systemSettings?.sessionTtlMs || 28800000;
    const token = `adm_${now}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 12)}`;

    const session: AdminSessionRecord = {
      token,
      userId,
      username: user.profile.username,
      role,
      createdAt: now,
      expiresAt: now + ttl,
      lastActiveAt: now,
      ipAddress,
    };

    this.data.adminSessions[token] = session;
    this.data.tokens[token] = userId;
    this.saveData();
    return session;
  }

  public getValidAdminSession(token: string): AdminSessionRecord | null {
    if (!token) return null;

    const session = this.data.adminSessions[token];
    if (session) {
      if (session.expiresAt <= Date.now()) {
        delete this.data.adminSessions[token];
        this.saveData();
        return null;
      }
      if (session.userId.startsWith('console_staff:')) {
        session.lastActiveAt = Date.now();
        return session;
      }
      const access = this.checkPlayerAccess(session.userId);
      const user = this.data.users[session.userId];
      const currentRole = user?.profile?.adminRole || (user?.profile?.isAdmin ? 'super_admin' : null);
      if (!access.allowed || !currentRole) {
        delete this.data.adminSessions[token];
        this.saveData();
        return null;
      }
      session.role = currentRole;
      session.lastActiveAt = Date.now();
      return session;
    }

    const userId = this.data.tokens[token];
    if (userId) {
      const access = this.checkPlayerAccess(userId);
      const user = this.data.users[userId];
      const role = user?.profile?.adminRole || (user?.profile?.isAdmin ? 'super_admin' : null);
      if (access.allowed && user && role) {
        const now = Date.now();
        const ttl = this.data.systemSettings?.sessionTtlMs || 28800000;
        const promoted: AdminSessionRecord = {
          token,
          userId,
          username: user.profile.username,
          role,
          createdAt: now,
          expiresAt: now + ttl,
          lastActiveAt: now,
          ipAddress: '127.0.0.1',
        };
        this.data.adminSessions[token] = promoted;
        return promoted;
      }
    }

    return null;
  }

  public revokeToken(token: string) {
    let changed = false;
    if (this.data.tokens[token]) {
      delete this.data.tokens[token];
      changed = true;
    }
    if (this.data.adminSessions[token]) {
      delete this.data.adminSessions[token];
      changed = true;
    }
    if (changed) {
      this.saveData();
    }
  }

  public revokeUserSessions(userId: string) {
    for (const [tok, uid] of Object.entries(this.data.tokens)) {
      if (uid === userId) {
        delete this.data.tokens[tok];
      }
    }
    for (const [tok, sess] of Object.entries(this.data.adminSessions)) {
      if (sess.userId === userId) {
        delete this.data.adminSessions[tok];
      }
    }
    this.saveData();
  }

  public listActiveAdminSessions(): AdminSessionInfo[] {
    const now = Date.now();
    const list: AdminSessionInfo[] = [];
    for (const [tok, sess] of Object.entries(this.data.adminSessions)) {
      if (sess.expiresAt > now) {
        list.push({
          tokenPrefix: `${tok.slice(0, 12)}...`,
          userId: sess.userId,
          username: sess.username,
          role: sess.role,
          createdAt: sess.createdAt,
          expiresAt: sess.expiresAt,
          lastActiveAt: sess.lastActiveAt,
          ipAddress: sess.ipAddress,
        });
      }
    }
    return list;
  }

  public resetAllData(): void {
    this.data.users = {};
    this.data.tokens = {};
    this.data.adminSessions = {};
    this.data.accountsPurged = false;
    const world = generateWorld(this.data.worldConfig || { width: 100, height: 75, tileSize: 40, seed: 202610 });
    this.data.bases = [...world.bases];
    this.data.units = [];
    this.data.envObjects = world.envObjects;
    this.data.alliances = [];
    this.data.chat = [];
    this.data.notifications = [];
    this.data.battleReports = [];
    this.data.supportTickets = [];
    this.data.auditLogs = [];
    this.data.matches = [];
    this.ensureAdminBootstrapUsers(this.data);
    this.saveData();
  }
}

export const gameStore = new GameStore();
