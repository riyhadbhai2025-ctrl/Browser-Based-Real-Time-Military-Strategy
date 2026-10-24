import { EnvObjectType, TerrainType } from '../../types/game';

// AssetManager generates and caches high-definition seamless terrain textures and environment sprites
export class AssetManager {
  private static instance: AssetManager;
  private terrainCanvases: Map<TerrainType, HTMLCanvasElement> = new Map();
  private terrainPatterns: Map<string, CanvasPattern> = new Map();
  private spriteCanvases: Map<EnvObjectType | string, HTMLCanvasElement> = new Map();
  public initialized: boolean = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  public init() {
    if (this.initialized) return;
    this.generateTerrainTextures();
    this.generateEnvironmentSprites();
    
    // Load Kenney Industrial assets
    const assets = [
      { key: 'command_center', file: 'building-a' },
      { key: 'command_bunker', file: 'building-b' },
      { key: 'operations_center', file: 'building-c' },
      { key: 'comms_tower', file: 'building-d' },
      { key: 'military_gate', file: 'building-e' },
      { key: 'barracks', file: 'building-f' },
      { key: 'vehicle_factory', file: 'building-g' },
      { key: 'aviation_hangar', file: 'building-h' },
      { key: 'helicopter_hangar', file: 'building-h' },
      { key: 'naval_dockyard', file: 'building-i' },
      { key: 'rail_depot', file: 'building-j' },
      { key: 'concrete_works', file: 'building-k' },
      { key: 'steel_foundry', file: 'building-l' },
      { key: 'aluminum_smelter', file: 'building-m' },
      { key: 'fuel_refinery', file: 'building-n' },
      { key: 'storage_depot', file: 'building-o' },
      { key: 'power_station', file: 'building-p' },
      { key: 'repair_depot', file: 'building-q' },
      { key: 'logistics_center', file: 'building-r' },
      { key: 'guard_tower', file: 'building-s' },
      { key: 'mg_turret', file: 'building-t' },
      { key: 'water_tower', file: 'water-tower' },
      { key: 'windmill', file: 'windmill' },
    ];

    assets.forEach(a => this.loadExternalSprite(a.key, `/assets/building_sprites/${a.file}.png`));
    
    this.initialized = true;
  }

  // 1. Generate Seamless Procedural Canvas Textures for All Terrain Types
  private generateTerrainTextures() {
    const size = 64;

    // A. Temperate Grass (Lush Emerald Green)
    this.terrainCanvases.set('grass', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#2d5a27';
      ctx.fillRect(0, 0, size, size);

      // Micro grass blade noise
      for (let i = 0; i < 350; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const h = 2 + Math.random() * 4;
        const shade = Math.random() > 0.5 ? '#366e2e' : '#22471d';
        ctx.fillStyle = shade;
        ctx.fillRect(x, y, 1.2, h);
      }
      // Subtle clover / light blades
      for (let i = 0; i < 45; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = '#4a8d3e';
        ctx.fillRect(x, y, 2, 2);
      }
    }));

    // B. Light Grass & Open Sunlit Meadow
    this.terrainCanvases.set('light_grass', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#3c6e30';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 300; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.45 ? '#4e8b3e' : '#2f5926';
        ctx.fillRect(x, y, 1.4, 3);
      }
      // Tiny dandelion / yellow wildflower flecks
      for (let i = 0; i < 18; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }));

    // C. Plains (Golden-Green Steppe)
    this.terrainCanvases.set('plains', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#4c5c2d';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 280; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.4 ? '#5d7037' : '#3b4723';
        ctx.fillRect(x, y, 1.5, 3);
      }
      // Dry earth patches
      for (let i = 0; i < 15; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = 'rgba(120, 105, 65, 0.35)';
        ctx.beginPath();
        ctx.arc(x, y, 3 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }));

    // D. Forest Floor (Dark Green Loam & Mulch)
    this.terrainCanvases.set('forest', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#183317';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 260; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#21441f' : '#112410';
        ctx.fillRect(x, y, 2, 2.5);
      }
      // Fallen pine needles and twigs
      ctx.strokeStyle = '#3d2b17';
      ctx.lineWidth = 1;
      for (let i = 0; i < 35; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const angle = Math.random() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * 4.5, y + Math.sin(angle) * 4.5);
        ctx.stroke();
      }
    }));

    // Forest floor alias / variation
    this.terrainCanvases.set('forest_floor', this.terrainCanvases.get('forest')!);

    // E. Pine Forest Bed (Coniferous needles & moss)
    this.terrainCanvases.set('pine_forest', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#142918';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 220; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#1c3d22' : '#0e1d11';
        ctx.fillRect(x, y, 2, 2);
      }
      // Reddish pine needle mulch
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = 'rgba(92, 58, 33, 0.55)';
        ctx.fillRect(x, y, 3, 1.2);
      }
    }));

    // F. Dirt & Compacted Earth
    this.terrainCanvases.set('dirt', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#5c4833';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 300; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#6e573e' : '#453524';
        ctx.fillRect(x, y, 2, 2);
      }
      // Small pebbles
      for (let i = 0; i < 28; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = '#8a7761';
        ctx.fillRect(x, y, 2, 2);
      }
    }));

    // G. Mud & Churned Wet Ground
    this.terrainCanvases.set('mud', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#3c2b1c';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 260; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#4a3623' : '#2a1e13';
        ctx.fillRect(x, y, 2.5, 2.5);
      }
      // Water puddles in mud depressions
      ctx.fillStyle = 'rgba(28, 42, 53, 0.65)';
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.ellipse(x, y, 4 + Math.random() * 5, 2 + Math.random() * 3, Math.random(), 0, Math.PI * 2);
        ctx.fill();
      }
    }));

    // H. Sand & Dune Beach
    this.terrainCanvases.set('sand', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#cbb17b';
      ctx.fillRect(0, 0, size, size);

      // Fine sand grains
      for (let i = 0; i < 360; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#dec58e' : '#b79e68';
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      // Gentle wind dune ripple wavelets
      ctx.strokeStyle = 'rgba(238, 218, 175, 0.45)';
      ctx.lineWidth = 1.5;
      for (let y = 8; y < size; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.33, y - 2, size * 0.66, y + 2, size, y);
        ctx.stroke();
      }
    }));

    // I. Rock & Granite Bedrock
    this.terrainCanvases.set('rock', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#5a626a';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 280; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#6d7680' : '#464c53';
        ctx.fillRect(x, y, 2.5, 2.5);
      }
      // Slate crack fissures
      ctx.strokeStyle = '#2b2f34';
      ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() * 14 - 7), y + (Math.random() * 14 - 7));
        ctx.stroke();
      }
    }));

    // J. Rolling Hills (Contoured Elevation)
    this.terrainCanvases.set('hills', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#425b30';
      ctx.fillRect(0, 0, size, size);

      // Soft topographical shading curves
      ctx.fillStyle = 'rgba(40, 58, 28, 0.5)';
      ctx.beginPath();
      ctx.arc(size * 0.3, size * 0.8, size * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(84, 118, 62, 0.4)';
      ctx.beginPath();
      ctx.arc(size * 0.7, size * 0.3, size * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Grass & rock flecks
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#56753e' : '#334725';
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.8, 2);
      }
    }));

    // K. Mountain Crags & Cliffs
    this.terrainCanvases.set('mountain', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#3c434a';
      ctx.fillRect(0, 0, size, size);

      // Crags and dramatic rock face shading
      for (let i = 0; i < 240; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.4 ? '#4e565f' : '#292e33';
        ctx.fillRect(x, y, 3, 3);
      }
      // Ridge lines with illuminated crest and shadowed crevice
      ctx.strokeStyle = '#15171a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.75);
      ctx.lineTo(size * 0.4, size * 0.3);
      ctx.lineTo(size, size * 0.55);
      ctx.stroke();

      ctx.strokeStyle = '#808c99';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.72);
      ctx.lineTo(size * 0.4, size * 0.28);
      ctx.lineTo(size, size * 0.53);
      ctx.stroke();
    }));

    // L. Snow & Alpine Summit
    this.terrainCanvases.set('snow', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 220; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#cbd5e1';
        ctx.fillRect(x, y, 2, 2);
      }
      // Light blue shadow drifts
      ctx.fillStyle = 'rgba(186, 230, 253, 0.35)';
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * size, Math.random() * size, 11, 4, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }));

    // M. Shallow Coastal & River Water (Turquoise)
    this.terrainCanvases.set('water', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#0f5279';
      ctx.fillRect(0, 0, size, size);

      // Shimmering caustic water texture
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.32)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.arc(x, y, 4 + Math.random() * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }));

    // N. Deep Ocean Blue (Abyss)
    this.terrainCanvases.set('deep_water', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#082b42';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1.2;
      for (let y = 6; y < size; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.33, y - 2, size * 0.66, y + 2, size, y);
        ctx.stroke();
      }
    }));

    // O. Swamp & Peat Bog
    this.terrainCanvases.set('swamp', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#263820';
      ctx.fillRect(0, 0, size, size);

      // Murky water pools
      ctx.fillStyle = '#13281c';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 5 + Math.random() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Reeds and duckweed spots
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#3b5424' : '#1e2d14';
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 3);
      }
    }));

    // Swamp marsh alias
    this.terrainCanvases.set('marsh', this.terrainCanvases.get('swamp')!);

    // P. Farmland (Plowed Agricultural Furrows)
    this.terrainCanvases.set('farmland', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#4f3c2b';
      ctx.fillRect(0, 0, size, size);

      // Alternating plowed soil furrows
      for (let y = 0; y < size; y += 8) {
        ctx.fillStyle = '#614b35';
        ctx.fillRect(0, y, size, 4);
        ctx.fillStyle = '#392b1e';
        ctx.fillRect(0, y + 4, size, 4);

        // Young green crop sprouts along the ridges
        for (let x = 2; x < size; x += 6) {
          ctx.fillStyle = '#65a30d';
          ctx.fillRect(x, y + 1, 2, 2);
        }
      }
    }));

    // Q. Highway (Heavy Asphalt)
    this.terrainCanvases.set('highway', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#1f2328';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#2d333a' : '#15181c';
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
    }));

    // R. Standard Paved Road
    this.terrainCanvases.set('road', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#272b30';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#373d44' : '#1c1f23';
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
    }));

    // Rural Road
    this.terrainCanvases.set('rural_road', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#30343a';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#40454d' : '#22252a';
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
    }));

    // S. Dirt Road
    this.terrainCanvases.set('dirt_road', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#52412c';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#614d34' : '#423423';
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }));

    // T. Mud Track
    this.terrainCanvases.set('mud_track', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#3e2e1e';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#4f3a27' : '#2b1f14';
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }));

    // U. Damaged Frontline Road
    this.terrainCanvases.set('damaged_road', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#272b30';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#3a4048' : '#181b1e';
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
      // Cracks and pot holes
      ctx.strokeStyle = '#0f1114';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() * 12 - 6), y + (Math.random() * 12 - 6));
        ctx.stroke();
      }
    }));

    // V. Railway Track Bed
    this.terrainCanvases.set('railway', this.createTile(size, (ctx) => {
      ctx.fillStyle = '#3f4247';
      ctx.fillRect(0, 0, size, size);

      // Crushed stone ballast
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#53575d' : '#2b2d31';
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }));

    // W. Bridge Aliases
    this.terrainCanvases.set('bridge_road', this.terrainCanvases.get('road')!);
    this.terrainCanvases.set('bridge_rail', this.terrainCanvases.get('railway')!);
  }

  // 2. Generate High-Quality Environment Sprites (Offscreen Canvases)
  private generateEnvironmentSprites() {
    // A. Mature Broadleaf Oak Tree
    this.spriteCanvases.set('tree_oak', this.createTile(64, 80, (ctx) => {
      // Soft directional ground shadow (SE offset)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(38, 70, 24, 11, 0.25, 0, Math.PI * 2);
      ctx.fill();

      // Tree trunk & roots
      ctx.fillStyle = '#4a3319';
      ctx.beginPath();
      ctx.moveTo(27, 44);
      ctx.lineTo(26, 70);
      ctx.lineTo(22, 74);
      ctx.lineTo(40, 74);
      ctx.lineTo(36, 70);
      ctx.lineTo(35, 44);
      ctx.closePath();
      ctx.fill();

      // Trunk bark shadow
      ctx.fillStyle = '#2e1e0d';
      ctx.fillRect(32, 45, 3, 26);

      // Layered broadleaf crown clusters
      const foliage = [
        { cx: 31, cy: 38, r: 18, color: '#1f481c' },
        { cx: 22, cy: 30, r: 15, color: '#265722' },
        { cx: 41, cy: 30, r: 16, color: '#235220' },
        { cx: 31, cy: 22, r: 17, color: '#2f682a' },
        { cx: 27, cy: 16, r: 12, color: '#387c33' }, // Top sunlit highlight
        { cx: 36, cy: 19, r: 11, color: '#44963d' },
      ];

      foliage.forEach((f) => {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.cx, f.cy, f.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }));

    // B. Coniferous Alpine Pine Tree
    this.spriteCanvases.set('tree_pine', this.createTile(52, 78, (ctx) => {
      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(30, 68, 17, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Trunk
      ctx.fillStyle = '#3a2510';
      ctx.fillRect(24, 48, 5, 22);

      // Conical needle tiers (bottom to top)
      const tiers = [
        { yBottom: 54, yTop: 36, halfW: 21, color: '#133018' },
        { yBottom: 42, yTop: 24, halfW: 17, color: '#183c1e' },
        { yBottom: 29, yTop: 12, halfW: 13, color: '#1e4b26' },
        { yBottom: 17, yTop: 4, halfW: 8, color: '#265d30' },
      ];

      tiers.forEach((t) => {
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(26.5, t.yTop);
        ctx.lineTo(26.5 + t.halfW, t.yBottom);
        ctx.lineTo(26.5 - t.halfW, t.yBottom);
        ctx.closePath();
        ctx.fill();
      });
    }));

    // C. Slender White Birch Tree
    this.spriteCanvases.set('tree_birch', this.createTile(46, 72, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(26, 64, 15, 6, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // White birch trunk
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(21, 32, 4, 34);
      // Dark bark notches
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(21, 38, 3, 1.5);
      ctx.fillRect(22, 48, 3, 1.5);
      ctx.fillRect(21, 56, 4, 1.5);

      // Fluttering lime-green foliage
      ctx.fillStyle = '#4d7c0f';
      ctx.beginPath();
      ctx.arc(23, 24, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.arc(20, 18, 12, 0, Math.PI * 2);
      ctx.arc(26, 16, 11, 0, Math.PI * 2);
      ctx.fill();
    }));

    // D. Tall Dark Cedar / Cypress
    this.spriteCanvases.set('tree_cedar', this.createTile(44, 82, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(26, 74, 14, 6, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2a1a0c';
      ctx.fillRect(20, 58, 4, 18);

      // Slender spire canopy
      ctx.fillStyle = '#0f291e';
      ctx.beginPath();
      ctx.ellipse(22, 38, 12, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#174030';
      ctx.beginPath();
      ctx.ellipse(21, 32, 9, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }));

    // E. Dead Battlefield Tree
    this.spriteCanvases.set('tree_dead', this.createTile(46, 68, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(24, 60, 14, 5, 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#2d241e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(23, 62);
      ctx.lineTo(23, 28);
      ctx.stroke();

      // Splintered dead branches
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(23, 40);
      ctx.lineTo(12, 26);
      ctx.moveTo(23, 34);
      ctx.lineTo(34, 20);
      ctx.moveTo(23, 28);
      ctx.lineTo(21, 14);
      ctx.stroke();
    }));

    // F. Foliage Bush / Shrub
    this.spriteCanvases.set('bush', this.createTile(38, 32, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(20, 24, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#214f1d';
      ctx.beginPath();
      ctx.arc(15, 15, 10, 0, Math.PI * 2);
      ctx.arc(23, 15, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#31762c';
      ctx.beginPath();
      ctx.arc(18, 11, 8.5, 0, Math.PI * 2);
      ctx.fill();
    }));

    // G. Fern Cluster
    this.spriteCanvases.set('fern_cluster', this.createTile(34, 28, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.ellipse(17, 21, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#365314';
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(17, 22);
        ctx.quadraticCurveTo(17 + i * 4, 12, 17 + i * 6, 6 + Math.abs(i) * 2);
        ctx.stroke();
      }
    }));

    // H. Granite Boulder
    this.spriteCanvases.set('boulder', this.createTile(42, 34, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(23, 24, 15, 7, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Shaded faceted rock
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(9, 25);
      ctx.lineTo(7, 14);
      ctx.lineTo(16, 7);
      ctx.lineTo(29, 8);
      ctx.lineTo(34, 18);
      ctx.lineTo(30, 25);
      ctx.closePath();
      ctx.fill();

      // Top sun highlight facet
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(16, 7);
      ctx.lineTo(29, 8);
      ctx.lineTo(25, 16);
      ctx.lineTo(13, 14);
      ctx.closePath();
      ctx.fill();
    }));

    // I. Cliff Rock Outcrop
    this.spriteCanvases.set('cliff_rock', this.createTile(48, 40, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(26, 32, 18, 7, 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(6, 33);
      ctx.lineTo(8, 16);
      ctx.lineTo(22, 6);
      ctx.lineTo(38, 8);
      ctx.lineTo(44, 22);
      ctx.lineTo(40, 33);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(22, 6);
      ctx.lineTo(38, 8);
      ctx.lineTo(32, 19);
      ctx.lineTo(16, 17);
      ctx.closePath();
      ctx.fill();
    }));

    // J. Fallen Log
    this.spriteCanvases.set('fallen_log', this.createTile(52, 26, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(8, 13, 38, 8);

      ctx.fillStyle = '#452b14';
      ctx.fillRect(6, 8, 38, 8);
      // Moss patch
      ctx.fillStyle = '#365314';
      ctx.fillRect(14, 7, 13, 3.5);
      // Cut rings on end
      ctx.fillStyle = '#855628';
      ctx.beginPath();
      ctx.ellipse(44, 12, 3.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }));

    // K. Concrete Military Bunker
    this.spriteCanvases.set('bunker', this.createTile(56, 48, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(6, 34, 46, 11);

      // Heavy concrete pillbox walls
      ctx.fillStyle = '#334155';
      ctx.fillRect(7, 13, 42, 25);

      // Angled reinforced roof
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(4, 15);
      ctx.lineTo(13, 6);
      ctx.lineTo(43, 6);
      ctx.lineTo(52, 15);
      ctx.closePath();
      ctx.fill();

      // Armored observation / gun slit
      ctx.fillStyle = '#020617';
      ctx.fillRect(14, 20, 28, 4.5);

      // Warning hazard stripes along bottom
      ctx.fillStyle = '#eab308';
      ctx.fillRect(10, 32, 6, 3.5);
      ctx.fillRect(23, 32, 6, 3.5);
      ctx.fillRect(36, 32, 6, 3.5);
    }));

    // L. Watchtower
    this.spriteCanvases.set('watchtower', this.createTile(44, 68, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(22, 61, 15, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Leg struts with cross bracing
      ctx.strokeStyle = '#573d23';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(11, 61);
      ctx.lineTo(16, 25);
      ctx.moveTo(33, 61);
      ctx.lineTo(28, 25);
      ctx.stroke();

      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, 50);
      ctx.lineTo(31, 38);
      ctx.moveTo(32, 50);
      ctx.lineTo(13, 38);
      ctx.stroke();

      // Guard cabin & railing
      ctx.fillStyle = '#3a2512';
      ctx.fillRect(12, 15, 20, 13);
      // Roof canopy
      ctx.fillStyle = '#603c1d';
      ctx.beginPath();
      ctx.moveTo(8, 15);
      ctx.lineTo(22, 5);
      ctx.lineTo(36, 15);
      ctx.closePath();
      ctx.fill();

      // Searchlight reflector
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(22, 21, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }));

    // M. Sandbags
    this.spriteCanvases.set('sandbags', this.createTile(48, 28, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(4, 18, 40, 7);

      const bags = [
        { x: 5, y: 13, w: 10, h: 6 },
        { x: 15, y: 13, w: 10, h: 6 },
        { x: 25, y: 13, w: 10, h: 6 },
        { x: 35, y: 13, w: 9, h: 6 },
        { x: 10, y: 8, w: 10, h: 6 },
        { x: 20, y: 8, w: 10, h: 6 },
        { x: 30, y: 8, w: 10, h: 6 },
      ];

      bags.forEach((b) => {
        ctx.fillStyle = '#786b51';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#574d39';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      });
    }));

    // N. Barricade (Czech Hedgehogs)
    this.spriteCanvases.set('barricade', this.createTile(40, 34, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(20, 26, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, 25);
      ctx.lineTo(30, 7);
      ctx.moveTo(30, 25);
      ctx.lineTo(10, 7);
      ctx.stroke();

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, 27);
      ctx.lineTo(20, 5);
      ctx.stroke();
    }));

    // O. Ruined Tank Chassis
    this.spriteCanvases.set('ruined_tank', this.createTile(58, 46, (ctx) => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.beginPath();
      ctx.ellipse(29, 26, 24, 13, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Damaged hull
      ctx.fillStyle = '#334155';
      ctx.fillRect(12, 15, 32, 19);
      // Burnt orange rust patches
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(16, 18, 11, 8);
      // Broken track
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 11, 38, 4.5);
      ctx.fillRect(10, 32, 32, 4.5);
      // Dislodged skewed turret
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(29, 23, 9.5, 0, Math.PI * 2);
      ctx.fill();
      // Bent gun barrel
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(34, 23);
      ctx.lineTo(50, 27);
      ctx.stroke();
    }));

    // P. Ammo / Supply Crate Stack
    this.spriteCanvases.set('crate_stack', this.createTile(42, 34, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(6, 22, 30, 8);

      ctx.fillStyle = '#59442b';
      ctx.fillRect(7, 12, 14, 12);
      ctx.fillRect(22, 12, 14, 12);
      ctx.fillRect(14, 4, 14, 11);

      ctx.strokeStyle = '#382a1a';
      ctx.lineWidth = 1;
      ctx.strokeRect(7, 12, 14, 12);
      ctx.strokeRect(22, 12, 14, 12);
      ctx.strokeRect(14, 4, 14, 11);
    }));

    // Q. Fuel Drums
    this.spriteCanvases.set('fuel_drums', this.createTile(42, 32, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(6, 20, 30, 8);

      const drums = [
        { x: 8, y: 10, color: '#dc2626' },
        { x: 19, y: 8, color: '#2563eb' },
        { x: 28, y: 11, color: '#dc2626' },
      ];

      drums.forEach((d) => {
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, 8, 14);
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.ellipse(d.x + 4, d.y, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(d.x, d.y + 6, 8, 1.5);
      });
    }));

    // R. Camouflage Command Tent
    this.spriteCanvases.set('camo_tent', this.createTile(56, 44, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(6, 30, 44, 9);

      // Tent frame
      ctx.fillStyle = '#3f4f34';
      ctx.beginPath();
      ctx.moveTo(8, 30);
      ctx.lineTo(28, 8);
      ctx.lineTo(48, 30);
      ctx.closePath();
      ctx.fill();

      // Camo patches
      ctx.fillStyle = '#283618';
      ctx.fillRect(18, 16, 8, 6);
      ctx.fillStyle = '#606c38';
      ctx.fillRect(28, 20, 10, 5);

      // Tent flap
      ctx.fillStyle = '#1b2612';
      ctx.beginPath();
      ctx.moveTo(28, 8);
      ctx.lineTo(24, 30);
      ctx.lineTo(32, 30);
      ctx.closePath();
      ctx.fill();
    }));

    // Field tent alias
    this.spriteCanvases.set('field_tent', this.spriteCanvases.get('camo_tent')!);

    // S. Radar Dish
    this.spriteCanvases.set('radar_dish', this.createTile(46, 48, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(23, 40, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Base mount
      ctx.fillStyle = '#475569';
      ctx.fillRect(19, 28, 8, 12);

      // Parabolic dish
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(23, 20, 14, Math.PI * 0.2, Math.PI * 0.8, false);
      ctx.stroke();

      // Center feed horn
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(23, 14, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }));

    // T. Artillery Craters
    this.spriteCanvases.set('crater_small', this.createTile(40, 32, (ctx) => {
      // Scorched blast soot
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.ellipse(20, 16, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Raised rim
      ctx.fillStyle = '#5c4833';
      ctx.beginPath();
      ctx.ellipse(20, 16, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep crater bowl
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.ellipse(20, 16, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }));

    this.spriteCanvases.set('crater_large', this.createTile(60, 48, (ctx) => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.ellipse(30, 24, 25, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4a3724';
      ctx.beginPath();
      ctx.ellipse(30, 24, 18, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0c0a09';
      ctx.beginPath();
      ctx.ellipse(30, 24, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }));

    // U. Tank Tread Marks
    this.spriteCanvases.set('tank_tracks', this.createTile(46, 46, (ctx) => {
      ctx.fillStyle = 'rgba(40, 30, 20, 0.45)';
      // Left tread
      ctx.fillRect(10, 4, 6, 38);
      // Right tread
      ctx.fillRect(30, 4, 6, 38);

      // Tread notches
      ctx.fillStyle = 'rgba(15, 10, 5, 0.35)';
      for (let y = 6; y < 42; y += 5) {
        ctx.fillRect(10, y, 6, 2);
        ctx.fillRect(30, y, 6, 2);
      }
    }));

    // =========================================================================
    // 3. MILITARY BASE BUILDINGS & FACILITIES
    // =========================================================================

    // A. Base Headquarters (HQ) - Re-engineered for 3D Depth
    this.spriteCanvases.set('command_center', this.createTile(100, 100, (ctx) => {
      // 1. Foundation Slab (Concrete with edge highlights)
      ctx.fillStyle = '#2d2d2d';
      ctx.fillRect(10, 60, 80, 30);
      ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 1.5; ctx.strokeRect(10, 60, 80, 30);

      // 2. Main Building Body (Simulated Isometric Depth)
      const gradFront = ctx.createLinearGradient(20, 20, 20, 75);
      gradFront.addColorStop(0, '#334155'); gradFront.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradFront;
      ctx.fillRect(20, 25, 60, 50);

      // 3. Side Recesses (Gives volume)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(18, 30, 2, 40);
      ctx.fillRect(80, 30, 2, 40);

      // 4. Multi-tier Roof (Metallic)
      const gradRoof = ctx.createLinearGradient(15, 15, 15, 30);
      gradRoof.addColorStop(0, '#64748b'); gradRoof.addColorStop(1, '#334155');
      ctx.fillStyle = gradRoof;
      ctx.fillRect(15, 20, 70, 10);
      ctx.fillRect(30, 10, 40, 10);

      // 5. Communications Array
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(35, 10); ctx.lineTo(35, -5);
      ctx.moveTo(32, 2); ctx.lineTo(38, 2);
      ctx.stroke();

      // Satellite Dish
      ctx.fillStyle = '#cbd5e0';
      ctx.beginPath(); ctx.ellipse(65, 10, 12, 6, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a5568'; ctx.stroke();

      // 6. Windows (Glowing)
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = '#020617';
        ctx.fillRect(28 + i * 12, 40, 8, 6);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fillRect(29 + i * 12, 41, 6, 4);
      }

      // 7. Industrial Weathering
      ctx.fillStyle = 'rgba(67, 20, 7, 0.15)';
      ctx.fillRect(20, 70, 60, 5);
    }));

    // B. Command Bunker (Heavy Fortified)
    this.spriteCanvases.set('command_bunker', this.createTile(80, 70, (ctx) => {
      // Sloped Concrete Walls (Simulated Depth)
      const grad = ctx.createLinearGradient(0, 0, 0, 70);
      grad.addColorStop(0, '#475569'); grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(5, 60); ctx.lineTo(75, 60); ctx.lineTo(65, 20); ctx.lineTo(15, 20);
      ctx.closePath(); ctx.fill();

      // Blast Slit with Red Glow
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.fillRect(25, 35, 30, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(25, 36, 30, 2);

      // Steel Blast Doors
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(35, 50, 10, 10);
      ctx.strokeStyle = '#94a3b8'; ctx.strokeRect(35, 50, 10, 10);
      
      // Ventilation pipes
      ctx.fillStyle = '#475569';
      ctx.fillRect(15, 10, 4, 10);
      ctx.fillRect(53, 10, 4, 10);
    }));

    // C. Operations Center (Tactical Intelligence Hub)
    this.spriteCanvases.set('operations_center', this.createTile(90, 90, (ctx) => {
      // Concrete Compound Base
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 40, 70, 40);
      
      // Main Building with Angled Roof
      const gradRoof = ctx.createLinearGradient(0, 20, 0, 40);
      gradRoof.addColorStop(0, '#475569'); gradRoof.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradRoof;
      ctx.beginPath();
      ctx.moveTo(15, 45); ctx.lineTo(75, 45); ctx.lineTo(65, 20); ctx.lineTo(25, 20);
      ctx.closePath(); ctx.fill();

      // Tactical Screens (Green Glow)
      ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
      ctx.fillRect(35, 50, 20, 15);
      ctx.fillStyle = '#052e16';
      ctx.fillRect(36, 51, 18, 13);

      // Rotating Radar (Handled by renderer animation, but base part here)
      ctx.fillStyle = '#334155';
      ctx.fillRect(40, 15, 10, 10);
    }));

    // D. Communications Tower (High Gain Array)
    this.spriteCanvases.set('comms_tower', this.createTile(40, 120, (ctx) => {
      // Lattice Mast (Steel)
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(15, 115); ctx.lineTo(20, 10); ctx.lineTo(25, 115);
      ctx.stroke();
      
      // Cross Braces
      for (let y = 20; y < 110; y += 15) {
        ctx.beginPath();
        const w = (115 - y) * 0.05;
        ctx.moveTo(15 + w, y); ctx.lineTo(25 - w, y);
        ctx.stroke();
      }

      // Antenna Panels
      ctx.fillStyle = '#cbd5e0';
      ctx.fillRect(12, 30, 4, 12);
      ctx.fillRect(24, 45, 4, 12);
      
      // Obstruction Beacon
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(20, 10, 3, 0, Math.PI * 2); ctx.fill();
    }));

    // E. Military Gate (Fortified Entry)
    this.spriteCanvases.set('military_gate', this.createTile(100, 60, (ctx) => {
      // Left Guard House
      ctx.fillStyle = '#334155';
      ctx.fillRect(5, 10, 20, 40);
      // Right Guard House
      ctx.fillRect(75, 10, 20, 40);
      
      // Gate Arch (Steel Beam)
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(25, 15, 50, 6);
      
      // Barrier Arm (Caution Stripes)
      ctx.fillStyle = '#eab308';
      ctx.fillRect(25, 45, 50, 4);
      ctx.fillStyle = '#000';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(30 + i * 8, 45, 4, 4);
      }

      // Searchlights
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(20, 12, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(80, 12, 3, 0, Math.PI * 2); ctx.fill();
    }));

    // F. Barracks
    this.spriteCanvases.set('barracks', this.createTile(80, 60, (ctx) => {
      ctx.fillStyle = '#4a5568';
      // Dual long buildings
      ctx.fillRect(10, 10, 60, 18);
      ctx.fillRect(10, 35, 60, 18);
      // Windows
      ctx.fillStyle = '#1a202c';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(15 + i * 10, 14, 4, 4);
        ctx.fillRect(15 + i * 10, 39, 4, 4);
      }
    }));

    // G. Vehicle Factory (Industrial Scale)
    this.spriteCanvases.set('vehicle_factory', this.createTile(110, 100, (ctx) => {
      // Main Hangar Block
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 30, 90, 60);
      
      // Roof (Metallic with weathering)
      const gradRoof = ctx.createLinearGradient(0, 10, 0, 30);
      gradRoof.addColorStop(0, '#475569'); gradRoof.addColorStop(1, '#334155');
      ctx.fillStyle = gradRoof;
      ctx.fillRect(5, 15, 100, 15);

      // Roll-up Industrial Doors
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(25, 50, 25, 40);
      ctx.fillRect(60, 50, 25, 40);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
      for (let y = 54; y < 90; y += 4) {
        ctx.beginPath(); ctx.moveTo(25, y); ctx.lineTo(50, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(85, y); ctx.stroke();
      }

      // Smokestacks
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(85, 5, 8, 25);
      ctx.fillStyle = '#475569';
      ctx.fillRect(85, 5, 8, 4);
    }));

    // H. Aircraft Hangar
    this.spriteCanvases.set('aviation_hangar', this.createTile(100, 80, (ctx) => {
      // Curved Roof
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(50, 60, 45, 50, 0, Math.PI, 0);
      ctx.fill();
      // Facade
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 60, 90, 15);
      // Sliding Doors
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(15, 40, 30, 35);
      ctx.fillRect(55, 40, 30, 35);
      // Hazard markings
      ctx.fillStyle = '#eab308';
      ctx.fillRect(5, 75, 90, 3);
    }));

    // H2. Helicopter Rotorcraft Hangar & Helipad Bay
    this.spriteCanvases.set('helicopter_hangar', this.createTile(100, 80, (ctx) => {
      // Twin Rotorcraft Maintenance Hangars
      ctx.fillStyle = '#334155';
      ctx.fillRect(8, 22, 38, 38);
      ctx.fillRect(54, 22, 38, 38);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(14, 34, 26, 26);
      ctx.fillRect(60, 34, 26, 26);
      // Helipad Circle & H Marking in Foreground
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(50, 66, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(46, 61, 2, 10);
      ctx.fillRect(52, 61, 2, 10);
      ctx.fillRect(46, 65, 8, 2);
    }));

    // I. Naval Shipyard
    this.spriteCanvases.set('naval_dockyard', this.createTile(110, 100, (ctx) => {
      // Concrete Quays
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 40, 20, 50);
      ctx.fillRect(80, 40, 20, 50);
      // Connecting bridge
      ctx.fillRect(30, 45, 50, 10);
      // Crane
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, 40); ctx.lineTo(20, 10); ctx.lineTo(50, 10);
      ctx.stroke();
      // Hook
      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, 25); ctx.stroke();
    }));

    // J. Rail Depot
    this.spriteCanvases.set('rail_depot', this.createTile(90, 90, (ctx) => {
      // Tracks
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(20, 5, 6, 80);
      ctx.fillRect(64, 5, 6, 80);
      // Service bay
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 30, 70, 30);
      // Gantry
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(10, 30, 70, 30);
    }));

    // K. Concrete Processing Plant
    this.spriteCanvases.set('concrete_works', this.createTile(80, 80, (ctx) => {
      // Main structure
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(20, 30, 40, 40);
      // Cylindrical silos
      ctx.fillStyle = '#cbd5e0';
      ctx.fillRect(10, 10, 12, 60);
      ctx.fillRect(58, 10, 12, 60);
      // Silo tops (conical)
      ctx.beginPath();
      ctx.moveTo(10, 10); ctx.lineTo(22, 10); ctx.lineTo(16, 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(58, 10); ctx.lineTo(70, 10); ctx.lineTo(64, 2); ctx.fill();
      // Conveyor
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(22, 40); ctx.lineTo(58, 20); ctx.stroke();
    }));

    // L. Industrial Steel Works
    this.spriteCanvases.set('steel_foundry', this.createTile(84, 84, (ctx) => {
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(10, 30, 64, 50);
      // Blast Furnace Stacks
      ctx.fillStyle = '#1a202c';
      ctx.fillRect(20, 5, 8, 30);
      ctx.fillRect(50, 5, 8, 30);
      // Orange glow from vents
      ctx.fillStyle = 'rgba(251, 146, 60, 0.6)';
      ctx.fillRect(20, 45, 44, 4);
    }));

    // M. Aluminum Smelter Facility
    this.spriteCanvases.set('aluminum_smelter', this.createTile(80, 72, (ctx) => {
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(10, 20, 60, 45);
      // Metallic piping
      ctx.strokeStyle = '#cbd5e0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(15, 20); ctx.lineTo(15, 5); ctx.lineTo(65, 5); ctx.lineTo(65, 20);
      ctx.stroke();
      // Cooling towers
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(30, 10, 8, 10);
      ctx.fillRect(45, 10, 8, 10);
    }));

    // N. Strategic Fuel Depot
    this.spriteCanvases.set('fuel_refinery', this.createTile(80, 80, (ctx) => {
      // Large Storage Tanks
      ctx.fillStyle = '#cbd5e0';
      ctx.beginPath(); ctx.arc(25, 40, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(55, 55, 15, 0, Math.PI * 2); ctx.fill();
      // Pipe network
      ctx.strokeStyle = '#4a5568';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(25, 40); ctx.lineTo(55, 55); ctx.stroke();
      // Hazard symbols (small red dots)
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(23, 38, 4, 4);
      ctx.fillRect(53, 53, 4, 4);
    }));

    // O. Resource Storage Warehouse
    this.spriteCanvases.set('storage_depot', this.createTile(90, 70, (ctx) => {
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(10, 15, 70, 45);
      // Roof ridges
      ctx.strokeStyle = '#4a5568';
      for (let x = 15; x < 80; x += 10) {
        ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x, 60); ctx.stroke();
      }
      // Loading bays
      ctx.fillStyle = '#000';
      ctx.fillRect(20, 50, 12, 10);
      ctx.fillRect(40, 50, 12, 10);
      ctx.fillRect(60, 50, 12, 10);
    }));

    // P. Power Generation Station
    this.spriteCanvases.set('power_station', this.createTile(76, 76, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(15, 30, 45, 35);
      // Transformers
      ctx.fillStyle = '#475569';
      ctx.fillRect(15, 45, 10, 20);
      ctx.fillRect(35, 45, 10, 20);
      // High voltage poles
      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(60, 65); ctx.lineTo(60, 10);
      ctx.moveTo(55, 20); ctx.lineTo(65, 20);
      ctx.stroke();
      // Blue electrical sparks (subtle)
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(60, 10, 2, 0, Math.PI * 2); ctx.fill();
    }));

    // Q. Maintenance & Repair Depot
    this.spriteCanvases.set('repair_depot', this.createTile(84, 80, (ctx) => {
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(10, 25, 64, 45);
      // Repair bays
      ctx.fillStyle = '#1a202c';
      ctx.fillRect(15, 50, 15, 20);
      ctx.fillRect(45, 50, 15, 20);
      // Tools / Parts crates
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(65, 55, 8, 8);
      ctx.fillRect(68, 48, 6, 6);
    }));

    // R. Forward Logistics Center
    this.spriteCanvases.set('logistics_center', this.createTile(88, 70, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 20, 68, 40);
      // Parked Logistics Trucks (simple blocks)
      ctx.fillStyle = '#475569';
      ctx.fillRect(15, 50, 8, 15);
      ctx.fillRect(30, 50, 8, 15);
      ctx.fillRect(45, 50, 8, 15);
      // Crate stacks
      ctx.fillStyle = '#d97706';
      for (let i = 0; i < 3; i++) ctx.fillRect(65, 50 - i * 6, 10, 5);
    }));

    // S. Guard Tower (Elevated Observation)
    this.spriteCanvases.set('guard_tower', this.createTile(50, 90, (ctx) => {
      // Steel Legs (Truss structure)
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 85); ctx.lineTo(18, 40);
      ctx.moveTo(40, 85); ctx.lineTo(30, 40);
      ctx.stroke();
      // Cross braces
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(15, 70); ctx.lineTo(35, 70);
      ctx.moveTo(18, 55); ctx.lineTo(32, 55);
      ctx.stroke();

      // Observation Cabin
      const gradCabin = ctx.createLinearGradient(15, 15, 15, 40);
      gradCabin.addColorStop(0, '#475569'); gradCabin.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradCabin;
      ctx.fillRect(15, 15, 20, 25);
      
      // Armored Glass (Glow)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.fillRect(18, 20, 14, 8);

      // Searchlight (Rotating)
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(25, 15, 4, 0, Math.PI * 2); ctx.fill();
    }));

    // Z. Perimeter Wall (Heavy Concrete)
    this.spriteCanvases.set('perimeter_wall', this.createTile(64, 48, (ctx) => {
      // Foundation shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 35, 64, 10);

      // Main Concrete Block
      const grad = ctx.createLinearGradient(0, 10, 0, 40);
      grad.addColorStop(0, '#94a3b8'); grad.addColorStop(1, '#475569');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 15, 64, 25);

      // Steel Support Pillars
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 15, 6, 25);
      ctx.fillRect(29, 15, 6, 25);
      ctx.fillRect(58, 15, 6, 25);

      // Razor Wire (Coiled)
      ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = 1;
      for (let x = 8; x < 64; x += 12) {
        ctx.beginPath(); ctx.arc(x, 15, 6, 0, Math.PI * 2); ctx.stroke();
      }
    }));

    // T. Machine-Gun Emplacement
    this.spriteCanvases.set('mg_turret', this.createTile(48, 48, (ctx) => {
      // Sandbag ring
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#78716c';
      ctx.stroke();
      // MG Core
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(18, 18, 12, 12);
      // Barrel
      ctx.fillRect(30, 22, 14, 4);
    }));

    // U. Vulcan Anti-Aircraft Turret
    this.spriteCanvases.set('vulcan_turret', this.createTile(56, 56, (ctx) => {
      // Reinforced Base
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 35, 36, 15);
      // Turret Hub
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(28, 28, 16, 0, Math.PI * 2); ctx.fill();
      // Quad Barrels
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(35, 20, 15, 3);
      ctx.fillRect(35, 25, 15, 3);
      ctx.fillRect(35, 30, 15, 3);
      ctx.fillRect(35, 35, 15, 3);
    }));

    // V. SAM Missile Battery
    this.spriteCanvases.set('sam_launcher', this.createTile(64, 60, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(12, 40, 40, 15);
      // Launch Rails
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, 40); ctx.lineTo(45, 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(35, 40); ctx.lineTo(60, 15); ctx.stroke();
      // Missiles (White tipped)
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(38, 18, 10, 4);
      ctx.fillRect(53, 18, 10, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(46, 18, 2, 4);
      ctx.fillRect(61, 18, 2, 4);
    }));

    // W. Coastal Defense Battery
    this.spriteCanvases.set('coastal_battery', this.createTile(80, 64, (ctx) => {
      // Heavy Emplacement
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 30, 60, 25);
      // Circular turret
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(40, 35, 20, 0, Math.PI * 2); ctx.fill();
      // Long Range Cannon
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(40, 32, 35, 6);
    }));

    // X. Fixed Artillery Emplacement
    this.spriteCanvases.set('artillery_post', this.createTile(72, 60, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 40, 52, 12);
      // Recoil mechanism base
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(20, 25, 32, 15);
      // Big barrel
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(36, 30); ctx.lineTo(36, 5); ctx.lineTo(44, 5); ctx.lineTo(44, 30);
      ctx.closePath(); ctx.fill();
    }));

    // Y. Heavy Fortified Bunker
    this.spriteCanvases.set('fortified_bunker', this.createTile(80, 60, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(5, 35, 70, 15);
      // Multi-layer concrete
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 15, 60, 30);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(25, 20, 30, 20);
      // Metal doors
      ctx.fillStyle = '#475569';
      ctx.fillRect(35, 30, 10, 15);
    }));

    // Z. Perimeter Defense
    this.spriteCanvases.set('perimeter_wall', this.createTile(64, 32, (ctx) => {
      // Concrete wall section
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 12, 64, 12);
      // Top razor wire loop
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      for (let x = 4; x < 64; x += 8) {
        ctx.beginPath(); ctx.arc(x, 12, 4, 0, Math.PI * 2); ctx.stroke();
      }
    }));

    // AA. Dedicated Radar Station
    this.spriteCanvases.set('radar_station', this.createTile(80, 80, (ctx) => {
      // Base
      ctx.fillStyle = '#334155';
      ctx.fillRect(20, 45, 40, 25);
      // Support mast
      ctx.fillStyle = '#475569';
      ctx.fillRect(36, 15, 8, 30);
      // Rotating base (static part)
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(40, 15, 12, 0, Math.PI * 2); ctx.fill();
    }));
  }

  private createTile(w: number, hOrFn: number | ((ctx: CanvasRenderingContext2D) => void), fn?: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const height = typeof hOrFn === 'number' ? hOrFn : w;
    const renderFn = typeof hOrFn === 'function' ? hOrFn : fn!;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderFn(ctx);
    }
    return canvas;
  }

  // 4. Load External Image-Based Sprites
  private loadExternalSprite(key: string, url: string) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        this.spriteCanvases.set(key, canvas);
      }
    };
    img.src = url;
  }

  // Retrieve cached pattern for a given canvas context
  public getTerrainPattern(ctx: CanvasRenderingContext2D, terrain: TerrainType): CanvasPattern | null {
    const key = `${terrain}`;
    if (!this.terrainPatterns.has(key)) {
      const tileCanvas = this.terrainCanvases.get(terrain);
      if (tileCanvas) {
        const pattern = ctx.createPattern(tileCanvas, 'repeat');
        if (pattern) {
          this.terrainPatterns.set(key, pattern);
        }
      }
    }
    return this.terrainPatterns.get(key) || null;
  }

  // Retrieve underlying tile canvas
  public getTerrainCanvas(terrain: TerrainType): HTMLCanvasElement | undefined {
    return this.terrainCanvases.get(terrain);
  }

  // Retrieve sprite canvas for an environment object
  public getSpriteCanvas(type: EnvObjectType | string): HTMLCanvasElement | undefined {
    return this.spriteCanvases.get(type);
  }

  // Standard fallback color representation for minimap
  public getTerrainColor(terrain: TerrainType): string {
    switch (terrain) {
      case 'deep_water':
        return '#082b42';
      case 'water':
        return '#0f5279';
      case 'swamp':
      case 'marsh':
        return '#263820';
      case 'sand':
        return '#cbb17b';
      case 'grass':
        return '#2d5a27';
      case 'light_grass':
        return '#3c6e30';
      case 'plains':
        return '#4c5c2d';
      case 'forest':
      case 'forest_floor':
        return '#183317';
      case 'pine_forest':
        return '#142918';
      case 'farmland':
        return '#4f3c2b';
      case 'dirt':
        return '#5c4833';
      case 'mud':
        return '#3c2b1c';
      case 'hills':
        return '#425b30';
      case 'rock':
        return '#5a626a';
      case 'mountain':
        return '#3c434a';
      case 'snow':
        return '#e2e8f0';
      case 'highway':
        return '#1f2328';
      case 'road':
      case 'bridge_road':
        return '#272b30';
      case 'rural_road':
        return '#30343a';
      case 'dirt_road':
        return '#52412c';
      case 'mud_track':
        return '#3e2e1e';
      case 'damaged_road':
        return '#272b30';
      case 'railway':
      case 'bridge_rail':
        return '#3f4247';
      default:
        return '#2d5a27';
    }
  }
}

export const assetManager = AssetManager.getInstance();
