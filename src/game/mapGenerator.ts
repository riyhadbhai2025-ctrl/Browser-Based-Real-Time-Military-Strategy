import { Base, TerrainType, WorldMapConfig } from '../types/game';

// Seeded PRNG for reproducible world generation
export class SeededRandom {
  private seed: number;

  constructor(seed: number = 42817) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

export interface GeneratedWorld {
  config: WorldMapConfig;
  terrain: TerrainType[][]; // [y][x]
  bases: Base[];
}

export function generateWorld(config: WorldMapConfig = { width: 100, height: 75, tileSize: 40, seed: 1042 }): GeneratedWorld {
  const rng = new SeededRandom(config.seed);
  const { width, height } = config;

  // Initialize terrain as plains / grassland
  const terrain: TerrainType[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const v = rng.next();
      return v > 0.6 ? 'grass' : 'plains';
    })
  );

  // 1. Generate Mountain ranges (impassable for ground/naval)
  const mountainClusters = 8;
  for (let c = 0; c < mountainClusters; c++) {
    const cx = rng.rangeInt(10, width - 10);
    const cy = rng.rangeInt(10, height - 10);
    const radius = rng.rangeInt(3, 7);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius && rng.next() > 0.25) {
            terrain[ny][nx] = 'mountain';
          }
        }
      }
    }
  }

  // 2. Generate Forest groves
  const forestCount = 16;
  for (let f = 0; f < forestCount; f++) {
    const fx = rng.rangeInt(5, width - 5);
    const fy = rng.rangeInt(5, height - 5);
    const radius = rng.rangeInt(3, 6);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && terrain[ny][nx] !== 'mountain') {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius && rng.next() > 0.3) {
            terrain[ny][nx] = 'forest';
          }
        }
      }
    }
  }

  // 3. Generate River and Coastal Water
  // Major river flowing from north to south with meander
  let riverX = Math.floor(width * 0.45);
  for (let y = 0; y < height; y++) {
    if (rng.next() > 0.55) {
      riverX += rng.next() > 0.5 ? 1 : -1;
    }
    riverX = Math.max(15, Math.min(width - 25, riverX));

    for (let w = -2; w <= 2; w++) {
      const rx = riverX + w;
      if (rx >= 0 && rx < width) {
        terrain[y][rx] = w === 0 ? 'deep_water' : 'water';
      }
    }
  }

  // Coastal bay on the east edge (x: 85 to 99)
  for (let y = 0; y < height; y++) {
    const coastStart = Math.floor(width * 0.84 + Math.sin(y * 0.15) * 5);
    for (let x = coastStart; x < width; x++) {
      terrain[y][x] = x > coastStart + 4 ? 'deep_water' : 'water';
    }
  }

  // 4. Roads connecting east and west, north and south
  // Highway 1: East-West crossing with bridges over river
  const roadY1 = Math.floor(height * 0.28);
  const roadY2 = Math.floor(height * 0.65);

  [roadY1, roadY2].forEach((ry) => {
    for (let x = 4; x < width * 0.83; x++) {
      if (terrain[ry][x] === 'water' || terrain[ry][x] === 'deep_water') {
        terrain[ry][x] = 'bridge_road';
      } else if (terrain[ry][x] !== 'mountain') {
        terrain[ry][x] = 'road';
      }
    }
  });

  // 5. Armored Railway Line connecting Rail Depot to tactical sectors
  const railY = Math.floor(height * 0.48);
  for (let x = 6; x < width * 0.82; x++) {
    if (terrain[railY][x] === 'water' || terrain[railY][x] === 'deep_water') {
      terrain[railY][x] = 'bridge_rail';
    } else {
      terrain[railY][x] = 'railway';
    }
  }

  // Spur line going north-east
  for (let y = railY; y >= 18; y--) {
    const rx = Math.floor(width * 0.68 + (railY - y) * 0.2);
    if (rx < width && terrain[y][rx] !== 'water' && terrain[y][rx] !== 'deep_water') {
      terrain[y][rx] = 'railway';
    }
  }

  // 6. Pre-designed Strategic Bases
  const now = Date.now();
  const bases: Base[] = [
    {
      id: 'base_alpha_home',
      name: 'Fortress Alpha (Home Base)',
      type: 'home',
      ownerId: 'player_default',
      ownerName: 'Commander',
      allianceId: 'alli_dominion',
      x: 14,
      y: 28,
      radius: 4,
      health: 3500,
      maxHealth: 3500,
      defenseShield: 1200,
      maxShield: 1200,
      captureProgress: 0,
      isProtected: true,
      resources: { concrete: 3500, steel: 3000, aluminum: 1800, fuel: 2200 },
      storageCap: { concrete: 15000, steel: 12000, aluminum: 8000, fuel: 10000 },
      productionRates: { concrete: 12, steel: 10, aluminum: 6, fuel: 8 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_1', type: 'command_center', level: 3, health: 1500, maxHealth: 1500 },
        { id: 'b_cw_1', type: 'concrete_works', level: 2, health: 600, maxHealth: 600 },
        { id: 'b_sf_1', type: 'steel_foundry', level: 2, health: 650, maxHealth: 650 },
        { id: 'b_as_1', type: 'aluminum_smelter', level: 2, health: 500, maxHealth: 500 },
        { id: 'b_fr_1', type: 'fuel_refinery', level: 2, health: 550, maxHealth: 550 },
        { id: 'b_vf_1', type: 'vehicle_factory', level: 2, health: 900, maxHealth: 900 },
        { id: 'b_ah_1', type: 'aviation_hangar', level: 1, health: 800, maxHealth: 800 },
        { id: 'b_vt_1', type: 'vulcan_turret', level: 2, health: 450, maxHealth: 450 },
        { id: 'b_sam_1', type: 'sam_launcher', level: 1, health: 400, maxHealth: 400 },
      ],
    },
    {
      id: 'base_tank_armory',
      name: 'Iron Forge Tank Redoubt',
      type: 'tank',
      ownerId: 'player_default',
      ownerName: 'Commander',
      allianceId: 'alli_dominion',
      x: 18,
      y: 52,
      radius: 4,
      health: 2800,
      maxHealth: 2800,
      defenseShield: 800,
      maxShield: 800,
      captureProgress: 0,
      resources: { concrete: 2200, steel: 3400, aluminum: 900, fuel: 1600 },
      storageCap: { concrete: 12000, steel: 15000, aluminum: 6000, fuel: 8000 },
      productionRates: { concrete: 8, steel: 15, aluminum: 4, fuel: 7 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_2', type: 'command_center', level: 2, health: 1200, maxHealth: 1200 },
        { id: 'b_sf_2', type: 'steel_foundry', level: 3, health: 800, maxHealth: 800 },
        { id: 'b_vf_2', type: 'vehicle_factory', level: 2, health: 900, maxHealth: 900 },
        { id: 'b_vt_2', type: 'vulcan_turret', level: 2, health: 450, maxHealth: 450 },
      ],
    },
    {
      id: 'base_air_eagle',
      name: 'Eaglecrest Air Wing Base',
      type: 'air',
      ownerId: 'neutral',
      ownerName: 'Independent Defense Corps',
      x: 32,
      y: 16,
      radius: 4,
      health: 2600,
      maxHealth: 2600,
      defenseShield: 600,
      maxShield: 600,
      captureProgress: 0,
      resources: { concrete: 1500, steel: 1500, aluminum: 2500, fuel: 2800 },
      storageCap: { concrete: 10000, steel: 10000, aluminum: 12000, fuel: 12000 },
      productionRates: { concrete: 5, steel: 5, aluminum: 12, fuel: 10 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_3', type: 'command_center', level: 2, health: 1200, maxHealth: 1200 },
        { id: 'b_ah_2', type: 'aviation_hangar', level: 2, health: 950, maxHealth: 950 },
        { id: 'b_as_2', type: 'aluminum_smelter', level: 2, health: 600, maxHealth: 600 },
        { id: 'b_sam_2', type: 'sam_launcher', level: 2, health: 500, maxHealth: 500 },
      ],
    },
    {
      id: 'base_harbor_trident',
      name: 'Vanguard Deepwater Naval Port',
      type: 'harbor',
      ownerId: 'neutral',
      ownerName: 'Maritime Patrol Force',
      x: 82,
      y: 35,
      radius: 4,
      health: 3000,
      maxHealth: 3000,
      defenseShield: 800,
      maxShield: 800,
      captureProgress: 0,
      resources: { concrete: 2000, steel: 2800, aluminum: 1500, fuel: 2400 },
      storageCap: { concrete: 12000, steel: 14000, aluminum: 8000, fuel: 10000 },
      productionRates: { concrete: 6, steel: 11, aluminum: 5, fuel: 9 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_4', type: 'command_center', level: 2, health: 1200, maxHealth: 1200 },
        { id: 'b_nd_1', type: 'naval_dockyard', level: 2, health: 1100, maxHealth: 1100 },
        { id: 'b_cb_1', type: 'coastal_battery', level: 2, health: 650, maxHealth: 650 },
      ],
    },
    {
      id: 'base_rail_fortress',
      name: 'Garrison Iron-Spur Rail Depot',
      type: 'rail',
      ownerId: 'neutral',
      ownerName: 'Railway Logistics Union',
      x: 62,
      y: 48,
      radius: 4,
      health: 2900,
      maxHealth: 2900,
      defenseShield: 700,
      maxShield: 700,
      captureProgress: 0,
      resources: { concrete: 2500, steel: 3600, aluminum: 1200, fuel: 2000 },
      storageCap: { concrete: 12000, steel: 15000, aluminum: 7000, fuel: 9000 },
      productionRates: { concrete: 9, steel: 14, aluminum: 4, fuel: 8 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_5', type: 'command_center', level: 2, health: 1200, maxHealth: 1200 },
        { id: 'b_rd_1', type: 'rail_depot', level: 2, health: 1100, maxHealth: 1100 },
        { id: 'b_vt_3', type: 'vulcan_turret', level: 2, health: 450, maxHealth: 450 },
      ],
    },
    {
      id: 'base_enemy_stronghold',
      name: 'Kodiak Syndicate Stronghold',
      type: 'tank',
      ownerId: 'enemy_insurgent',
      ownerName: 'Kodiak PMC',
      x: 70,
      y: 20,
      radius: 4,
      health: 3200,
      maxHealth: 3200,
      defenseShield: 1000,
      maxShield: 1000,
      captureProgress: 0,
      resources: { concrete: 4000, steel: 4500, aluminum: 2000, fuel: 3000 },
      storageCap: { concrete: 16000, steel: 16000, aluminum: 10000, fuel: 12000 },
      productionRates: { concrete: 12, steel: 14, aluminum: 8, fuel: 10 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_6', type: 'command_center', level: 3, health: 1500, maxHealth: 1500 },
        { id: 'b_vf_3', type: 'vehicle_factory', level: 2, health: 900, maxHealth: 900 },
        { id: 'b_vt_4', type: 'vulcan_turret', level: 2, health: 500, maxHealth: 500 },
        { id: 'b_sam_3', type: 'sam_launcher', level: 2, health: 500, maxHealth: 500 },
      ],
    },
    {
      id: 'base_southern_outpost',
      name: 'Delta Sector Oil Reserve',
      type: 'tank',
      ownerId: 'neutral',
      ownerName: 'Neutral Frontier',
      x: 52,
      y: 65,
      radius: 3,
      health: 2200,
      maxHealth: 2200,
      defenseShield: 500,
      maxShield: 500,
      captureProgress: 0,
      resources: { concrete: 1200, steel: 1400, aluminum: 600, fuel: 4500 },
      storageCap: { concrete: 8000, steel: 8000, aluminum: 5000, fuel: 15000 },
      productionRates: { concrete: 4, steel: 5, aluminum: 2, fuel: 16 },
      lastResourceUpdate: now,
      constructionQueue: [],
      productionQueue: [],
      buildings: [
        { id: 'b_cc_7', type: 'command_center', level: 1, health: 1000, maxHealth: 1000 },
        { id: 'b_fr_3', type: 'fuel_refinery', level: 3, health: 700, maxHealth: 700 },
        { id: 'b_vt_5', type: 'vulcan_turret', level: 1, health: 350, maxHealth: 350 },
      ],
    },
  ];

  // Flatten terrain around bases so they are clear of mountains / water
  bases.forEach((base) => {
    for (let dy = -base.radius - 1; dy <= base.radius + 1; dy++) {
      for (let dx = -base.radius - 1; dx <= base.radius + 1; dx++) {
        const nx = base.x + dx;
        const ny = base.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (terrain[ny][nx] === 'mountain' || (terrain[ny][nx] === 'water' && base.type !== 'harbor')) {
            terrain[ny][nx] = 'plains';
          }
        }
      }
    }
  });

  return { config, terrain, bases };
}
