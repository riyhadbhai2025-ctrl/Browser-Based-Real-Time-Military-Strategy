import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  AchievementProgress,
  AdminRole,
  AdminSessionInfo,
  Alliance,
  AllianceRecruitmentMode,
  AllianceRole,
  Announcement,
  AuditLogEntry,
  Base,
  BattleReport,
  BuildingDefinition,
  BuildingType,
  CatalogConfigState,
  ChatMessage,
  ConfigVersionEntry,
  EconomyConfig,
  EnvironmentObject,
  GameNotification,
  HighwayExit,
  MapSectorConfig,
  MatchRecord,
  MissionProgress,
  PlayerProfile,
  SupportTicket,
  SystemSettings,
  Unit,
  UnitDefinition,
  UnitType,
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
    fogOfWarEnforced: true,
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
      maxPlayers: 8,
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
      maxPlayers: 6,
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
      maxPlayers: 8,
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
  private lastPostgresSyncAt = 0;

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

  private async initPostgresLayer(): Promise<void> {
    if (!isPostgresConfigured()) return;
    try {
      const existing = await loadStateFromPostgres();
      if (existing && Object.keys(existing.users).length > 0 && existing.bases.length > 0) {
        // Merge PostgreSQL durable state with any local schema upgrades
        this.data.users = { ...this.data.users, ...existing.users };
        this.data.tokens = { ...this.data.tokens, ...existing.tokens };
        this.data.adminSessions = { ...this.data.adminSessions, ...existing.adminSessions };
        if (existing.bases.length > 0) this.data.bases = existing.bases;
        if (existing.units.length > 0) this.data.units = existing.units;
        if (existing.alliances.length > 0) this.data.alliances = existing.alliances;
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

        this.data = this.migrateData(this.data);
      }
      await this.syncToDatabaseNow();
      this.postgresInitialized = true;
    } catch (err) {
      console.error('Database Error in initPostgresLayer:', err);
    }
  }

  public async syncToDatabaseNow(): Promise<boolean> {
    if (!isPostgresConfigured()) return false;
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
      },
    });
    if (ok) {
      this.lastPostgresSyncAt = Date.now();
      this.postgresInitialized = true;
    }
    return ok;
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

    // Generate bases, units, and envObjects for Sector 02 and Sector 03 if not yet populated
    for (const mapCfg of parsed.maps) {
      const mapBases = parsed.bases.filter((b) => b.mapId === mapCfg.id);
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
          };
          if (idx === 0) {
            clone.ownerId = 'player_default';
            clone.ownerName = parsed.users['player_default']?.profile.username || 'Commander';
            clone.allianceId = 'alliance_vanguard';
            clone.name = `${sectorLabel} Forward HQ`;
          } else if (idx === 1 || idx === 4) {
            clone.ownerId = 'enemy_insurgent';
            clone.ownerName = 'Kodiak PMC';
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
      } else if (!parsed.envObjectsByMap[mapCfg.id] || parsed.envObjectsByMap[mapCfg.id].length === 0) {
        const generated = generateWorld({
          width: mapCfg.width,
          height: mapCfg.height,
          tileSize: mapCfg.tileSize,
          seed: mapCfg.seed,
        });
        parsed.envObjectsByMap[mapCfg.id] = generated.envObjects.map((eo) => ({
          ...eo,
          mapId: mapCfg.id,
        }));
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
    return parsed as PersistentData;
  }

  private loadOrInit(): PersistentData {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.worldConfig && parsed.worldConfig.seed === 202610 && parsed.envObjects) {
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

  public saveData(dataToSave: PersistentData = this.data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save gamestate.json:', e);
    }
    // Non-blocking sync to Cloud SQL PostgreSQL
    void this.syncToDatabaseNow();
  }

  public persistBaseAndUnits(base: Base, unitsToSave: Unit[] = []) {
    void persistBaseAndUnitsTransaction(base, unitsToSave);
  }

  public persistUser(uid: string) {
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

  public sanitizeProfile(profile: PlayerProfile): PlayerProfile {
    this.recalculatePlayerProgression(profile);
    return {
      ...profile,
      currentMapId: profile.currentMapId || 'map_riverfront_assault',
      claimedRewardIds: profile.claimedRewardIds || [],
      highwayTransfersCompleted: profile.highwayTransfersCompleted || 0,
      status: profile.status || 'active',
      adminRole: profile.adminRole || null,
      isAdmin: Boolean(profile.adminRole || profile.isAdmin),
      moderationHistory: profile.moderationHistory || [],
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
      if (b.ownerId === userId) b.allianceId = newAlliance.id;
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
      if (b.ownerId === userId) b.allianceId = alliance.id;
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
      if (b.ownerId === userId) b.allianceId = null;
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
      if (b.ownerId === applicantUserId) b.allianceId = alliance.id;
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
      if (b.ownerId === targetUserId) b.allianceId = null;
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
}

export const gameStore = new GameStore();
