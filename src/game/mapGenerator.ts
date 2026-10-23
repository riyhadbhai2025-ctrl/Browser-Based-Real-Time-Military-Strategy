import { Base, EnvironmentObject, TerrainType, WorldMapConfig } from '../types/game';

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
  envObjects: EnvironmentObject[];
}

export function generateWorld(config: WorldMapConfig = { width: 100, height: 75, tileSize: 44, seed: 1042 }): GeneratedWorld {
  const rng = new SeededRandom(config.seed);
  const { width, height } = config;

  // Initialize base terrain as alternating temperate grass and sunlit meadow / plains
  const terrain: TerrainType[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const v = rng.next();
      if (v > 0.6) return 'grass';
      if (v > 0.3) return 'light_grass';
      return 'plains';
    })
  );

  // 1. Generate Mountain ranges, Hills, and Rocky Scree with Alpine Snow Summits
  const mountainClusters = 9;
  for (let c = 0; c < mountainClusters; c++) {
    const cx = rng.rangeInt(8, width - 12);
    const cy = rng.rangeInt(6, height - 12);
    const radius = rng.rangeInt(4, 9);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const dist = Math.hypot(dx, dy);
          if (dist < radius * 0.4 && rng.next() > 0.3) {
            // High altitude snowy peak
            terrain[ny][nx] = 'snow';
          } else if (dist < radius * 0.75 && rng.next() > 0.25) {
            terrain[ny][nx] = 'mountain';
          } else if (dist < radius * 0.95 && rng.next() > 0.3) {
            terrain[ny][nx] = 'rock';
          } else if (dist <= radius && rng.next() > 0.35) {
            terrain[ny][nx] = 'hills';
          }
        }
      }
    }
  }

  // 2. Generate Dense Forest & Pine Groves with Organic Forest Floor Loam
  const forestCount = 20;
  for (let f = 0; f < forestCount; f++) {
    const fx = rng.rangeInt(5, width - 6);
    const fy = rng.rangeInt(5, height - 6);
    const radius = rng.rangeInt(3, 8);
    const isEvergreen = rng.next() > 0.45;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const current = terrain[ny][nx];
          if (current !== 'mountain' && current !== 'snow') {
            const dist = Math.hypot(dx, dy);
            if (dist < radius) {
              if (rng.next() > 0.2) {
                terrain[ny][nx] = isEvergreen ? 'pine_forest' : 'forest';
              } else if (rng.next() > 0.5) {
                terrain[ny][nx] = 'forest_floor';
              }
            }
          }
        }
      }
    }
  }

  // 3. Generate Farmland & Agricultural Sectors
  const farmZones = [
    { x: 26, y: 38, w: 9, h: 6 },
    { x: 38, y: 55, w: 8, h: 7 },
    { x: 10, y: 12, w: 7, h: 5 },
  ];
  farmZones.forEach((fz) => {
    for (let dy = 0; dy < fz.h; dy++) {
      for (let dx = 0; dx < fz.w; dx++) {
        const nx = fz.x + dx;
        const ny = fz.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          terrain[ny][nx] = 'farmland';
        }
      }
    }
  });

  // 4. Generate River System, Freshwater Lake, and Ocean Coastline
  let riverX = Math.floor(width * 0.46);
  for (let y = 0; y < height; y++) {
    if (rng.next() > 0.5) {
      riverX += rng.next() > 0.5 ? 1 : -1;
    }
    riverX = Math.max(16, Math.min(width - 24, riverX));

    // River channel with deep water core and shallow turquoise edges
    for (let w = -2; w <= 2; w++) {
      const rx = riverX + w;
      if (rx >= 0 && rx < width) {
        terrain[y][rx] = Math.abs(w) <= 1 ? 'deep_water' : 'water';
      }
    }

    // Riverbanks: sand and mud
    [-3, 3].forEach((offset) => {
      const bx = riverX + offset;
      if (bx >= 0 && bx < width && terrain[y][bx] !== 'mountain' && terrain[y][bx] !== 'snow') {
        terrain[y][bx] = offset === -3 ? 'sand' : 'mud';
      }
    });

    // Lower river delta swamp & marshland
    if (y > height * 0.72) {
      for (let sw = -5; sw <= 5; sw++) {
        const sx = riverX + sw;
        if (sx >= 0 && sx < width && terrain[y][sx] !== 'deep_water' && terrain[y][sx] !== 'water') {
          if (rng.next() > 0.35) {
            terrain[y][sx] = rng.next() > 0.5 ? 'swamp' : 'marsh';
          }
        }
      }
    }
  }

  // Central Lake Basin
  const lakeCenterX = Math.floor(width * 0.44);
  const lakeCenterY = Math.floor(height * 0.48);
  const lakeRadius = 5;
  for (let dy = -lakeRadius; dy <= lakeRadius; dy++) {
    for (let dx = -lakeRadius; dx <= lakeRadius; dx++) {
      const nx = lakeCenterX + dx;
      const ny = lakeCenterY + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const d = Math.hypot(dx, dy);
        if (d <= lakeRadius * 0.6) {
          terrain[ny][nx] = 'deep_water';
        } else if (d <= lakeRadius) {
          terrain[ny][nx] = 'water';
        } else if (d <= lakeRadius + 1.2 && terrain[ny][nx] !== 'mountain') {
          terrain[ny][nx] = 'sand';
        }
      }
    }
  }

  // Ocean Coastline & Deepwater Shipping Channel on the East Edge (x: 82 to width - 1)
  for (let y = 0; y < height; y++) {
    const coastStart = Math.floor(width * 0.83 + Math.sin(y * 0.16) * 4);
    // Sandy coastal beach
    if (coastStart - 1 >= 0) terrain[y][coastStart - 1] = 'sand';
    if (coastStart - 2 >= 0 && rng.next() > 0.5) terrain[y][coastStart - 2] = 'sand';

    for (let x = coastStart; x < width; x++) {
      terrain[y][x] = x > coastStart + 3 ? 'deep_water' : 'water';
    }
  }

  // 5. Roads, Highways, Rural Roads & Connecting Bridges
  // Highway 1: Northern East-West 4-lane Highway
  const roadY1 = Math.floor(height * 0.28);
  for (let x = 4; x < width * 0.82; x++) {
    if (terrain[roadY1][x] === 'water' || terrain[roadY1][x] === 'deep_water') {
      terrain[roadY1][x] = 'bridge_road';
    } else if (terrain[roadY1][x] !== 'mountain' && terrain[roadY1][x] !== 'snow') {
      terrain[roadY1][x] = 'highway';
    }
  }

  // Highway 2: Southern East-West Paved Highway with bridge
  const roadY2 = Math.floor(height * 0.65);
  for (let x = 4; x < width * 0.82; x++) {
    if (terrain[roadY2][x] === 'water' || terrain[roadY2][x] === 'deep_water') {
      terrain[roadY2][x] = 'bridge_road';
    } else if (terrain[roadY2][x] !== 'mountain' && terrain[roadY2][x] !== 'snow') {
      terrain[roadY2][x] = 'road';
    }
  }

  // Secondary North-South Rural Road connecting highways
  const ruralRoadX = Math.floor(width * 0.22);
  for (let y = roadY1; y <= roadY2; y++) {
    if (terrain[y][ruralRoadX] !== 'highway' && terrain[y][ruralRoadX] !== 'road' && terrain[y][ruralRoadX] !== 'water') {
      terrain[y][ruralRoadX] = 'rural_road';
    }
  }

  // Frontline Damaged Road near contested eastern sector
  for (let x = Math.floor(width * 0.58); x <= Math.floor(width * 0.72); x++) {
    const y = 20;
    if (terrain[y][x] !== 'water' && terrain[y][x] !== 'mountain') {
      terrain[y][x] = 'damaged_road';
    }
  }

  // Winding Dirt Roads and Muddy Logging Tracks
  const dirtRoadX = Math.floor(width * 0.34);
  for (let y = 14; y < roadY1; y++) {
    if (terrain[y][dirtRoadX] !== 'water') {
      terrain[y][dirtRoadX] = 'dirt_road';
    }
  }

  // Southern Mud Logging Track through delta
  for (let x = Math.floor(width * 0.42); x <= Math.floor(width * 0.58); x++) {
    const y = Math.floor(height * 0.82);
    if (terrain[y][x] !== 'water' && terrain[y][x] !== 'deep_water') {
      terrain[y][x] = 'mud_track';
    }
  }

  // 6. Armored Railway Line with Rail Bridge
  const railY = Math.floor(height * 0.48);
  for (let x = 6; x < width * 0.82; x++) {
    if (terrain[railY][x] === 'water' || terrain[railY][x] === 'deep_water') {
      terrain[railY][x] = 'bridge_rail';
    } else {
      terrain[railY][x] = 'railway';
    }
  }

  // Spur line going north-east to the rail depot
  for (let y = railY; y >= 18; y--) {
    const rx = Math.floor(width * 0.68 + (railY - y) * 0.2);
    if (rx < width && terrain[y][rx] !== 'water' && terrain[y][rx] !== 'deep_water') {
      terrain[y][rx] = 'railway';
    }
  }

  // Spur line going south to base_rail_fortress depot
  for (let y = railY; y <= 52; y++) {
    const rx = 62;
    if (rx < width && terrain[y][rx] !== 'water' && terrain[y][rx] !== 'deep_water') {
      terrain[y][rx] = 'railway';
    }
  }





  // 7. Strategic Military Bases
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
        { id: 'b_bar_1', type: 'barracks', level: 2, health: 750, maxHealth: 750 },
        { id: 'b_cw_1', type: 'concrete_works', level: 2, health: 600, maxHealth: 600 },
        { id: 'b_sf_1', type: 'steel_foundry', level: 2, health: 650, maxHealth: 650 },
        { id: 'b_as_1', type: 'aluminum_smelter', level: 2, health: 500, maxHealth: 500 },
        { id: 'b_fr_1', type: 'fuel_refinery', level: 2, health: 550, maxHealth: 550 },
        { id: 'b_vf_1', type: 'vehicle_factory', level: 2, health: 900, maxHealth: 900 },
        { id: 'b_ah_1', type: 'aviation_hangar', level: 1, health: 800, maxHealth: 800 },
        { id: 'b_rad_1', type: 'radar_station', level: 2, health: 500, maxHealth: 500 },
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

  // Flatten terrain around bases so they are clear of mountains / impassable waters
  bases.forEach((base) => {
    for (let dy = -base.radius - 1; dy <= base.radius + 1; dy++) {
      for (let dx = -base.radius - 1; dx <= base.radius + 1; dx++) {
        const nx = base.x + dx;
        const ny = base.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (terrain[ny][nx] === 'mountain' || terrain[ny][nx] === 'snow' || (terrain[ny][nx] === 'water' && base.type !== 'harbor')) {
            terrain[ny][nx] = 'dirt';
          }
        }
      }
    }
  });

  // 8. Procedural Environment Objects (Trees, Boulders, Bunkers, Watchtowers, Sandbags, Craters)
  const envObjects: EnvironmentObject[] = [];
  let objIdCounter = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = terrain[y][x];

      // Avoid placing inside bases or directly in the center of roads/railways
      const isNearBase = bases.some((b) => Math.hypot(b.x - x, b.y - y) <= b.radius + 0.8);
      if (isNearBase) continue;

      if (
        cell === 'highway' ||
        cell === 'road' ||
        cell === 'rural_road' ||
        cell === 'damaged_road' ||
        cell === 'bridge_road' ||
        cell === 'railway' ||
        cell === 'bridge_rail'
      ) {
        continue;
      }

      // Forest Trees
      if (cell === 'forest' || cell === 'forest_floor') {
        if (rng.next() > 0.35) {
          const treeTypes: ('tree_oak' | 'tree_birch' | 'tree_cedar')[] = ['tree_oak', 'tree_birch', 'tree_cedar'];
          const picked = treeTypes[rng.rangeInt(0, 2)];
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: picked,
            x: x + rng.range(-0.35, 0.35),
            y: y + rng.range(-0.35, 0.35),
            scale: rng.range(0.85, 1.25),
          });
        }
        if (rng.next() > 0.65) {
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: rng.next() > 0.5 ? 'bush' : 'fern_cluster',
            x: x + rng.range(-0.4, 0.4),
            y: y + rng.range(-0.4, 0.4),
            scale: rng.range(0.8, 1.1),
          });
        }
        if (rng.next() < 0.05) {
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: 'fallen_log',
            x: x,
            y: y,
            scale: 0.95,
          });
        }
      } else if (cell === 'pine_forest') {
        if (rng.next() > 0.3) {
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: 'tree_pine',
            x: x + rng.range(-0.35, 0.35),
            y: y + rng.range(-0.35, 0.35),
            scale: rng.range(0.85, 1.3),
          });
        }
      } else if (cell === 'grass' || cell === 'light_grass' || cell === 'plains') {
        // Occasional solitary tree or bush
        const v = rng.next();
        if (v < 0.04) {
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: rng.next() > 0.4 ? 'tree_oak' : 'tree_birch',
            x: x + rng.range(-0.3, 0.3),
            y: y + rng.range(-0.3, 0.3),
            scale: rng.range(0.8, 1.15),
          });
        } else if (v < 0.08) {
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: 'bush',
            x: x + rng.range(-0.3, 0.3),
            y: y + rng.range(-0.3, 0.3),
            scale: rng.range(0.75, 1.05),
          });
        }
      } else if (cell === 'rock' || cell === 'hills') {
        if (rng.next() < 0.18) {
          envObjects.push({
            id: `env_${objIdCounter++}`,
            type: rng.next() > 0.4 ? 'boulder' : 'cliff_rock',
            x: x + rng.range(-0.3, 0.3),
            y: y + rng.range(-0.3, 0.3),
            scale: rng.range(0.8, 1.25),
          });
        }
      }
    }
  }

  // 9. Strategic Tactical Fortifications (Bunkers, Watchtowers, Sandbags at Chokepoints & Base Entrances)
  const strategicProps: { type: any; x: number; y: number }[] = [
    // Bridge Checkpoint 1 (Northern Highway bridge)
    { type: 'bunker', x: 44, y: roadY1 - 1.2 },
    { type: 'sandbags', x: 44, y: roadY1 + 1.2 },
    { type: 'watchtower', x: 49, y: roadY1 - 1.5 },
    // Bridge Checkpoint 2 (Southern Highway bridge)
    { type: 'bunker', x: 44, y: roadY2 - 1.2 },
    { type: 'sandbags', x: 44, y: roadY2 + 1.2 },
    { type: 'watchtower', x: 49, y: roadY2 + 1.5 },
    // Railway Guard Post
    { type: 'bunker', x: 43, y: railY - 1.5 },
    { type: 'watchtower', x: 48, y: railY + 1.5 },
    // Outpost defense revetments
    { type: 'sandbags', x: 19, y: 28 },
    { type: 'watchtower', x: 19, y: 31 },
    { type: 'barricade', x: 20, y: 28 },
    { type: 'bunker', x: 65, y: 22 },
    { type: 'ruined_tank', x: 66, y: 24 }, // Historical battle wreck near Kodiak base
    { type: 'crater_large', x: 67, y: 22 },
    { type: 'crater_small', x: 64, y: 25 },
    { type: 'tank_tracks', x: 66, y: 21 },
    { type: 'fuel_drums', x: 55, y: 64 },
    { type: 'crate_stack', x: 15, y: 25 },
    { type: 'camo_tent', x: 13, y: 25 },
    { type: 'radar_dish', x: 33, y: 13 },
  ];

  strategicProps.forEach((sp) => {
    envObjects.push({
      id: `env_${objIdCounter++}`,
      type: sp.type,
      x: sp.x,
      y: sp.y,
      scale: 1.0,
    });
  });

  return { config, terrain, bases, envObjects };
}
