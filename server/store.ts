import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  AdminRole,
  AdminSessionInfo,
  Alliance,
  Announcement,
  AuditLogEntry,
  Base,
  BuildingDefinition,
  BuildingType,
  CatalogConfigState,
  ChatMessage,
  ConfigVersionEntry,
  EconomyConfig,
  EnvironmentObject,
  GameNotification,
  MapSectorConfig,
  MatchRecord,
  PlayerProfile,
  SystemSettings,
  Unit,
  UnitDefinition,
  UnitType,
} from '../src/types/game';
import { BASE_RESOURCE_CAP, BUILDING_CATALOG, STARTER_RESOURCES, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { isCellPassable } from '../src/game/pathfinder';

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
  alliances: Alliance[];
  chat: ChatMessage[];
  notifications: GameNotification[];
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
    maxGlobalUnits: 250,
    captureSpeedPerTick: 5,
    updatedAt: Date.now(),
    updatedBy: 'System Bootstrap',
  };
}

export function createDefaultSystemSettings(): SystemSettings {
  const ttlEnv = parseInt(process.env.ADMIN_SESSION_TTL_MS || '28800000', 10);
  return {
    gameTitle: 'Frontline Dominion: Riverfront Assault',
    gameVersion: 'v2.4.0-3D',
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
      enabled: true,
      isActiveMap: false,
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
      enabled: true,
      isActiveMap: false,
      atmospherePreset: 'overcast',
      objectiveTitle: 'OPERATION TRIDENT DELTA',
      objectiveDescription: 'Establish Naval Superiority & Capture Harbor Drydocks',
      updatedAt: now,
      updatedBy: 'System Bootstrap',
    },
  ];
}

export class GameStore {
  private data: PersistentData;
  private startTime: number = Date.now();

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.data = this.loadOrInit();
  }

  public getUptimeMs(): number {
    return Date.now() - this.startTime;
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

    // Ensure player_default is super_admin
    if (data.users['player_default']) {
      const p = data.users['player_default'].profile;
      p.isAdmin = true;
      p.adminRole = p.adminRole || 'super_admin';
      p.status = p.status || 'active';
      p.moderationHistory = p.moderationHistory || [];
    }

    // Ensure staff accounts for each RBAC role exist for multi-role administration & testing
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
            totalBasesCaptured: acc.id === 'player_default' ? 4 : 2,
            totalUnitsProduced: acc.id === 'player_default' ? 28 : 14,
            totalUnitsDestroyed: acc.id === 'player_default' ? 19 : 8,
            totalResourcesHarvested: acc.score * 45,
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
        if (acc.role && !prof.adminRole) {
          prof.adminRole = acc.role;
          prof.isAdmin = true;
        }
      }
    }
  }

  private migrateData(parsed: any): PersistentData {
    const now = Date.now();
    if (!parsed.economyConfig) {
      parsed.economyConfig = createDefaultEconomyConfig();
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
    if (!parsed.maps || parsed.maps.length === 0) {
      parsed.maps = createDefaultMaps();
    }
    if (!parsed.announcements) {
      parsed.announcements = [
        {
          id: 'ann_riverfront_live',
          title: 'OPERATION RIVERFRONT ASSAULT LIVE',
          message:
            'High Command has authorized full 3D combined-arms deployment across Sector 01. Capture neutral outposts to expand population capacity.',
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
          id: 'match_hist_001',
          mapId: 'map_iron_ridge_corridor',
          mapName: 'Sector 02: Iron Ridge Rail Corridor',
          seed: 441892,
          status: 'completed',
          startedAt: now - 86400000 * 2,
          endedAt: now - 86400000 * 2 + 3420000,
          aiDifficulty: 'hard',
          participantIds: ['player_default', 'player_striker', 'enemy_insurgent'],
          winnerName: 'Commander [VGD]',
          totalUnitsSpawned: 64,
          totalBasesCaptured: 7,
          terminationReason: 'Total Sector Domination',
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
    // Remove legacy static backdoor token if present
    if (parsed.tokens['default_commander_token']) {
      delete parsed.tokens['default_commander_token'];
    }

    this.ensureAdminBootstrapUsers(parsed);
    return parsed as PersistentData;
  }

  private loadOrInit(): PersistentData {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Upgrade schema if old map dimensions or missing 3D environment objects or new riverfront layout
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

    // Create default commander account so user can jump right in or register new ones
    const defaultUserId = 'player_default';
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || 'Commander';
    const bootstrapPassword = this.resolveBootstrapSecret('ADMIN_BOOTSTRAP_PASSWORD', 'admin123');
    const homeBase = bases[0];
    homeBase.ownerId = defaultUserId;
    homeBase.ownerName = bootstrapUsername;
    homeBase.name = 'Fortress Alpha (HQ)';
    homeBase.allianceId = 'alliance_vanguard';

    // Also give player a second forward base nearby
    const forwardBase = bases[3]; // Tank Factory
    if (forwardBase) {
      forwardBase.ownerId = defaultUserId;
      forwardBase.ownerName = bootstrapUsername;
      forwardBase.allianceId = 'alliance_vanguard';
    }

    // Create an AI Rival Commander on the East side of the map so there are hostile units to fight
    const enemyBase = bases[1];
    if (enemyBase) {
      enemyBase.ownerId = 'enemy_insurgent';
      enemyBase.ownerName = 'Kodiak PMC';
      enemyBase.name = 'Kodiak Stronghold';
    }
    const enemyOutpost = bases[4];
    if (enemyOutpost) {
      enemyOutpost.ownerId = 'enemy_insurgent';
      enemyOutpost.ownerName = 'Kodiak PMC';
    }

    const defaultAlliance: Alliance = {
      id: 'alliance_vanguard',
      name: 'Vanguard Coalition',
      tag: 'VGD',
      description: 'Unified Defense Force securing frontline sectors and industrial supply lines.',
      leaderId: defaultUserId,
      leaderName: bootstrapUsername,
      memberIds: [defaultUserId],
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
      totalBasesCaptured: 2,
      totalUnitsProduced: 8,
      totalUnitsDestroyed: 14,
      totalResourcesHarvested: 24500,
      joinedAt: Date.now() - 86400000 * 3,
      lastLoginAt: Date.now(),
      beginnerProtectionUntil: Date.now() + 3600000,
      isAdmin: true,
      adminRole: 'super_admin',
      status: 'active',
      suspendedUntil: null,
      banReason: null,
      moderationHistory: [],
    };

    // Helper to guarantee initial units never spawn on water or mountains
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

    // Initial Units for Player and Enemy
    const starterUnits: Unit[] = [
      {
        id: 'unit_starter_1',
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
      // Enemy Insurgent Patrols
      {
        id: 'unit_enemy_1',
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
        senderId: 'system',
        senderName: 'HQ TACTICAL NET',
        channel: 'system',
        content: 'Welcome to FRONTLINE DOMINION. Tactical satellites online. Secure neutral bases to expand production.',
        timestamp: Date.now() - 60000,
      },
      {
        id: 'msg_2',
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
      envObjects,
      alliances: [defaultAlliance],
      chat: initialChat,
      notifications: [
        {
          id: 'notif_1',
          userId: defaultUserId,
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
  // PLAYER STATUS & SANITIZATION HELPERS
  // ==========================================================================

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
        // Suspension expired automatically
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
    return {
      ...profile,
      status: profile.status || 'active',
      adminRole: profile.adminRole || null,
      isAdmin: Boolean(profile.adminRole || profile.isAdmin),
      moderationHistory: profile.moderationHistory || [],
    };
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
    // Retention bound: keep most recent 1000 audit logs
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

    // Check explicit adminSessions first
    const session = this.data.adminSessions[token];
    if (session) {
      if (session.expiresAt <= Date.now()) {
        delete this.data.adminSessions[token];
        this.saveData();
        return null;
      }
      // Verify user still has admin role and is active
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

    // Also allow player token if user is an active admin (for seamless in-game to /admin transition)
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
