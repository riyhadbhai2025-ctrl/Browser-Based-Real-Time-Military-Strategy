export type ResourceType = 'concrete' | 'steel' | 'aluminum' | 'fuel';

export interface Resources {
  concrete: number;
  steel: number;
  aluminum: number;
  fuel: number;
}

export type BaseType = 'home' | 'tank' | 'air' | 'harbor' | 'rail';

export type UnitCategory = 'ground' | 'air' | 'naval' | 'rail';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export type AtmospherePreset = 'daylight' | 'golden_hour' | 'overcast';

export type UnitType =
  // Ground
  | 'rifle_infantry'
  | 'vanguard_scout'
  | 'ironclad_apc'
  | 'titan_mbt'
  | 'goliath_howitzer'
  | 'skyguard_aa'
  | 'dominator_conquest'
  // Air
  | 'hawk_scout_heli'
  | 'cobra_gunship'
  | 'stormbringer_jet'
  | 'thunderbolt_bomber'
  // Naval
  | 'wavecutter_corvette'
  | 'trident_destroyer'
  // Rail
  | 'iron_dreadnought';

export type BuildingType =
  // Command
  | 'command_center'
  | 'command_bunker'
  | 'operations_center'
  | 'comms_tower'
  | 'military_gate'
  // Production
  | 'barracks'
  | 'vehicle_factory'
  | 'aviation_hangar'
  | 'naval_dockyard'
  | 'rail_depot'
  // Economy & Support
  | 'concrete_works'
  | 'steel_foundry'
  | 'aluminum_smelter'
  | 'fuel_refinery'
  | 'storage_depot'
  | 'power_station'
  | 'repair_depot'
  | 'logistics_center'
  // Defense
  | 'guard_tower'
  | 'mg_turret'
  | 'vulcan_turret'
  | 'sam_launcher'
  | 'coastal_battery'
  | 'artillery_post'
  | 'fortified_bunker'
  | 'perimeter_wall'
  | 'radar_station';

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  category: 'economy' | 'production' | 'defense' | 'hq';
  description: string;
  cost: Resources;
  buildTimeSec: number;
  maxLevel: number;
  baseTypesAllowed: BaseType[];
  productionBonus?: Partial<Resources>; // rate per sec
  storageBonus?: Partial<Resources>;
  defenseStats?: {
    damage: number;
    range: number;
    rateOfFire: number; // shots per sec
    targets: ('ground' | 'air' | 'naval' | 'rail')[];
  };
  enabled?: boolean;
}

export interface UnitDefinition {
  type: UnitType;
  name: string;
  category: UnitCategory;
  role: string;
  description: string;
  cost: Resources;
  trainTimeSec: number;
  populationCost: number;
  maxHealth: number;
  armor: number; // damage reduction percentage or flat
  speed: number; // grid cells per second
  attackRange: number; // grid cells
  attackDamage: number;
  cooldownSec: number;
  targets: UnitCategory[];
  visionRadius: number; // grid cells
  fuelBurnPerSec: number;
  canCaptureBase?: boolean;
  requiredBuilding: BuildingType;
  enabled?: boolean;
}

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  level: number;
  health: number;
  maxHealth: number;
  isConstructing?: boolean;
  upgradeCompletionTime?: number; // epoch ms
  offsetX?: number; // relative to base center in grid cells
  offsetY?: number; // relative to base center in grid cells
}

export interface ConstructionOrder {
  id: string;
  baseId: string;
  buildingType: BuildingType;
  targetLevel: number;
  startTime: number;
  finishTime: number;
  cost: Resources;
  offsetX?: number;
  offsetY?: number;
}

export interface UnitProductionOrder {
  id: string;
  baseId: string;
  unitType: UnitType;
  startTime: number;
  finishTime: number;
  cost: Resources;
}

export type BaseLifecycleState =
  | 'active'
  | 'protected'
  | 'rebuilding'
  | 'neutralized'
  | 'ownerless'
  | 'captured'
  | 'destroyed';

export type SpawnMapFallbackPolicy = 'next_eligible_map' | 'reject_when_full';

export interface HomeBaseDestructionRecord {
  id: string;
  baseId: string;
  attackerId: string;
  attackerName: string;
  previousMapId: string;
  previousCoords: { x: number; y: number };
  newMapId: string;
  newCoords: { x: number; y: number };
  persistentBuildingsPreserved: string[];
  resetBuildingsCount: number;
  shieldExpiresAt: number;
  timestamp: number;
}

export interface PlacementFailureRecord {
  id: string;
  mapId: string;
  attemptedCoords?: { x: number; y: number };
  reason: string;
  timestamp: number;
}

export interface ArchivedHomeBaseSnapshot {
  baseId: string;
  name: string;
  mapId: string;
  lastValidCoords: { x: number; y: number };
  resources: Resources;
  buildings: BuildingInstance[];
  destructionHistory?: HomeBaseDestructionRecord[];
  archivedAt: number;
}

export interface Base {
  id: string;
  mapId?: string; // Sector map ID (e.g. 'map_riverfront_assault')
  name: string;
  type: BaseType;
  isHomeBase?: boolean; // Explicit Home Base flag (distinct from base.type === 'home')
  lifecycleState?: BaseLifecycleState;
  ownerId: string; // userId or 'neutral' or 'enemy_insurgent'
  ownerName: string;
  allianceId?: string | null;
  x: number; // grid cell
  y: number; // grid cell
  radius: number; // visual & interaction radius in cells
  health: number;
  maxHealth: number;
  hqLevel?: number;
  armorMultiplier?: number;
  buildings: BuildingInstance[];
  resources: Resources;
  storageCap: Resources;
  productionRates: Resources; // per second
  consumptionRates?: Resources; // per second
  lastResourceUpdate: number; // epoch ms
  constructionQueue: ConstructionOrder[];
  productionQueue: UnitProductionOrder[];
  defenseShield: number;
  maxShield: number;
  captureProgress: number; // 0 to 100
  capturingPlayerId?: string | null;
  captureContested?: boolean;
  captureBlockedReason?: string | null;
  isProtected?: boolean;
  rebuildProtectionUntil?: number | null;
  isNewcomerBase?: boolean;
  newcomerProtectionUntil?: number | null;
  neutralizedAt?: number | null;
  neutralizedByPlayerId?: string | null;
  defensesIntact?: boolean;
  activeTurretsCount?: number;
  totalTurretsCount?: number;
  powerUsed?: number;
  powerCapacity?: number;
  destructionHistory?: HomeBaseDestructionRecord[];
  lastReconstructionAt?: number | null;
  lastMeaningfulActivityAt?: number;
  lastKnownValidCoords?: { x: number; y: number } | null;
  placementFailures?: PlacementFailureRecord[];
}

export type UnitCommandType = 'idle' | 'move' | 'attack' | 'attack_move' | 'hold' | 'patrol' | 'retreat' | 'stop';

export interface Unit {
  id: string;
  mapId?: string; // Sector map ID (e.g. 'map_riverfront_assault')
  type: UnitType;
  ownerId: string;
  ownerName: string;
  allianceId?: string | null;
  x: number; // current float x on grid
  y: number; // current float y on grid
  targetX?: number;
  targetY?: number;
  rotation: number; // radians
  health: number;
  maxHealth: number;
  command: UnitCommandType;
  targetUnitId?: string | null;
  targetBaseId?: string | null;
  path: { x: number; y: number }[];
  lastAttackTime: number; // epoch ms
  kills: number;
  homeBaseId: string;
  assignedGroup?: number | null;
}

export type TerrainType =
  | 'grass'
  | 'light_grass'
  | 'plains'
  | 'forest'
  | 'forest_floor'
  | 'pine_forest'
  | 'dirt'
  | 'mud'
  | 'sand'
  | 'rock'
  | 'mountain'
  | 'hills'
  | 'snow'
  | 'water'
  | 'deep_water'
  | 'swamp'
  | 'marsh'
  | 'farmland'
  | 'highway'
  | 'road'
  | 'rural_road'
  | 'dirt_road'
  | 'mud_track'
  | 'damaged_road'
  | 'railway'
  | 'bridge_road'
  | 'bridge_rail';

export type EnvObjectType =
  | 'tree_oak'
  | 'tree_pine'
  | 'tree_birch'
  | 'tree_cedar'
  | 'tree_dead'
  | 'bush'
  | 'fern_cluster'
  | 'boulder'
  | 'cliff_rock'
  | 'fallen_log'
  | 'crater_small'
  | 'crater_large'
  | 'tank_tracks'
  | 'bunker'
  | 'watchtower'
  | 'sandbags'
  | 'barricade'
  | 'ruined_tank'
  | 'crate_stack'
  | 'fuel_drums'
  | 'field_tent'
  | 'camo_tent'
  | 'radar_dish';

export interface EnvironmentObject {
  id: string;
  mapId?: string;
  type: EnvObjectType;
  x: number; // grid coordinate (float)
  y: number; // grid coordinate (float)
  scale?: number;
  rotation?: number;
  variant?: number;
  blocksMovement?: boolean;
}

export interface HighwayExit {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  targetMapId: string;
  targetMapName: string;
  entryX: number;
  entryY: number;
  fuelCostPerUnit: number;
  allowedCategories: UnitCategory[];
}

export interface WorldMapConfig {
  width: number;
  height: number;
  tileSize: number;
  seed: number;
}

// ============================================================================
// ADMIN PANEL, RBAC, MODERATION, ECONOMY & AUDIT TYPES
// ============================================================================

export type AdminRole = 'super_admin' | 'game_admin' | 'moderator' | 'analyst';

export type AdminPermission =
  | 'dashboard.view'
  | 'players.view'
  | 'players.suspend'
  | 'players.ban'
  | 'players.reset_progress'
  | 'matches.view'
  | 'matches.terminate'
  | 'economy.view'
  | 'economy.edit'
  | 'maps.view'
  | 'maps.edit'
  | 'content.publish'
  | 'announcements.manage'
  | 'audit.view'
  | 'admins.manage';

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    'dashboard.view',
    'players.view',
    'players.suspend',
    'players.ban',
    'players.reset_progress',
    'matches.view',
    'matches.terminate',
    'economy.view',
    'economy.edit',
    'maps.view',
    'maps.edit',
    'content.publish',
    'announcements.manage',
    'audit.view',
    'admins.manage',
  ],
  game_admin: [
    'dashboard.view',
    'players.view',
    'players.suspend',
    'Matches.view' as AdminPermission,
    'matches.view',
    'matches.terminate',
    'economy.view',
    'economy.edit',
    'maps.view',
    'maps.edit',
    'content.publish',
    'announcements.manage',
    'audit.view',
  ].filter((v, i, a) => a.indexOf(v) === i && v !== ('Matches.view' as any)) as AdminPermission[],
  moderator: [
    'dashboard.view',
    'players.view',
    'players.suspend',
    'players.ban',
    'matches.view',
    'announcements.manage',
    'audit.view',
  ],
  analyst: [
    'dashboard.view',
    'players.view',
    'matches.view',
    'economy.view',
    'maps.view',
    'audit.view',
  ],
};

export type PlayerStatus = 'active' | 'suspended' | 'banned';

export type PlayerType = 'human' | 'bot' | 'system' | 'unknown';

export type ControlSource = 'human' | 'ai_controller' | 'system' | 'unverified';

export type VerificationStatus = 'verified' | 'admin_verified' | 'system_registered' | 'legacy_unverified';

export interface BotAgentRecord {
  botId: string;
  playerId: string;
  playerType: 'bot';
  displayName: string;
  faction: string;
  difficulty: AIDifficulty;
  aiProfile: string;
  activeMapIds: string[];
  matchIds: string[];
  controlSource: 'ai_controller';
  controlStatus: 'autonomous_active' | 'paused' | 'standby';
  creationSource: string;
  state: 'active' | 'paused' | 'idle' | 'terminated';
  createdAt: number;
  lastDecisionAt: number;
}

export interface SystemEntityRecord {
  entityId: string;
  playerId: string;
  playerType: 'system';
  displayName: string;
  faction: string;
  activeMapIds?: string[];
  controlSource: 'system';
  creationSource: string;
  state: 'active' | 'idle';
  createdAt: number;
  lastUpdatedAt: number;
}

export interface PlayerTypeStatsSummary {
  totalPlayers: number;
  totalHumanPlayers: number;
  activeHumanPlayers: number;
  offlineHumanPlayers: number;
  totalBotPlayers: number;
  activeBotPlayers: number;
  totalSystemEntities: number;
  totalUnknownPlayers: number;
}

export interface MatchParticipantSummary {
  playerId: string;
  username: string;
  displayName?: string;
  playerType: PlayerType;
  faction: string;
  allianceTag?: string | null;
  controlSource: ControlSource;
  verificationStatus?: VerificationStatus;
  isOnline: boolean;
  connectionStatus?: 'online' | 'offline' | 'active' | 'idle';
  basesCount: number;
  unitsCount: number;
  botDifficulty?: AIDifficulty | null;
  difficulty?: AIDifficulty | null;
  aiProfile?: string | null;
}

export interface AdminPlayerRecord {
  id: string;
  playerId?: string;
  username: string;
  displayName?: string;
  email: string;
  rank: string;
  score: number;
  level: number;
  avatar: string;
  playerType: PlayerType;
  accountId: string | null;
  botAgentId: string | null;
  controlSource: ControlSource;
  controlStatus: string;
  creationSource: string;
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;
  verifiedAt: number | null;
  botDifficulty: AIDifficulty | null;
  botAiProfile: string | null;
  faction: string;
  allianceId?: string | null;
  allianceName: string | null;
  allianceTag: string | null;
  allianceRole: AllianceRole | null;
  homeBaseId: string;
  homeMapId?: string;
  currentMapId: string;
  currentMapName: string;
  currentSectorName?: string;
  activeMatchId: string | null;
  activeMatchIds: string[];
  activeMapIds: string[];
  status: PlayerStatus | 'active' | 'idle' | 'terminated';
  connectionStatus: 'online' | 'offline' | 'active' | 'idle';
  isOnline: boolean;
  isAdmin?: boolean;
  adminRole?: AdminRole | null;
  basesControlled: number;
  activeUnits: number;
  basesOwned?: number;
  unitsOwned?: number;
  totalBasesCaptured: number;
  totalUnitsProduced: number;
  totalUnitsDestroyed: number;
  totalResourcesHarvested: number;
  joinedAt: number;
  createdAt?: number;
  lastLoginAt: number;
  lastActiveAt: number;
  lastStateUpdateAt?: number;
  suspendedUntil?: number | null;
  banReason?: string | null;
  botProfile?: {
    botId: string;
    difficulty: AIDifficulty;
    aiProfile: string;
    controlStatus: 'autonomous_active' | 'paused' | 'standby';
    creationSource: string;
    lastDecisionAt: number;
  } | null;
  moderationHistory: ModerationRecord[];
}

export interface ModerationRecord {
  id: string;
  action:
    | 'suspend'
    | 'unsuspend'
    | 'ban'
    | 'unban'
    | 'reset_progress'
    | 'rename'
    | 'role_change'
    | 'verify_type'
    | 'delete_account'
    | 'home_base_recover'
    | 'home_base_relocate'
    | 'home_base_repair'
    | 'home_base_reset_cooldowns';
  adminId: string;
  adminUsername: string;
  reason: string;
  timestamp: number;
  expiresAt?: number | null;
  metadata?: Record<string, any>;
}

export type AllianceRole = 'leader' | 'co_leader' | 'officer' | 'member';
export type AllianceRecruitmentMode = 'open' | 'request_only' | 'invite_only';

export interface SupportTicket {
  id: string;
  userId: string;
  username: string;
  category: 'account_recovery' | 'bug_report' | 'fair_play' | 'general';
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: number;
}

export interface PlayerProfile {
  id: string;
  username: string;
  email: string;
  playerType?: PlayerType;
  accountId?: string | null;
  botAgentId?: string | null;
  controlSource?: ControlSource;
  verificationStatus?: VerificationStatus;
  verifiedBy?: string | null;
  verifiedAt?: number | null;
  rank: string;
  score: number;
  level: number;
  avatar: string;
  faction?: string;
  allianceId?: string | null;
  allianceRole?: AllianceRole | null;
  homeBaseId: string;
  homeMapId?: string;
  homeBaseCoords?: { x: number; y: number };
  homeMapChangeCooldownUntil?: number | null;
  currentMapId?: string;
  totalBasesCaptured: number;
  weeklyCaptureTimestamps?: number[];
  weeklyCapturesCount?: number;
  homeBaseDestroyedCount?: number;
  homeBaseDestructionHistory?: HomeBaseDestructionRecord[];
  placementFailures?: PlacementFailureRecord[];
  archivedHomeBase?: ArchivedHomeBaseSnapshot | null;
  lastMapActivityAt?: number;
  lastHomeMapChangeAt?: number;
  totalUnitsProduced: number;
  totalUnitsDestroyed: number;
  totalResourcesHarvested: number;
  highwayTransfersCompleted?: number;
  claimedRewardIds?: string[];
  joinedAt: number;
  lastLoginAt: number;
  lastActiveAt?: number;
  isInactiveRelocated?: boolean;
  beginnerProtectionUntil: number; // epoch ms
  isAdmin?: boolean;
  adminRole?: AdminRole | null;
  status?: PlayerStatus;
  suspendedUntil?: number | null;
  banReason?: string | null;
  moderationHistory?: ModerationRecord[];
}

export interface EconomyConfig {
  version: number;
  resourceGenerationMultiplier: number; // 0.1 to 10.0
  baseGenerationRates: Resources; // base passive generation per sec
  startingResources: Resources;
  baseStorageCap: Resources;
  unitCostMultiplier: number; // 0.2 to 5.0
  buildingCostMultiplier: number; // 0.2 to 5.0
  unitProductionSpeedMultiplier: number; // 0.2 to 5.0
  buildingBuildSpeedMultiplier: number; // 0.2 to 5.0
  populationCapPerBase: number; // 10 to 200
  maxGlobalUnits: number; // 50 to 1000
  maxUnitsPerMap?: number; // 30 to 400
  maxBasesPerPlayerOnMap?: number; // 1 to 15
  maxBuildingsPerBase?: number; // 6 to 30
  maxSelectionGroupSize?: number; // 6 to 60
  fuelTravelCostMultiplier?: number; // 0.2 to 5.0
  captureSpeedPerTick: number; // 1 to 25
  // Combat Siege-inspired spawn, protection, destruction & conquest policy
  minBaseSpawnDistance?: number; // min center-to-center margin beyond base radii (default 12)
  homeBaseProtectionDurationHours?: number; // beginner protection duration in hours (default 48)
  rebuildProtectionDurationMinutes?: number; // replacement Home Base shield in minutes (default 30)
  homeBaseArmorMultiplier?: number; // incoming siege damage reduction multiplier (default 1.5)
  productionDestroyPercentOnNeutralize?: number; // percentage of eligible production buildings destroyed (default 50)
  destroyMaxCapBuildingsOnNeutralize?: boolean; // destroy max-capacity / storage facilities on neutralization (default true)
  newbaseMaxOwnedBasesThreshold?: number; // max total bases owned to qualify for Newbase (default 2)
  newbaseMaxWeeklyCapturesThreshold?: number; // max weekly captures to qualify for Newbase (default 2)
  newbaseProtectionDurationHours?: number; // duration before Newbase becomes ordinary base (default 72)
  weeklyCaptureLimitPerPlayer?: number; // max bases a player can capture per rolling 7 days (default 10)
  inactivityEvictionDays?: number; // days of inactivity before Home Base is archived from map (default 14)
  spawnMapFallbackPolicy?: SpawnMapFallbackPolicy; // 'next_eligible_map' | 'reject_when_full'
  conquestUnitTypes?: UnitType[]; // default ['dominator_conquest']
  updatedAt: number;
  updatedBy: string;
}

export interface ConfigVersionEntry {
  version: number;
  domain: 'economy' | 'catalog' | 'settings' | 'map';
  timestamp: number;
  adminId: string;
  adminUsername: string;
  reason: string;
  snapshot: any;
  changesSummary: string;
}

export interface UnitCatalogOverride {
  type: UnitType;
  name: string;
  description: string;
  maxHealth: number;
  armor: number;
  speed: number;
  attackRange: number;
  attackDamage: number;
  cooldownSec: number;
  trainTimeSec: number;
  populationCost: number;
  cost: Resources;
  enabled: boolean;
}

export interface BuildingCatalogOverride {
  type: BuildingType;
  name: string;
  description: string;
  buildTimeSec: number;
  maxLevel: number;
  cost: Resources;
  productionBonus?: Partial<Resources>;
  storageBonus?: Partial<Resources>;
  defenseDamage?: number;
  defenseRange?: number;
  enabled: boolean;
}

export interface CatalogConfigState {
  version: number;
  units: Partial<Record<UnitType, UnitCatalogOverride>>;
  buildings: Partial<Record<BuildingType, BuildingCatalogOverride>>;
  updatedAt: number;
  updatedBy: string;
}

export interface MapSectorConfig {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  tileSize: number;
  seed: number;
  maxPlayers: number;
  maxUnitsOnMap?: number;
  maxBasesPerPlayer?: number;
  maxPopPerPlayer?: number;
  minBaseSpawnDistance?: number;
  highwayExits?: HighwayExit[];
  enabled: boolean;
  isActiveMap: boolean;
  atmospherePreset: AtmospherePreset;
  objectiveTitle: string;
  objectiveDescription: string;
  updatedAt: number;
  updatedBy: string;
}

export type AnnouncementPriority = 'info' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  published: boolean;
  startsAt: number;
  expiresAt: number | null;
  createdBy: string;
  createdByUsername: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  adminId: string;
  adminUsername: string;
  adminRole: AdminRole | 'unknown';
  action: string;
  targetType: 'player' | 'match' | 'economy' | 'catalog' | 'map' | 'announcement' | 'admin' | 'system' | 'auth';
  targetId: string;
  reason: string;
  status: 'success' | 'failure' | 'denied';
  ipAddress: string;
  metadata?: Record<string, any>;
}

export interface MatchRecord {
  id: string;
  mapId: string;
  mapName: string;
  seed: number;
  status: 'active' | 'completed' | 'terminated';
  startedAt: number;
  endedAt?: number | null;
  aiDifficulty: AIDifficulty;
  participantIds: string[];
  winnerName?: string | null;
  totalUnitsSpawned: number;
  totalBasesCaptured: number;
  terminationReason?: string | null;
}

export interface SystemSettings {
  gameTitle: string;
  gameVersion: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  fogOfWarEnforced: boolean;
  alliancesEnabled: boolean;
  aiAggressionEnabled: boolean;
  allowNewRegistrations: boolean;
  sessionTtlMs: number;
  updatedAt: number;
  updatedBy: string;
}

export interface AdminSessionInfo {
  tokenPrefix: string;
  userId: string;
  username: string;
  role: AdminRole;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  ipAddress: string;
}

export interface AllianceJoinRequest {
  userId: string;
  username: string;
  requestedAt: number;
  message?: string;
}

export interface AllianceInvite {
  userId: string;
  username: string;
  invitedBy: string;
  invitedByUsername: string;
  invitedAt: number;
}

export interface AllianceActivityEntry {
  id: string;
  text: string;
  timestamp: number;
}

export interface Alliance {
  id: string;
  name: string;
  tag: string; // 3-4 chars, e.g. [DOM]
  description: string;
  leaderId: string;
  leaderName: string;
  memberIds: string[];
  memberRoles?: Record<string, AllianceRole>;
  recruitmentMode?: AllianceRecruitmentMode;
  maxMembers?: number;
  joinRequests?: AllianceJoinRequest[];
  invites?: AllianceInvite[];
  activityLog?: AllianceActivityEntry[];
  bannerColor: string;
  createdTime: number;
  score: number;
  territoryBasesCount: number;
}

export interface ChatMessage {
  id: string;
  mapId?: string;
  senderId: string;
  senderName: string;
  allianceTag?: string | null;
  channel: 'global' | 'alliance' | 'system';
  allianceId?: string | null;
  content: string;
  coords?: { x: number; y: number };
  timestamp: number;
}

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface CombatEvent {
  id: string;
  mapId?: string;
  attackerId: string;
  attackerType: string;
  attackerOwnerId: string;
  attackerX?: number;
  attackerY?: number;
  targetId: string;
  targetType: string;
  damage: number;
  x: number;
  y: number;
  isFatal?: boolean;
  timestamp: number;
}

export interface GameNotification {
  id: string;
  userId: string;
  mapId?: string;
  type: 'attack' | 'capture' | 'production' | 'alliance' | 'system' | 'progression';
  title: string;
  message: string;
  coords?: { x: number; y: number };
  timestamp: number;
  read: boolean;
}

export interface BattleReport {
  id: string;
  mapId: string;
  mapName: string;
  type:
    | 'base_captured'
    | 'base_neutralized'
    | 'home_base_destroyed'
    | 'hq_siege'
    | 'highway_transfer'
    | 'skirmish_victory';
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  baseId?: string;
  baseName?: string;
  replacementBaseId?: string;
  replacementCoords?: { x: number; y: number };
  coords: { x: number; y: number };
  plunderedResources?: Partial<Resources>;
  buildingsDamaged?: number;
  buildingsDestroyed?: number;
  unitsTransferred?: number;
  fuelSpent?: number;
  summary: string;
  timestamp: number;
}

export interface AchievementProgress {
  id: string;
  title: string;
  description: string;
  category: 'combat' | 'conquest' | 'economy' | 'logistics' | 'alliance';
  currentValue: number;
  targetValue: number;
  completed: boolean;
  claimed: boolean;
  rewardScore: number;
  rewardResources: Resources;
}

export interface MissionProgress {
  id: string;
  cadence: 'daily' | 'weekly';
  title: string;
  description: string;
  currentValue: number;
  targetValue: number;
  completed: boolean;
  claimed: boolean;
  rewardScore: number;
  rewardResources: Resources;
}

export interface FullWorldState {
  mapId?: string;
  bases: Base[];
  units: Unit[];
  alliances: Alliance[];
  onlineUserIds: string[];
  envObjects: EnvironmentObject[];
  highwayExits?: HighwayExit[];
  exploredBounds?: number[];
  timestamp: number;
}

