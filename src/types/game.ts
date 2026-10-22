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

export interface Base {
  id: string;
  mapId?: string; // Sector map ID (e.g. 'map_riverfront_assault')
  name: string;
  type: BaseType;
  ownerId: string; // userId or 'neutral' or 'enemy_insurgent'
  ownerName: string;
  allianceId?: string | null;
  x: number; // grid cell
  y: number; // grid cell
  radius: number; // visual & interaction radius in cells
  health: number;
  maxHealth: number;
  buildings: BuildingInstance[];
  resources: Resources;
  storageCap: Resources;
  productionRates: Resources; // per second
  lastResourceUpdate: number; // epoch ms
  constructionQueue: ConstructionOrder[];
  productionQueue: UnitProductionOrder[];
  defenseShield: number;
  maxShield: number;
  captureProgress: number; // 0 to 100
  capturingPlayerId?: string | null;
  captureContested?: boolean;
  isProtected?: boolean;
  rebuildProtectionUntil?: number | null;
  powerUsed?: number;
  powerCapacity?: number;
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

export interface ModerationRecord {
  id: string;
  action: 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'reset_progress' | 'rename' | 'role_change';
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
  rank: string;
  score: number;
  level: number;
  avatar: string;
  allianceId?: string | null;
  allianceRole?: AllianceRole | null;
  homeBaseId: string;
  currentMapId?: string;
  totalBasesCaptured: number;
  totalUnitsProduced: number;
  totalUnitsDestroyed: number;
  totalResourcesHarvested: number;
  highwayTransfersCompleted?: number;
  claimedRewardIds?: string[];
  joinedAt: number;
  lastLoginAt: number;
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
  type: 'base_captured' | 'hq_siege' | 'highway_transfer' | 'skirmish_victory';
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  baseId?: string;
  baseName?: string;
  coords: { x: number; y: number };
  plunderedResources?: Partial<Resources>;
  buildingsDamaged?: number;
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

