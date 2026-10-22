import * as THREE from 'three';
import { Base, TerrainType } from '../types/game';

const BASE_ELEVATION: Record<TerrainType, number> = {
  deep_water: -0.75,
  water: -0.42,
  swamp: -0.1,
  marsh: -0.08,
  sand: 0.08,
  mud: 0.14,
  mud_track: 0.15,
  dirt: 0.18,
  dirt_road: 0.19,
  plains: 0.22,
  grass: 0.24,
  light_grass: 0.26,
  farmland: 0.22,
  forest_floor: 0.28,
  forest: 0.32,
  pine_forest: 0.36,
  rural_road: 0.24,
  damaged_road: 0.24,
  road: 0.25,
  highway: 0.27,
  railway: 0.26,
  bridge_road: 0.52,
  bridge_rail: 0.54,
  hills: 1.05,
  rock: 1.65,
  mountain: 2.95,
  snow: 4.35,
};

const TERRAIN_RGB: Record<TerrainType, [number, number, number]> = {
  deep_water: [0.05, 0.15, 0.28],
  water: [0.09, 0.24, 0.38],
  swamp: [0.18, 0.26, 0.17],
  marsh: [0.22, 0.32, 0.19],
  sand: [0.76, 0.67, 0.47],
  mud: [0.26, 0.19, 0.13],
  mud_track: [0.24, 0.17, 0.11],
  dirt: [0.38, 0.29, 0.2],
  dirt_road: [0.42, 0.33, 0.23],
  plains: [0.33, 0.41, 0.2],
  grass: [0.21, 0.41, 0.18],
  light_grass: [0.27, 0.48, 0.22],
  farmland: [0.37, 0.39, 0.19],
  forest_floor: [0.14, 0.26, 0.13],
  forest: [0.13, 0.25, 0.12],
  pine_forest: [0.11, 0.22, 0.13],
  rural_road: [0.2, 0.22, 0.25],
  damaged_road: [0.18, 0.2, 0.22],
  road: [0.16, 0.18, 0.21],
  highway: [0.14, 0.16, 0.19],
  railway: [0.25, 0.26, 0.28],
  bridge_road: [0.12, 0.24, 0.36],
  bridge_rail: [0.12, 0.24, 0.36],
  hills: [0.29, 0.4, 0.21],
  rock: [0.38, 0.41, 0.45],
  mountain: [0.29, 0.32, 0.36],
  snow: [0.88, 0.92, 0.96],
};

function createTerrainDetailTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(0, 0, size, size);

  // Subtle organic micro-grain for tactile soil/grass/rock variation
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 185 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(32, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWaterNormalTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#164e63';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 8) {
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.33, y - 4, size * 0.66, y + 4, size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Terrain3DSystem {
  public terrainGroup: THREE.Group = new THREE.Group();
  public groundMesh: THREE.Mesh | null = null;
  public waterMesh: THREE.Mesh | null = null;
  public transportGroup: THREE.Group = new THREE.Group();

  private gridWidth: number = 100;
  private gridHeight: number = 75;
  private heightGrid: Float32Array = new Float32Array(0);
  private subWidth: number = 200;
  private subHeight: number = 150;
  private waterTex: THREE.CanvasTexture;
  private detailTex: THREE.CanvasTexture;

  constructor() {
    this.waterTex = createWaterNormalTexture();
    this.detailTex = createTerrainDetailTexture();
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
    if (this.waterMesh) {
      this.terrainGroup.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
    }
    while (this.transportGroup.children.length > 0) {
      const child = this.transportGroup.children.pop()!;
      this.transportGroup.remove(child);
    }

    // 1. Compute smoothed heightmap at 2x resolution
    const cols = this.subWidth + 1;
    const rows = this.subHeight + 1;
    this.heightGrid = new Float32Array(cols * rows);

    const rawCellHeight = (gx: number, gz: number): number => {
      const cx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(gx)));
      const cz = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(gz)));
      const cell = terrain[cz][cx];

      // Bridge cells have river bed underneath the 3D bridge deck
      if (cell === 'bridge_road' || cell === 'bridge_rail') {
        return -0.38;
      }

      let h = BASE_ELEVATION[cell] ?? 0.22;

      // Add subtle organic rolling hill variation for natural terrain
      const wave =
        Math.sin(gx * 0.23 + gz * 0.17) * 0.06 +
        Math.cos(gx * 0.41 - gz * 0.31) * 0.04;

      if (cell === 'mountain' || cell === 'snow') {
        const ridge = Math.abs(Math.sin(gx * 0.55 + gz * 0.45)) * 0.85;
        h += ridge + wave * 2.5;
      } else if (cell === 'hills' || cell === 'rock') {
        h += Math.sin(gx * 0.35 + gz * 0.35) * 0.28 + wave;
      } else if (cell !== 'water' && cell !== 'deep_water') {
        h += wave;
      }

      return h;
    };

    // Sample and box-blur 3x3 neighborhood for smooth slopes while keeping road/base flatness
    for (let rz = 0; rz < rows; rz++) {
      const gz = (rz / this.subHeight) * this.gridHeight;
      for (let rx = 0; rx < cols; rx++) {
        const gx = (rx / this.subWidth) * this.gridWidth;

        let sum = 0;
        let weightSum = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const w = dx === 0 && dz === 0 ? 4 : 1;
            sum += rawCellHeight(gx + dx * 0.45, gz + dz * 0.45) * w;
            weightSum += w;
          }
        }
        let h = sum / weightSum;

        // Level terrain around military bases so compounds sit flush
        for (const base of bases) {
          const dist = Math.hypot(gx - base.x, gz - base.y);
          if (dist <= base.radius + 0.8) {
            h = 0.28;
            break;
          } else if (dist <= base.radius + 2.2) {
            const t = (dist - (base.radius + 0.8)) / 1.4;
            h = 0.28 * (1 - t) + h * t;
          }
        }

        this.heightGrid[rz * cols + rx] = h;
      }
    }

    // 2. Build Ground PlaneGeometry
    const geom = new THREE.PlaneGeometry(this.gridWidth, this.gridHeight, this.subWidth, this.subHeight);
    geom.rotateX(-Math.PI / 2);
    // Shift geometry so (0,0) is top-left and (gridWidth, gridHeight) is bottom-right
    geom.translate(this.gridWidth / 2, 0, this.gridHeight / 2);

    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      const rx = Math.max(0, Math.min(this.subWidth, Math.round((vx / this.gridWidth) * this.subWidth)));
      const rz = Math.max(0, Math.min(this.subHeight, Math.round((vz / this.gridHeight) * this.subHeight)));
      const vy = this.heightGrid[rz * cols + rx];
      posAttr.setY(i, vy);

      // Compute blended vertex color from terrain cell + elevation shading
      const cx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(vx)));
      const cz = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(vz)));
      const cell = terrain[cz][cx];
      const baseRgb = TERRAIN_RGB[cell] || [0.22, 0.38, 0.18];

      // Subtle noise & slope tint
      const n = (Math.sin(vx * 1.7 + vz * 2.3) * 0.5 + 0.5) * 0.05 - 0.025;
      let r = baseRgb[0] + n;
      let g = baseRgb[1] + n;
      let b = baseRgb[2] + n;

      // Snow line blending on high peaks
      if (vy > 3.4) {
        const snowBlend = Math.min(1, (vy - 3.4) / 1.1);
        r = r * (1 - snowBlend) + 0.92 * snowBlend;
        g = g * (1 - snowBlend) + 0.95 * snowBlend;
        b = b * (1 - snowBlend) + 0.98 * snowBlend;
      } else if (vy < 0.05 && vy > -0.22 && cell !== 'bridge_road' && cell !== 'bridge_rail') {
        // Wet shoreline sand margin
        r = r * 0.5 + 0.36;
        g = g * 0.5 + 0.31;
        b = b * 0.5 + 0.21;
      }

      colors[i * 3] = Math.max(0, Math.min(1, r));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.detailTex,
      roughness: 0.88,
      metalness: 0.04,
    });

    this.groundMesh = new THREE.Mesh(geom, groundMat);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.name = 'battlefield_ground';
    this.terrainGroup.add(this.groundMesh);

    // 3. Build Animated Water Plane
    const waterGeom = new THREE.PlaneGeometry(this.gridWidth, this.gridHeight, 64, 48);
    waterGeom.rotateX(-Math.PI / 2);
    waterGeom.translate(this.gridWidth / 2, -0.1, this.gridHeight / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      map: this.waterTex,
      roughness: 0.18,
      metalness: 0.65,
      transparent: true,
      opacity: 0.82,
    });

    this.waterMesh = new THREE.Mesh(waterGeom, waterMat);
    this.waterMesh.receiveShadow = true;
    this.waterMesh.name = 'battlefield_water';
    this.terrainGroup.add(this.waterMesh);

    // 4. Build 3D Roads, Highways, Bridges, and Railway Networks
    this.buildTransportNetwork(terrain);
  }

  public groundHeightAt(x: number, z: number, terrain?: TerrainType[][]): number {
    if (this.heightGrid.length === 0) return 0.24;

    // Check if on an elevated bridge cell
    if (terrain && terrain.length > 0) {
      const cx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor(x)));
      const cz = Math.max(0, Math.min(this.gridHeight - 1, Math.floor(z)));
      const cell = terrain[cz]?.[cx];
      if (cell === 'bridge_road' || cell === 'bridge_rail') {
        return 0.48;
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
      this.waterTex.offset.x = (elapsedSec * 0.03) % 1;
      this.waterTex.offset.y = (elapsedSec * 0.02) % 1;
    }
    if (this.waterMesh) {
      this.waterMesh.position.y = -0.1 + Math.sin(elapsedSec * 1.8) * 0.018;
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
            (x > 0 && (terrain[z][x - 1] === c || terrain[z][x - 1] === 'highway' || terrain[z][x - 1] === 'road' || terrain[z][x - 1] === 'railway')) ||
            (x < w - 1 && (terrain[z][x + 1] === c || terrain[z][x + 1] === 'highway' || terrain[z][x + 1] === 'road' || terrain[z][x + 1] === 'railway'));
          bridgeTiles.push({ x: x + 0.5, z: z + 0.5, type: c, horiz: hasHorizBridge || hasW || hasE });
        }
      }
    }

    const dummy = new THREE.Object3D();

    // 1. Instanced 3D Paved Road & Highway Segments with Lane Markings
    if (roadTiles.length > 0) {
      const slabGeom = new THREE.BoxGeometry(0.96, 0.05, 0.96);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x22262c,
        roughness: 0.85,
        metalness: 0.1,
      });
      const roadInst = new THREE.InstancedMesh(slabGeom, slabMat, roadTiles.length);
      roadInst.receiveShadow = true;

      const stripeGeom = new THREE.BoxGeometry(0.1, 0.055, 0.42);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.5,
      });
      const stripeInst = new THREE.InstancedMesh(stripeGeom, stripeMat, roadTiles.length);

      roadTiles.forEach((tile, i) => {
        const gy = this.groundHeightAt(tile.x, tile.z);
        const widthScale = tile.type === 'highway' ? 0.82 : tile.type === 'rural_road' ? 0.55 : 0.68;

        // Check orientation from neighbors
        const cz = Math.floor(tile.z);
        const cx = Math.floor(tile.x);
        const n = cz > 0 && this.isRoadLike(terrain[cz - 1][cx]);
        const s = cz < h - 1 && this.isRoadLike(terrain[cz + 1][cx]);
        const e = cx < w - 1 && this.isRoadLike(terrain[cz][cx + 1]);
        const west = cx > 0 && this.isRoadLike(terrain[cz][cx - 1]);
        const isEastWest = (e || west) && !(n || s);

        dummy.position.set(tile.x, gy + 0.015, tile.z);
        dummy.rotation.set(0, isEastWest ? Math.PI / 2 : 0, 0);
        dummy.scale.set(
          isEastWest ? 1.04 : widthScale,
          1,
          isEastWest ? widthScale : 1.04
        );
        dummy.updateMatrix();
        roadInst.setMatrixAt(i, dummy.matrix);

        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stripeInst.setMatrixAt(i, dummy.matrix);
      });

      roadInst.instanceMatrix.needsUpdate = true;
      roadInst.computeBoundingSphere();
      stripeInst.instanceMatrix.needsUpdate = true;
      stripeInst.computeBoundingSphere();

      this.transportGroup.add(roadInst);
      this.transportGroup.add(stripeInst);
    }

    // 2. Instanced 3D Railway Ballast, Sleepers & Dual Steel Rails
    if (railTiles.length > 0) {
      const ballastGeom = new THREE.BoxGeometry(0.62, 0.05, 1.02);
      const ballastMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.92 });
      const ballastInst = new THREE.InstancedMesh(ballastGeom, ballastMat, railTiles.length);
      ballastInst.receiveShadow = true;

      // Composite sleeper + dual rail geometry per tile
      const trackGeom = new THREE.BoxGeometry(0.46, 0.08, 1.02);
      const trackMat = new THREE.MeshStandardMaterial({
        color: 0xa1a1aa,
        metalness: 0.75,
        roughness: 0.3,
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
        dummy.scale.set(0.75, 1, 1);
        dummy.updateMatrix();
        trackInst.setMatrixAt(i, dummy.matrix);
      });

      ballastInst.instanceMatrix.needsUpdate = true;
      ballastInst.computeBoundingSphere();
      trackInst.instanceMatrix.needsUpdate = true;
      trackInst.computeBoundingSphere();

      this.transportGroup.add(ballastInst);
      this.transportGroup.add(trackInst);
    }

    // 3. 3D Elevated Road & Rail Bridges with Piers, Deck, Guardrails & Trusses
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.25 });
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const railGuardMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4, metalness: 0.6 });
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.6 });

    bridgeTiles.forEach((b) => {
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(b.x, 0.45, b.z);
      if (b.horiz) {
        bridgeGroup.rotation.y = Math.PI / 2;
      }

      // Main bridge deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.1, 1.06), deckMat);
      deck.castShadow = true;
      deck.receiveShadow = true;
      bridgeGroup.add(deck);

      // Twin support piers extending down into the riverbed
      const pierL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 8), pierMat);
      pierL.position.set(-0.34, -0.55, 0);
      bridgeGroup.add(pierL);

      const pierR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 8), pierMat);
      pierR.position.set(0.34, -0.55, 0);
      bridgeGroup.add(pierR);

      // Side safety barriers / truss girders
      const mat = b.type === 'bridge_rail' ? trussMat : railGuardMat;
      const barrierH = b.type === 'bridge_rail' ? 0.32 : 0.16;
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, barrierH, 1.06), mat);
      sideL.position.set(-0.41, barrierH / 2 + 0.04, 0);
      bridgeGroup.add(sideL);

      const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.07, barrierH, 1.06), mat);
      sideR.position.set(0.41, barrierH / 2 + 0.04, 0);
      bridgeGroup.add(sideR);

      if (b.type === 'bridge_rail') {
        // Overhead truss cross-beam
        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.06, 0.12), trussMat);
        topBeam.position.set(0, barrierH + 0.04, 0);
        bridgeGroup.add(topBeam);
      }

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
