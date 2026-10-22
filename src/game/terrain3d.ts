import * as THREE from 'three';
import { Base, TerrainType } from '../types/game';

const BASE_ELEVATION: Record<TerrainType, number> = {
  deep_water: -0.95,
  water: -0.48,
  swamp: -0.1,
  marsh: -0.06,
  sand: 0.09,
  mud: 0.14,
  mud_track: 0.16,
  dirt: 0.21,
  dirt_road: 0.22,
  plains: 0.26,
  grass: 0.28,
  light_grass: 0.32,
  farmland: 0.25,
  forest_floor: 0.36,
  forest: 0.42,
  pine_forest: 0.48,
  rural_road: 0.27,
  damaged_road: 0.27,
  road: 0.28,
  highway: 0.3,
  railway: 0.29,
  bridge_road: 0.56,
  bridge_rail: 0.58,
  hills: 1.35,
  rock: 2.15,
  mountain: 3.65,
  snow: 5.1,
};

const TERRAIN_RGB: Record<TerrainType, [number, number, number]> = {
  deep_water: [0.05, 0.14, 0.22],
  water: [0.09, 0.22, 0.31],
  swamp: [0.19, 0.27, 0.16],
  marsh: [0.23, 0.33, 0.18],
  sand: [0.68, 0.59, 0.42],
  mud: [0.28, 0.21, 0.14],
  mud_track: [0.26, 0.19, 0.13],
  dirt: [0.41, 0.32, 0.22],
  dirt_road: [0.45, 0.36, 0.25],
  plains: [0.34, 0.44, 0.21],
  grass: [0.23, 0.43, 0.18],
  light_grass: [0.29, 0.49, 0.21],
  farmland: [0.39, 0.42, 0.2],
  forest_floor: [0.15, 0.28, 0.13],
  forest: [0.14, 0.27, 0.12],
  pine_forest: [0.12, 0.24, 0.12],
  rural_road: [0.24, 0.25, 0.27],
  damaged_road: [0.22, 0.23, 0.25],
  road: [0.19, 0.2, 0.23],
  highway: [0.17, 0.18, 0.21],
  railway: [0.28, 0.27, 0.26],
  bridge_road: [0.15, 0.22, 0.28],
  bridge_rail: [0.15, 0.22, 0.28],
  hills: [0.31, 0.41, 0.21],
  rock: [0.42, 0.41, 0.39],
  mountain: [0.35, 0.35, 0.36],
  snow: [0.9, 0.93, 0.96],
};

function createTerrainDetailTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(0, 0, size, size);

  // Macro soil/meadow patches
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 24;
    const shade = Math.random() > 0.5 ? 'rgba(245,245,240,0.14)' : 'rgba(155,150,140,0.14)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine organic grass blades & stone grain
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 170 + Math.floor(Math.random() * 75);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 1.5, 2.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(38, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTerrainBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 70 + Math.floor(Math.random() * 115);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 32);
  return tex;
}

function createWaterNormalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#134e5e';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 6) {
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.25)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.28, y - 4, size * 0.72, y + 4, size, y);
    ctx.stroke();
  }

  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = 'rgba(224, 242, 254, 0.18)';
    ctx.fillRect(x, y, 5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 20);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Terrain3DSystem {
  public terrainGroup: THREE.Group = new THREE.Group();
  public groundMesh: THREE.Mesh | null = null;
  public skirtMesh: THREE.Mesh | null = null;
  public waterMesh: THREE.Mesh | null = null;
  public transportGroup: THREE.Group = new THREE.Group();

  private gridWidth: number = 100;
  private gridHeight: number = 75;
  private heightGrid: Float32Array = new Float32Array(0);
  private subWidth: number = 200;
  private subHeight: number = 150;
  private waterTex: THREE.CanvasTexture;
  private detailTex: THREE.CanvasTexture;
  private bumpTex: THREE.CanvasTexture;

  constructor() {
    this.waterTex = createWaterNormalTexture();
    this.detailTex = createTerrainDetailTexture();
    this.bumpTex = createTerrainBumpTexture();
    this.terrainGroup.add(this.transportGroup);
  }

  public buildTerrain(terrain: TerrainType[][], bases: Base[]) {
    if (!terrain || terrain.length === 0) return;

    this.gridHeight = terrain.length;
    this.gridWidth = terrain[0].length;
    this.subWidth = this.gridWidth * 2;
    this.subHeight = this.gridHeight * 2;

    // Clear previous meshes
    if (this.groundMesh) {
      this.terrainGroup.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
    }
    if (this.skirtMesh) {
      this.terrainGroup.remove(this.skirtMesh);
      this.skirtMesh.geometry.dispose();
    }
    if (this.waterMesh) {
      this.terrainGroup.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
    }
    while (this.transportGroup.children.length > 0) {
      const child = this.transportGroup.children.pop()!;
      this.transportGroup.remove(child);
    }

    // 1. Compute smoothed heightmap at 2x resolution with realistic ridges, riverbanks, and base plateaus
    const cols = this.subWidth + 1;
    const rows = this.subHeight + 1;
    this.heightGrid = new Float32Array(cols * rows);

    const rawCellHeight = (gx: number, gz: number): number => {
      const cx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(gx)));
      const cz = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(gz)));
      const cell = terrain[cz][cx];

      if (cell === 'bridge_road' || cell === 'bridge_rail') {
        return -0.42;
      }

      let h = BASE_ELEVATION[cell] ?? 0.26;

      // Multi-octave natural topographic relief
      const wave1 = Math.sin(gx * 0.19 + gz * 0.15) * 0.09 + Math.cos(gx * 0.33 - gz * 0.27) * 0.06;
      const wave2 = Math.sin(gx * 0.62 - gz * 0.48) * 0.035;

      if (cell === 'mountain' || cell === 'snow') {
        const ridge = Math.abs(Math.sin(gx * 0.48 + gz * 0.38) * Math.cos(gx * 0.25 - gz * 0.3)) * 1.35;
        h += ridge + wave1 * 2.6 + wave2 * 2.0;
      } else if (cell === 'hills' || cell === 'rock') {
        h += Math.sin(gx * 0.34 + gz * 0.29) * 0.38 + wave1 * 1.5 + wave2;
      } else if (cell === 'forest' || cell === 'pine_forest' || cell === 'forest_floor') {
        h += wave1 * 1.25 + wave2;
      } else if (cell !== 'water' && cell !== 'deep_water') {
        h += wave1 * 0.75 + wave2 * 0.5;
      }

      return h;
    };

    // Sample and smooth 3x3 neighborhood for natural rolling hills while keeping bases and highways level
    for (let rz = 0; rz < rows; rz++) {
      const gz = (rz / this.subHeight) * this.gridHeight;
      for (let rx = 0; rx < cols; rx++) {
        const gx = (rx / this.subWidth) * this.gridWidth;

        let sum = 0;
        let weightSum = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const w = dx === 0 && dz === 0 ? 4 : 1;
            sum += rawCellHeight(gx + dx * 0.42, gz + dz * 0.42) * w;
            weightSum += w;
          }
        }
        let h = sum / weightSum;

        // Level terrain around military bases so compounds sit flush on graded earth pads
        for (const base of bases) {
          const dist = Math.hypot(gx - base.x, gz - base.y);
          if (dist <= base.radius + 0.9) {
            h = 0.3;
            break;
          } else if (dist <= base.radius + 2.6) {
            const t = (dist - (base.radius + 0.9)) / 1.7;
            const smoothT = t * t * (3 - 2 * t);
            h = 0.3 * (1 - smoothT) + h * smoothT;
          }
        }

        this.heightGrid[rz * cols + rx] = h;
      }
    }

    // 2. Build Playable Ground PlaneGeometry
    const geom = new THREE.PlaneGeometry(this.gridWidth, this.gridHeight, this.subWidth, this.subHeight);
    geom.rotateX(-Math.PI / 2);
    geom.translate(this.gridWidth / 2, 0, this.gridHeight / 2);

    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const rx = Math.max(0, Math.min(this.subWidth, Math.round((vx / this.gridWidth) * this.subWidth)));
      const rz = Math.max(0, Math.min(this.subHeight, Math.round((vz / this.gridHeight) * this.subHeight)));
      posAttr.setY(i, this.heightGrid[rz * cols + rx]);
    }

    // Compute vertex normals FIRST so we can use slope steepness (normal.y) for cliff rock shading
    geom.computeVertexNormals();
    const normAttr = geom.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const ny = normAttr.getY(i);

      // Bilinear blend of neighboring cell colors to eliminate boxy tile boundaries
      const fx = Math.max(0, Math.min(this.gridWidth - 1.001, vx - 0.5));
      const fz = Math.max(0, Math.min(this.gridHeight - 1.001, vz - 0.5));
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const x1 = Math.min(this.gridWidth - 1, x0 + 1);
      const z1 = Math.min(this.gridHeight - 1, z0 + 1);
      const tx = fx - x0;
      const tz = fz - z0;

      const c00 = TERRAIN_RGB[terrain[z0][x0]] || [0.23, 0.42, 0.18];
      const c10 = TERRAIN_RGB[terrain[z0][x1]] || [0.23, 0.42, 0.18];
      const c01 = TERRAIN_RGB[terrain[z1][x0]] || [0.23, 0.42, 0.18];
      const c11 = TERRAIN_RGB[terrain[z1][x1]] || [0.23, 0.42, 0.18];

      let r = (c00[0] * (1 - tx) + c10[0] * tx) * (1 - tz) + (c01[0] * (1 - tx) + c11[0] * tx) * tz;
      let g = (c00[1] * (1 - tx) + c10[1] * tx) * (1 - tz) + (c01[1] * (1 - tx) + c11[1] * tx) * tz;
      let b = (c00[2] * (1 - tx) + c10[2] * tx) * (1 - tz) + (c01[2] * (1 - tx) + c11[2] * tx) * tz;

      // Organic micro-noise
      const n =
        Math.sin(vx * 1.4 + vz * 1.9) * 0.022 +
        Math.cos(vx * 3.1 - vz * 2.7) * 0.015;
      r += n;
      g += n;
      b += n * 0.8;

      // Slope-based cliff rock exposure on steep hillsides & ridges
      const slopeFactor = Math.max(0, Math.min(1, (0.89 - ny) / 0.26));
      if (slopeFactor > 0.01 && vy > 0.05) {
        const rockR = 0.43 + Math.sin(vy * 6.0) * 0.04;
        const rockG = 0.41 + Math.sin(vy * 6.0) * 0.04;
        const rockB = 0.38 + Math.sin(vy * 6.0) * 0.04;
        r = r * (1 - slopeFactor) + rockR * slopeFactor;
        g = g * (1 - slopeFactor) + rockG * slopeFactor;
        b = b * (1 - slopeFactor) + rockB * slopeFactor;
      }

      // High-altitude snow line & alpine scree
      const cell = terrain[Math.min(this.gridHeight - 1, Math.floor(vz))][Math.min(this.gridWidth - 1, Math.floor(vx))];
      if (vy > 3.6) {
        const snowBlend = Math.min(1, (vy - 3.6) / 1.1) * Math.max(0.25, ny);
        r = r * (1 - snowBlend) + 0.93 * snowBlend;
        g = g * (1 - snowBlend) + 0.95 * snowBlend;
        b = b * (1 - snowBlend) + 0.98 * snowBlend;
      } else if (vy < 0.14 && vy > -0.24 && cell !== 'bridge_road' && cell !== 'bridge_rail') {
        // Natural wet riverbank & shoreline transition
        const shoreBlend = Math.max(0, Math.min(1, (0.14 - vy) / 0.36));
        r = r * (1 - shoreBlend * 0.65) + 0.48 * (shoreBlend * 0.65);
        g = g * (1 - shoreBlend * 0.65) + 0.41 * (shoreBlend * 0.65);
        b = b * (1 - shoreBlend * 0.65) + 0.29 * (shoreBlend * 0.65);
      }

      colors[i * 3] = Math.max(0, Math.min(1, r));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.detailTex,
      bumpMap: this.bumpTex,
      bumpScale: 0.065,
      roughness: 0.86,
      metalness: 0.04,
    });

    this.groundMesh = new THREE.Mesh(geom, groundMat);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.name = 'battlefield_ground';
    this.terrainGroup.add(this.groundMesh);

    // 2B. Outer Valley Horizon Skirt (eliminates floating map edges in tactical low-pitch camera views)
    const skirtGeom = new THREE.PlaneGeometry(this.gridWidth + 140, this.gridHeight + 140, 48, 36);
    skirtGeom.rotateX(-Math.PI / 2);
    skirtGeom.translate(this.gridWidth / 2, -0.35, this.gridHeight / 2);
    const sPos = skirtGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sPos.count; i++) {
      const sx = sPos.getX(i);
      const sz = sPos.getZ(i);
      // Outside the playable [0..gridWidth, 0..gridHeight] bounds, sculpt rolling distant foothills
      const dx = sx < 0 ? -sx : sx > this.gridWidth ? sx - this.gridWidth : 0;
      const dz = sz < 0 ? -sz : sz > this.gridHeight ? sz - this.gridHeight : 0;
      const edgeDist = Math.hypot(dx, dz);
      if (edgeDist > 2 && sx < this.gridWidth + 5) {
        const hill =
          Math.sin(sx * 0.08 + sz * 0.07) * 1.4 +
          Math.cos(sx * 0.14 - sz * 0.11) * 0.9 +
          Math.min(5.5, edgeDist * 0.09);
        sPos.setY(i, -0.2 + Math.max(0, hill));
      } else {
        sPos.setY(i, -0.85);
      }
    }
    skirtGeom.computeVertexNormals();
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x263c24,
      map: this.detailTex,
      roughness: 0.92,
      metalness: 0.02,
    });
    this.skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
    this.skirtMesh.receiveShadow = true;
    this.terrainGroup.add(this.skirtMesh);

    // 3. Build Realistic Glistening River & Ocean Water Plane
    const waterGeom = new THREE.PlaneGeometry(this.gridWidth + 120, this.gridHeight + 120, 72, 54);
    waterGeom.rotateX(-Math.PI / 2);
    waterGeom.translate(this.gridWidth / 2, -0.09, this.gridHeight / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x16698a,
      map: this.waterTex,
      bumpMap: this.waterTex,
      bumpScale: 0.03,
      roughness: 0.14,
      metalness: 0.78,
      transparent: true,
      opacity: 0.86,
    });

    this.waterMesh = new THREE.Mesh(waterGeom, waterMat);
    this.waterMesh.receiveShadow = true;
    this.waterMesh.name = 'battlefield_water';
    this.terrainGroup.add(this.waterMesh);

    // 4. Build 3D Roads, Highways, Guardrails, Bridges, and Railway Networks
    this.buildTransportNetwork(terrain);
  }

  public groundHeightAt(x: number, z: number, terrain?: TerrainType[][]): number {
    if (this.heightGrid.length === 0) return 0.28;

    // Check if on an elevated bridge cell
    if (terrain && terrain.length > 0) {
      const cx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(x)));
      const cz = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(z)));
      const cell = terrain[cz]?.[cx];
      if (cell === 'bridge_road' || cell === 'bridge_rail') {
        return 0.52;
      }
    }

    const u = Math.max(0, Math.min(this.subWidth - 0.001, (x / this.gridWidth) * this.subWidth));
    const v = Math.max(0, Math.min(this.subHeight - 0.001, (z / this.gridHeight) * this.subHeight));

    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(this.subWidth, x0 + 1);
    const z1 = Math.min(this.subHeight, z0 + 1);

    const tx = u - x0;
    const tz = v - z0;
    const cols = this.subWidth + 1;

    const h00 = this.heightGrid[z0 * cols + x0];
    const h10 = this.heightGrid[z0 * cols + x1];
    const h01 = this.heightGrid[z1 * cols + x0];
    const h11 = this.heightGrid[z1 * cols + x1];

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  public updateWater(elapsedSec: number) {
    if (this.waterTex) {
      this.waterTex.offset.x = (elapsedSec * 0.025) % 1;
      this.waterTex.offset.y = (elapsedSec * 0.018) % 1;
    }
    if (this.waterMesh) {
      this.waterMesh.position.y = -0.09 + Math.sin(elapsedSec * 1.9) * 0.014;
    }
  }

  private buildTransportNetwork(terrain: TerrainType[][]) {
    const h = terrain.length;
    const w = terrain[0].length;

    const roadTiles: { x: number; z: number; type: TerrainType }[] = [];
    const railTiles: { x: number; z: number; type: TerrainType }[] = [];
    const bridgeTiles: { x: number; z: number; type: TerrainType; horiz: boolean }[] = [];

    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const c = terrain[z][x];
        if (c === 'highway' || c === 'road' || c === 'rural_road' || c === 'damaged_road') {
          roadTiles.push({ x: x + 0.5, z: z + 0.5, type: c });
        } else if (c === 'railway') {
          railTiles.push({ x: x + 0.5, z: z + 0.5, type: c });
        } else if (c === 'bridge_road' || c === 'bridge_rail') {
          const hasW = x > 0 && terrain[z][x - 1] !== 'water' && terrain[z][x - 1] !== 'deep_water';
          const hasE = x < w - 1 && terrain[z][x + 1] !== 'water' && terrain[z][x + 1] !== 'deep_water';
          const hasHorizBridge =
            (x > 0 &&
              (terrain[z][x - 1] === c ||
                terrain[z][x - 1] === 'highway' ||
                terrain[z][x - 1] === 'road' ||
                terrain[z][x - 1] === 'railway')) ||
            (x < w - 1 &&
              (terrain[z][x + 1] === c ||
                terrain[z][x + 1] === 'highway' ||
                terrain[z][x + 1] === 'road' ||
                terrain[z][x + 1] === 'railway'));
          bridgeTiles.push({ x: x + 0.5, z: z + 0.5, type: c, horiz: hasHorizBridge || hasW || hasE });
        }
      }
    }

    const dummy = new THREE.Object3D();

    // 1. Instanced 3D Paved Road & Highway Segments with Gravel Shoulders, Asphalt Deck, Lane Markings & Lamp Posts
    if (roadTiles.length > 0) {
      const shoulderGeom = new THREE.BoxGeometry(1.04, 0.032, 1.04);
      const shoulderMat = new THREE.MeshStandardMaterial({
        color: 0x4b463d,
        roughness: 0.92,
        metalness: 0.05,
      });
      const shoulderInst = new THREE.InstancedMesh(shoulderGeom, shoulderMat, roadTiles.length);
      shoulderInst.receiveShadow = true;

      const slabGeom = new THREE.BoxGeometry(0.96, 0.048, 0.96);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x262930,
        roughness: 0.82,
        metalness: 0.12,
      });
      const roadInst = new THREE.InstancedMesh(slabGeom, slabMat, roadTiles.length);
      roadInst.receiveShadow = true;

      const stripeGeom = new THREE.BoxGeometry(0.08, 0.054, 0.44);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.45,
      });
      const stripeInst = new THREE.InstancedMesh(stripeGeom, stripeMat, roadTiles.length);

      // Roadside utility / lamp posts every 5 tiles on highways
      const lampTiles = roadTiles.filter((t, idx) => (t.type === 'highway' || t.type === 'road') && idx % 5 === 0);
      const poleGeom = new THREE.CylinderGeometry(0.025, 0.035, 0.68, 6);
      poleGeom.translate(0, 0.34, 0);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.35 });
      const poleInst = lampTiles.length > 0 ? new THREE.InstancedMesh(poleGeom, poleMat, lampTiles.length) : null;

      roadTiles.forEach((tile, i) => {
        const gy = this.groundHeightAt(tile.x, tile.z);
        const widthScale = tile.type === 'highway' ? 0.86 : tile.type === 'rural_road' ? 0.58 : 0.72;

        const cz = Math.floor(tile.z);
        const cx = Math.floor(tile.x);
        const n = cz > 0 && this.isRoadLike(terrain[cz - 1][cx]);
        const s = cz < h - 1 && this.isRoadLike(terrain[cz + 1][cx]);
        const e = cx < w - 1 && this.isRoadLike(terrain[cz][cx + 1]);
        const west = cx > 0 && this.isRoadLike(terrain[cz][cx - 1]);
        const isEastWest = (e || west) && !(n || s);

        dummy.position.set(tile.x, gy + 0.01, tile.z);
        dummy.rotation.set(0, isEastWest ? Math.PI / 2 : 0, 0);
        dummy.scale.set(isEastWest ? 1.02 : widthScale + 0.14, 1, isEastWest ? widthScale + 0.14 : 1.02);
        dummy.updateMatrix();
        shoulderInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tile.x, gy + 0.016, tile.z);
        dummy.scale.set(isEastWest ? 1.04 : widthScale, 1, isEastWest ? widthScale : 1.04);
        dummy.updateMatrix();
        roadInst.setMatrixAt(i, dummy.matrix);

        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stripeInst.setMatrixAt(i, dummy.matrix);
      });

      if (poleInst) {
        lampTiles.forEach((tile, i) => {
          const gy = this.groundHeightAt(tile.x, tile.z);
          dummy.position.set(tile.x + 0.44, gy, tile.z - 0.44);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          poleInst.setMatrixAt(i, dummy.matrix);
        });
        poleInst.instanceMatrix.needsUpdate = true;
        poleInst.computeBoundingSphere();
        this.transportGroup.add(poleInst);
      }

      shoulderInst.instanceMatrix.needsUpdate = true;
      shoulderInst.computeBoundingSphere();
      roadInst.instanceMatrix.needsUpdate = true;
      roadInst.computeBoundingSphere();
      stripeInst.instanceMatrix.needsUpdate = true;
      stripeInst.computeBoundingSphere();

      this.transportGroup.add(shoulderInst, roadInst, stripeInst);
    }

    // 2. Instanced 3D Railway Ballast, Sleepers & Dual Steel Rails
    if (railTiles.length > 0) {
      const ballastGeom = new THREE.BoxGeometry(0.68, 0.05, 1.04);
      const ballastMat = new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.92 });
      const ballastInst = new THREE.InstancedMesh(ballastGeom, ballastMat, railTiles.length);
      ballastInst.receiveShadow = true;

      const trackGeom = new THREE.BoxGeometry(0.48, 0.08, 1.02);
      const trackMat = new THREE.MeshStandardMaterial({
        color: 0xa1a1aa,
        metalness: 0.78,
        roughness: 0.28,
      });
      const trackInst = new THREE.InstancedMesh(trackGeom, trackMat, railTiles.length);

      railTiles.forEach((tile, i) => {
        const gy = this.groundHeightAt(tile.x, tile.z);
        const cz = Math.floor(tile.z);
        const cx = Math.floor(tile.x);
        const e = cx < w - 1 && (terrain[cz][cx + 1] === 'railway' || terrain[cz][cx + 1] === 'bridge_rail');
        const west = cx > 0 && (terrain[cz][cx - 1] === 'railway' || terrain[cz][cx - 1] === 'bridge_rail');
        const isEastWest = e || west;

        dummy.position.set(tile.x, gy + 0.02, tile.z);
        dummy.rotation.set(0, isEastWest ? Math.PI / 2 : 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ballastInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tile.x, gy + 0.045, tile.z);
        dummy.scale.set(0.76, 1, 1);
        dummy.updateMatrix();
        trackInst.setMatrixAt(i, dummy.matrix);
      });

      ballastInst.instanceMatrix.needsUpdate = true;
      ballastInst.computeBoundingSphere();
      trackInst.instanceMatrix.needsUpdate = true;
      trackInst.computeBoundingSphere();

      this.transportGroup.add(ballastInst, trackInst);
    }

    // 3. 3D Elevated Military River Bridges with Concrete Piers, Steel Truss Girders & Guardrails
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.68, metalness: 0.28 });
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.82 });
    const railGuardMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.65 });
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.48, metalness: 0.6 });

    bridgeTiles.forEach((b) => {
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(b.x, 0.48, b.z);
      if (b.horiz) {
        bridgeGroup.rotation.y = Math.PI / 2;
      }

      // Main reinforced bridge deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 1.08), deckMat);
      deck.castShadow = true;
      deck.receiveShadow = true;
      bridgeGroup.add(deck);

      // Center lane stripe
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.02, 0.55),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
      );
      stripe.position.y = 0.065;
      bridgeGroup.add(stripe);

      // Twin concrete piers extending down into the riverbed
      const pierL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.25, 8), pierMat);
      pierL.position.set(-0.36, -0.62, 0);
      bridgeGroup.add(pierL);

      const pierR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.25, 8), pierMat);
      pierR.position.set(0.36, -0.62, 0);
      bridgeGroup.add(pierR);

      // Side steel truss girders & safety barriers
      const mat = b.type === 'bridge_rail' ? trussMat : railGuardMat;
      const barrierH = b.type === 'bridge_rail' ? 0.36 : 0.22;
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.08, barrierH, 1.08), mat);
      sideL.position.set(-0.43, barrierH / 2 + 0.05, 0);
      sideL.castShadow = true;
      bridgeGroup.add(sideL);

      const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.08, barrierH, 1.08), mat);
      sideR.position.set(0.43, barrierH / 2 + 0.05, 0);
      sideR.castShadow = true;
      bridgeGroup.add(sideR);

      // Overhead steel arch/truss frame
      const archBeam = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.1), mat);
      archBeam.position.set(0, barrierH + 0.06, 0);
      bridgeGroup.add(archBeam);

      this.transportGroup.add(bridgeGroup);
    });
  }

  private isRoadLike(t: TerrainType): boolean {
    return (
      t === 'highway' ||
      t === 'road' ||
      t === 'rural_road' ||
      t === 'damaged_road' ||
      t === 'bridge_road' ||
      t === 'dirt_road'
    );
  }
}
