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
  name: string;
  type: BaseType;
  ownerId: string; // userId or 'neutral' or 'insurgent'
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
  isProtected?: boolean;
}

export type UnitCommandType = 'idle' | 'move' | 'attack' | 'attack_move' | 'hold' | 'patrol' | 'retreat' | 'stop';

export interface Unit {
  id: string;
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
  type: EnvObjectType;
  x: number; // grid coordinate (float)
  y: number; // grid coordinate (float)
  scale?: number;
  rotation?: number;
  variant?: number;
  blocksMovement?: boolean;
}

export interface WorldMapConfig {
  width: number;
  height: number;
  tileSize: number;
  seed: number;
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
  allianceRole?: 'leader' | 'officer' | 'member' | null;
  homeBaseId: string;
  totalBasesCaptured: number;
  totalUnitsProduced: number;
  totalUnitsDestroyed: number;
  totalResourcesHarvested: number;
  joinedAt: number;
  lastLoginAt: number;
  beginnerProtectionUntil: number; // epoch ms
  isAdmin?: boolean;
}

export interface Alliance {
  id: string;
  name: string;
  tag: string; // 3-4 chars, e.g. [DOM]
  description: string;
  leaderId: string;
  leaderName: string;
  memberIds: string[];
  bannerColor: string;
  createdTime: number;
  score: number;
  territoryBasesCount: number;
}

export interface ChatMessage {
  id: string;
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
  type: 'attack' | 'capture' | 'production' | 'alliance' | 'system';
  title: string;
  message: string;
  coords?: { x: number; y: number };
  timestamp: number;
  read: boolean;
}

export interface FullWorldState {
  bases: Base[];
  units: Unit[];
  alliances: Alliance[];
  onlineUserIds: string[];
  envObjects: EnvironmentObject[];
  timestamp: number;
}
