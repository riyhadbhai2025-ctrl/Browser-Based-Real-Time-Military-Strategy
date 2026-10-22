import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AtmospherePreset,
  Base,
  BuildingType,
  CombatEvent,
  EnvironmentObject,
  GraphicsQuality,
  TerrainType,
  Unit,
  UnitType,
} from '../types/game';
import { assetManager } from './assets/assetManager';
import { BUILDING_CATALOG, UNIT_CATALOG } from './catalog';
import { generateWorld } from './mapGenerator';
import { Models3DRegistry } from './models3d';
import { Terrain3DSystem } from './terrain3d';

export interface Projectile3D {
  id: string;
  mesh: THREE.Object3D;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTime: number;
  durationMs: number;
  arcHeight: number;
  isMissile: boolean;
}

export interface Explosion3D {
  id: string;
  group: THREE.Group;
  fireball: THREE.Mesh;
  shockwave: THREE.Mesh;
  smokePuffs: { mesh: THREE.Mesh; vx: number; vy: number; vz: number }[];
  startTime: number;
  durationMs: number;
  maxRadius: number;
}

export interface DustPlume3D {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  startTime: number;
  durationMs: number;
  startScale: number;
}

export interface FloatingDamageText {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  startTime: number;
  durationMs: number;
}

export interface PlacementGhostState {
  baseId: string;
  buildingType: BuildingType;
  worldX: number;
  worldY: number;
  isValid: boolean;
  reason?: string;
}

interface UnitRenderState {
  group: THREE.Group;
  selectionRing: THREE.Mesh;
  rangeRing: THREE.Line;
  muzzleFlash: THREE.Mesh;
  waypointLine: THREE.Line | null;
  waypointMarker: THREE.Mesh;
  displayX: number;
  displayZ: number;
  displayRot: number;
  turretRot: number;
  lastFireMs: number;
  lastDustMs: number;
  teamColorHex: number;
  type: UnitType;
}

interface BaseRenderState {
  group: THREE.Group;
  shieldMesh: THREE.Mesh;
  selectionRing: THREE.Mesh;
  signature: string;
}

export class TacticalRenderer {
  private canvas: HTMLCanvasElement;
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private isSoftwareGl: boolean = false;

  public graphicsQuality: GraphicsQuality = 'high';
  public atmospherePreset: AtmospherePreset = 'daylight';

  private terrainSys: Terrain3DSystem;
  private modelsRegistry: Models3DRegistry;

  private terrain: TerrainType[][] = [];
  private bases: Base[] = [];
  private units: Unit[] = [];
  public envObjects: EnvironmentObject[] = [];
  private envPropsGroup: THREE.Group | null = null;
  private lastEnvCount: number = -1;

  private unitStates = new Map<string, UnitRenderState>();
  private baseStates = new Map<string, BaseRenderState>();
  private unitsRoot = new THREE.Group();
  private basesRoot = new THREE.Group();
  private fxRoot = new THREE.Group();

  private projectiles: Projectile3D[] = [];
  private explosions: Explosion3D[] = [];
  private dustPlumes: DustPlume3D[] = [];
  private damageTexts: FloatingDamageText[] = [];
  private flashLight: THREE.PointLight;

  // Shared geometry/material for dust & smoke particles
  private dustGeom = new THREE.DodecahedronGeometry(0.11, 0);
  private dustMat = new THREE.MeshStandardMaterial({
    color: 0xa89984,
    roughness: 0.95,
    transparent: true,
    opacity: 0.45,
  });
  private damageSmokeMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.96,
    transparent: true,
    opacity: 0.55,
  });

  private currentUserId: string = '';
  private userAllianceId: string | null = null;

  // Read-only 3D Battlefield Preview Mode state (used while unauthenticated)
  public isPreviewMode: boolean = true;
  private previewBases: Base[] = [];
  private previewUnits: Unit[] = [];
  private previewPatrolRoutes: Map<string, { startX: number; startY: number; endX: number; endY: number; speed: number; phase: number }> = new Map();
  private lastPreviewShotMs: number = 0;

  // Camera state (world grid coordinates 0..100, 0..75)
  public cameraX: number = 36.0;
  public cameraY: number = 28.0;
  private smoothCamX: number = 36.0;
  private smoothCamY: number = 28.0;
  public zoom: number = 0.88; // 0.42 (strategic) to 2.8 (close-up tactical)
  private smoothZoom: number = 0.88;
  public cameraYaw: number = -0.18; // Slight tactical angle toward riverfront
  private smoothYaw: number = -0.18;
  public cameraPitch: number = 0.82; // Elevated strategic preview angle initially
  public isStrategicOverview: boolean = false;

  // Selection & Interactive states
  public selectedUnitIds: Set<string> = new Set();
  public selectedBaseId: string | null = null;
  public selectionBox: { startX: number; startY: number; currentX: number; currentY: number } | null = null;
  public placementGhost: PlacementGhostState | null = null;
  private ghostGroup: THREE.Group | null = null;
  private ghostType: BuildingType | null = null;
  private ghostPerimeterRing: THREE.Mesh;

  // Animation & Loop state
  private running: boolean = false;
  private animFrameId: number | null = null;
  private clock = new THREE.Clock();

  // Fog of war & visual toggles
  public fogEnabled: boolean = true;
  public showRepairCranes: boolean = true;
  public flashUnitsUntil: number = 0;
  private exploredCells: Uint8Array | null = null;

  // Pre-allocated math objects for zero-GC frame loop
  private raycaster = new THREE.Raycaster();
  private ndcVec = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.28);
  private planeIntersect = new THREE.Vector3();
  private projVec = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    assetManager.init();

    // Create 2D HUD overlay canvas for crisp screen-space bars, labels, and selection marquee
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.className = 'absolute inset-0 w-full h-full pointer-events-none z-10';
    this.hudCanvas.width = canvas.width || window.innerWidth;
    this.hudCanvas.height = canvas.height || window.innerHeight;
    if (canvas.parentElement) {
      canvas.parentElement.appendChild(this.hudCanvas);
    }
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    // Detect Software WebGL before full configuration
    const tempGl =
      canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ||
      canvas.getContext('webgl', { powerPreference: 'high-performance' });
    if (tempGl) {
      const dbg = tempGl.getExtension('WEBGL_debug_renderer_info');
      const rendererStr = dbg ? tempGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1.0 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.width || window.innerWidth, canvas.height || window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene & Daylight Atmosphere Setup (Alpha Force Riverfront Assault look)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x84a9c0);
    this.scene.fog = new THREE.FogExp2(0x8fb2c7, 0.0068);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.72;
    pmrem.dispose();

    // Perspective RTS Camera
    this.camera = new THREE.PerspectiveCamera(
      42,
      (canvas.width || window.innerWidth) / Math.max(1, canvas.height || window.innerHeight),
      0.5,
      190
    );

    // Warm Daylight Sunlight + Sky/Ground Hemisphere Light
    this.hemiLight = new THREE.HemisphereLight(0xbbe0ff, 0x2d4225, 1.05);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3d6, 2.85);
    this.sunLight.position.set(42, 62, 32);
    if (!this.isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.sunLight.shadow.camera.near = 5;
      this.sunLight.shadow.camera.far = 160;
      const d = 55;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.sunLight);

    // Muzzle / Explosion transient point light
    this.flashLight = new THREE.PointLight(0xf97316, 0, 14);
    this.scene.add(this.flashLight);

    // Subsystems
    this.terrainSys = new Terrain3DSystem();
    this.modelsRegistry = new Models3DRegistry();
    this.scene.add(this.terrainSys.terrainGroup);
    this.scene.add(this.basesRoot);
    this.scene.add(this.unitsRoot);
    this.scene.add(this.fxRoot);

    // Base build-zone perimeter ring for 3D building placement
    const ringGeom = new THREE.RingGeometry(3.8, 4.0, 48);
    ringGeom.rotateX(-Math.PI / 2);
    this.ghostPerimeterRing = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    this.ghostPerimeterRing.visible = false;
    this.scene.add(this.ghostPerimeterRing);

    // Rebuild base meshes when Kenney GLB models finish loading
    this.modelsRegistry.onModelsUpdated(() => {
      this.baseStates.forEach((st) => {
        st.signature = '';
      });
    });

    // Initialize deterministic read-only 3D battlefield showcase for login preview
    this.initPreviewShowcase();
  }

  private initPreviewShowcase() {
    const previewWorld = generateWorld({ width: 100, height: 75, tileSize: 40, seed: 202610 });
    this.previewBases = previewWorld.bases.map((b, idx) => ({
      ...b,
      id: `preview_base_${idx}`,
      ownerId: idx === 0 || idx === 1 ? 'preview_vanguard' : idx === 5 ? 'preview_kodiak' : 'neutral',
      ownerName: idx === 0 || idx === 1 ? 'Vanguard Coalition' : idx === 5 ? 'Kodiak PMC' : 'Neutral Sector',
    }));

    const patrolSpecs: {
      id: string;
      type: UnitType;
      ownerId: string;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      speed: number;
      phase: number;
    }[] = [
      // Vanguard armored column advancing toward Northern Riverfront Bridge
      { id: 'prev_u1', type: 'titan_mbt', ownerId: 'preview_vanguard', startX: 19, startY: 21, endX: 41, endY: 21, speed: 0.22, phase: 0.0 },
      { id: 'prev_u2', type: 'titan_mbt', ownerId: 'preview_vanguard', startX: 17, startY: 22.2, endX: 39, endY: 22.2, speed: 0.22, phase: 0.15 },
      { id: 'prev_u3', type: 'ironclad_apc', ownerId: 'preview_vanguard', startX: 15, startY: 20.5, endX: 37, endY: 20.5, speed: 0.25, phase: 0.3 },
      { id: 'prev_u4', type: 'vanguard_scout', ownerId: 'preview_vanguard', startX: 22, startY: 24, endX: 42, endY: 28, speed: 0.32, phase: 0.5 },
      { id: 'prev_u5', type: 'goliath_howitzer', ownerId: 'preview_vanguard', startX: 24, startY: 26, endX: 33, endY: 25, speed: 0.14, phase: 0.2 },
      { id: 'prev_u6', type: 'rifle_infantry', ownerId: 'preview_vanguard', startX: 28, startY: 22.8, endX: 40, endY: 22.8, speed: 0.18, phase: 0.4 },
      // Air wing patrolling over the river valley & bridges
      { id: 'prev_u7', type: 'cobra_gunship', ownerId: 'preview_vanguard', startX: 20, startY: 18, endX: 52, endY: 32, speed: 0.38, phase: 0.1 },
      { id: 'prev_u8', type: 'stormbringer_jet', ownerId: 'preview_vanguard', startX: 14, startY: 14, endX: 64, endY: 36, speed: 0.55, phase: 0.6 },
      // Opposing Kodiak forces holding eastern riverbank & bridgehead
      { id: 'prev_u9', type: 'titan_mbt', ownerId: 'preview_kodiak', startX: 56, startY: 21, endX: 47, endY: 21, speed: 0.2, phase: 0.25 },
      { id: 'prev_u10', type: 'skyguard_aa', ownerId: 'preview_kodiak', startX: 58, startY: 24, endX: 49, endY: 25, speed: 0.22, phase: 0.45 },
      { id: 'prev_u11', type: 'cobra_gunship', ownerId: 'preview_kodiak', startX: 64, startY: 19, endX: 46, endY: 27, speed: 0.36, phase: 0.75 },
      { id: 'prev_u12', type: 'hawk_scout_heli', ownerId: 'preview_vanguard', startX: 25, startY: 36, endX: 48, endY: 42, speed: 0.4, phase: 0.35 },
    ];

    this.previewPatrolRoutes.clear();
    this.previewUnits = patrolSpecs.map((spec) => {
      this.previewPatrolRoutes.set(spec.id, {
        startX: spec.startX,
        startY: spec.startY,
        endX: spec.endX,
        endY: spec.endY,
        speed: spec.speed,
        phase: spec.phase,
      });
      const uDef = UNIT_CATALOG[spec.type];
      return {
        id: spec.id,
        type: spec.type,
        ownerId: spec.ownerId,
        ownerName: spec.ownerId === 'preview_vanguard' ? 'Vanguard Coalition' : 'Kodiak PMC',
        x: spec.startX,
        y: spec.startY,
        rotation: Math.atan2(spec.endY - spec.startY, spec.endX - spec.startX),
        health: uDef?.maxHealth || 500,
        maxHealth: uDef?.maxHealth || 500,
        command: 'patrol',
        path: [{ x: spec.endX, y: spec.endY }],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'preview_base_0',
      };
    });

    if (this.terrain.length === 0) {
      this.envObjects = previewWorld.envObjects;
      this.setTerrain(previewWorld.terrain);
    }
  }

  public setPreviewMode(enabled: boolean) {
    const modeChanged = this.isPreviewMode !== enabled;
    this.isPreviewMode = enabled;

    if (enabled) {
      this.currentUserId = '';
      this.userAllianceId = null;
      this.bases = [];
      this.units = [];
      this.selectedUnitIds.clear();
      this.selectedBaseId = null;
      this.selectionBox = null;
      this.placementGhost = null;
      if (this.exploredCells) {
        this.exploredCells.fill(0);
      }
      this.zoom = 0.88;
      this.cameraPitch = 0.82;
      if (this.terrain.length > 0) {
        this.terrainSys.buildTerrain(this.terrain, this.previewBases);
      }
    } else if (modeChanged) {
      this.selectedUnitIds.clear();
      this.selectedBaseId = null;
      this.selectionBox = null;
      this.placementGhost = null;
      this.zoom = 1.42;
      this.cameraPitch = 0.72;
      this.cameraYaw = -0.16;
      if (this.terrain.length > 0 && this.bases.length > 0) {
        this.terrainSys.buildTerrain(this.terrain, this.bases);
      }
    }
  }

  public focusOn(x: number, y: number, immediate: boolean = false) {
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(75, y));
    this.cameraX = clampedX;
    this.cameraY = clampedY;
    if (immediate) {
      this.smoothCamX = clampedX;
      this.smoothCamY = clampedY;
    }
  }

  public setGraphicsQuality(quality: GraphicsQuality) {
    this.graphicsQuality = quality;
    if (this.isSoftwareGl) return;

    if (quality === 'low') {
      this.renderer.setPixelRatio(1.0);
      this.renderer.shadowMap.enabled = false;
    } else if (quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
    } else if (quality === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
    }
    this.sunLight.shadow.map?.dispose();
    this.sunLight.shadow.map = null;
  }

  public setAtmospherePreset(preset: AtmospherePreset) {
    this.atmospherePreset = preset;
    if (preset === 'daylight') {
      this.scene.background = new THREE.Color(0x84a9c0);
      this.scene.fog = new THREE.FogExp2(0x8fb2c7, 0.0068);
      this.sunLight.color.setHex(0xfff3d6);
      this.sunLight.intensity = 2.85;
      this.sunLight.position.set(42, 62, 32);
      this.hemiLight.color.setHex(0xbbe0ff);
      this.hemiLight.groundColor.setHex(0x2d4225);
      this.hemiLight.intensity = 1.05;
    } else if (preset === 'golden_hour') {
      this.scene.background = new THREE.Color(0xc98c63);
      this.scene.fog = new THREE.FogExp2(0xc7926b, 0.0075);
      this.sunLight.color.setHex(0xffb86c);
      this.sunLight.intensity = 3.1;
      this.sunLight.position.set(65, 32, 42);
      this.hemiLight.color.setHex(0xfde68a);
      this.hemiLight.groundColor.setHex(0x3a2e21);
      this.hemiLight.intensity = 0.95;
    } else {
      this.scene.background = new THREE.Color(0x526575);
      this.scene.fog = new THREE.FogExp2(0x5a6e7f, 0.0085);
      this.sunLight.color.setHex(0xcbd5e1);
      this.sunLight.intensity = 1.85;
      this.sunLight.position.set(25, 68, 20);
      this.hemiLight.color.setHex(0x94a3b8);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 1.1;
    }
  }

  public setTerrain(terrain: TerrainType[][]) {
    this.terrain = terrain;
    const h = terrain.length;
    const w = terrain[0]?.length || 0;
    if (!this.exploredCells || this.exploredCells.length !== w * h) {
      this.exploredCells = new Uint8Array(w * h);
    }
    const activeBases = this.isPreviewMode ? this.previewBases : this.bases;
    this.terrainSys.buildTerrain(this.terrain, activeBases);
    this.rebuildEnvironmentProps();
  }

  private rebuildEnvironmentProps() {
    if (this.terrain.length === 0) return;
    if (this.envPropsGroup) {
      this.scene.remove(this.envPropsGroup);
    }
    this.envPropsGroup = this.modelsRegistry.buildInstancedEnvironmentProps(
      this.envObjects,
      this.terrainSys,
      this.terrain
    );
    this.scene.add(this.envPropsGroup);
    this.lastEnvCount = this.envObjects.length;
  }

  public updateWorld(
    bases: Base[],
    units: Unit[],
    userId: string,
    allianceId?: string | null,
    envObjects?: EnvironmentObject[]
  ) {
    const firstBasesLoad = this.bases.length === 0 && bases.length > 0;
    this.bases = bases;
    this.units = units;
    this.currentUserId = userId;
    this.userAllianceId = allianceId || null;

    if (firstBasesLoad && this.terrain.length > 0) {
      this.terrainSys.buildTerrain(this.terrain, this.bases);
    }

    if (envObjects && envObjects.length !== this.lastEnvCount) {
      this.envObjects = envObjects;
      this.rebuildEnvironmentProps();
    }

    // Update fog of war exploration
    if (this.terrain.length > 0 && this.exploredCells) {
      const w = this.terrain[0].length;
      const h = this.terrain.length;

      bases.forEach((b) => {
        if (b.ownerId === this.currentUserId || (this.userAllianceId && b.allianceId === this.userAllianceId)) {
          this.revealFogCircle(b.x, b.y, b.radius + 8, w, h);
        }
      });

      units.forEach((u) => {
        if (u.ownerId === this.currentUserId || (this.userAllianceId && u.allianceId === this.userAllianceId)) {
          const def = UNIT_CATALOG[u.type];
          const vision = def?.visionRadius || 8;
          this.revealFogCircle(Math.round(u.x), Math.round(u.y), vision, w, h);
        }
      });
    }
  }

  private revealFogCircle(cx: number, cy: number, radius: number, w: number, h: number) {
    if (!this.exploredCells) return;
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            this.exploredCells[ny * w + nx] = 1;
          }
        }
      }
    }
  }

  public isCellVisible(x: number, y: number): boolean {
    if (this.isPreviewMode || !this.fogEnabled || !this.exploredCells || this.terrain.length === 0) return true;
    const w = this.terrain[0].length;
    const h = this.terrain.length;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cx >= w || cy < 0 || cy >= h) return false;
    return this.exploredCells[cy * w + cx] === 1;
  }

  public addCombatEvent(evt: CombatEvent) {
    const now = performance.now();
    const targetY = this.terrainSys.groundHeightAt(evt.x, evt.y, this.terrain) + 0.35;

    // 1. Trigger gun recoil, muzzle flash cone & turret alignment on attacking unit
    const attackerState = this.unitStates.get(evt.attackerId);
    let startPos = new THREE.Vector3(
      evt.attackerX ?? evt.x - 1.5,
      targetY + 0.2,
      evt.attackerY ?? evt.y - 1.5
    );

    if (attackerState) {
      attackerState.lastFireMs = now;
      attackerState.turretRot = Math.atan2(
        evt.y - attackerState.displayZ,
        evt.x - attackerState.displayX
      );
      startPos.set(
        attackerState.displayX + Math.cos(attackerState.turretRot) * 0.65,
        attackerState.group.position.y + 0.36,
        attackerState.displayZ + Math.sin(attackerState.turretRot) * 0.65
      );
    } else if (evt.attackerX !== undefined && evt.attackerY !== undefined) {
      const ay = this.terrainSys.groundHeightAt(evt.attackerX, evt.attackerY, this.terrain);
      startPos.set(evt.attackerX, ay + 0.55, evt.attackerY);
    }

    const endPos = new THREE.Vector3(evt.x, targetY, evt.y);

    // 2. Spawn 3D Projectile / Missile / Glowing Tracer Streak
    const isMissile =
      evt.attackerType.includes('sam') ||
      evt.attackerType.includes('cobra') ||
      evt.attackerType.includes('jet') ||
      evt.attackerType.includes('bomber');
    const isArtillery =
      evt.attackerType.includes('howitzer') ||
      evt.attackerType.includes('artillery') ||
      evt.attackerType.includes('dreadnought') ||
      evt.attackerType.includes('coastal');

    const projGeom = isMissile
      ? new THREE.ConeGeometry(0.075, 0.44, 6)
      : new THREE.CylinderGeometry(isArtillery ? 0.055 : 0.032, isArtillery ? 0.055 : 0.032, isArtillery ? 0.48 : 0.36, 6);
    projGeom.rotateX(Math.PI / 2);

    const projMat = new THREE.MeshBasicMaterial({
      color: isMissile ? 0x38bdf8 : isArtillery ? 0xf97316 : 0xfef08a,
    });
    const projMesh = new THREE.Mesh(projGeom, projMat);
    projMesh.position.copy(startPos);
    this.fxRoot.add(projMesh);

    this.projectiles.push({
      id: `proj_${now}_${Math.random()}`,
      mesh: projMesh,
      startPos,
      endPos,
      startTime: now,
      durationMs: isArtillery ? 420 : isMissile ? 340 : 190,
      arcHeight: isArtillery ? 2.5 : isMissile ? 0.85 : 0.12,
      isMissile,
    });

    // 3. Spawn 3D Explosion at impact
    const expGroup = new THREE.Group();
    expGroup.position.copy(endPos);

    const fbMat = new THREE.MeshBasicMaterial({
      color: evt.isFatal ? 0xff4500 : 0xfbbf24,
      transparent: true,
      opacity: 0.95,
    });
    const fireball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fbMat);
    expGroup.add(fireball);

    const swGeom = new THREE.RingGeometry(0.16, 0.34, 20);
    swGeom.rotateX(-Math.PI / 2);
    const swMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const shockwave = new THREE.Mesh(swGeom, swMat);
    shockwave.position.y = 0.05;
    expGroup.add(shockwave);

    const smokePuffs: { mesh: THREE.Mesh; vx: number; vy: number; vz: number }[] = [];
    const puffCount = this.graphicsQuality === 'low' ? 2 : evt.isFatal ? 6 : 3;
    for (let i = 0; i < puffCount; i++) {
      const sMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.95,
        transparent: true,
        opacity: 0.78,
      });
      const sMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), sMat);
      expGroup.add(sMesh);
      const angle = (i / puffCount) * Math.PI * 2;
      smokePuffs.push({
        mesh: sMesh,
        vx: Math.cos(angle) * 0.85,
        vy: 1.2 + Math.random() * 0.8,
        vz: Math.sin(angle) * 0.85,
      });
    }

    this.fxRoot.add(expGroup);
    this.explosions.push({
      id: `exp_${now}_${Math.random()}`,
      group: expGroup,
      fireball,
      shockwave,
      smokePuffs,
      startTime: now,
      durationMs: evt.isFatal ? 820 : 480,
      maxRadius: evt.isFatal ? 2.7 : 1.4,
    });

    // Pulse transient point light
    this.flashLight.position.copy(endPos).add(new THREE.Vector3(0, 1.3, 0));
    this.flashLight.intensity = evt.isFatal ? 6.5 : 3.2;

    // 4. Floating damage number in HUD overlay
    this.damageTexts.push({
      id: `dmg_${now}_${Math.random()}`,
      x: evt.x,
      y: targetY + 0.5,
      z: evt.y,
      text: `-${evt.damage}`,
      color: evt.isFatal ? '#ef4444' : '#fbbf24',
      startTime: now,
      durationMs: 850,
    });
  }

  public startRenderLoop() {
    if (this.running) return;
    this.running = true;
    this.clock.start();

    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const afterDraw = (cb: () => void) => {
      if (!this.isSoftwareGl || typeof gl.fenceSync !== 'function') {
        this.animFrameId = requestAnimationFrame(cb);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!this.running) return;
        const s = gl.clientWaitSync(sync!, 0, 0);
        if (s === gl.TIMEOUT_EXPIRED) {
          setTimeout(poll, 16);
        } else {
          gl.deleteSync(sync);
          setTimeout(cb, 80);
        }
      };
      setTimeout(poll, 16);
    };

    const tick = () => {
      if (!this.running) return;
      this.render();
      afterDraw(tick);
    };
    afterDraw(tick);
  }

  public stopRenderLoop() {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.hudCanvas.parentElement) {
      this.hudCanvas.parentElement.removeChild(this.hudCanvas);
    }
    this.renderer.dispose();
  }

  // Project 3D world coordinate (wx, wy on grid) to 2D screen pixel coordinates
  public worldToScreen(wx: number, wy: number, heightOffset: number = 0): { x: number; y: number; visible?: boolean } {
    const gy = this.terrainSys.groundHeightAt(wx, wy, this.terrain) + heightOffset;
    this.projVec.set(wx, gy, wy);
    this.projVec.project(this.camera);

    const halfW = this.canvas.width / 2;
    const halfH = this.canvas.height / 2;
    return {
      x: this.projVec.x * halfW + halfW,
      y: -this.projVec.y * halfH + halfH,
      visible: this.projVec.z >= -1 && this.projVec.z <= 1,
    };
  }

  // Raycast 2D screen pixel coordinate (sx, sy) to 3D battlefield ground (x, y)
  public screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.width || window.innerWidth;
    const h = rect.height || this.canvas.height || window.innerHeight;

    this.ndcVec.x = ((sx - rect.left) / w) * 2 - 1;
    this.ndcVec.y = -((sy - rect.top) / h) * 2 + 1;

    this.raycaster.setFromCamera(this.ndcVec, this.camera);

    if (this.terrainSys.groundMesh) {
      const hits = this.raycaster.intersectObject(this.terrainSys.groundMesh, false);
      if (hits.length > 0) {
        return {
          x: Math.max(0, Math.min(100, hits[0].point.x)),
          y: Math.max(0, Math.min(75, hits[0].point.z)),
        };
      }
    }

    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.planeIntersect)) {
      return {
        x: Math.max(0, Math.min(100, this.planeIntersect.x)),
        y: Math.max(0, Math.min(75, this.planeIntersect.z)),
      };
    }

    return { x: this.cameraX, y: this.cameraY };
  }

  // Pick a 3D unit or base under screen cursor (accounts for 3D aircraft altitude & perspective)
  public pickEntityAtScreen(
    sx: number,
    sy: number
  ): { kind: 'unit'; unit: Unit } | { kind: 'base'; base: Base } | null {
    if (this.isPreviewMode) return null;

    let bestUnit: Unit | null = null;
    let bestUnitDist = 36;

    for (const u of this.units) {
      if (!this.isCellVisible(u.x, u.y)) continue;
      const uDef = UNIT_CATALOG[u.type];
      const alt = uDef?.category === 'air' ? 2.6 : 0.35;
      const sp = this.worldToScreen(u.x, u.y, alt);
      if (!sp.visible) continue;
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d < bestUnitDist) {
        bestUnitDist = d;
        bestUnit = u;
      }
    }

    if (bestUnit) {
      return { kind: 'unit', unit: bestUnit };
    }

    const worldPos = this.screenToWorld(sx, sy);
    const clickedBase = this.bases.find(
      (b) => Math.hypot(b.x - worldPos.x, b.y - worldPos.y) <= b.radius
    );
    if (clickedBase) {
      return { kind: 'base', base: clickedBase };
    }

    return null;
  }

  // Find all player units inside a 2D screen drag-selection rectangle
  public getUnitsInScreenBox(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ownerId: string
  ): Unit[] {
    if (this.isPreviewMode || !ownerId) return [];

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    return this.units.filter((u) => {
      if (u.ownerId !== ownerId) return false;
      const uDef = UNIT_CATALOG[u.type];
      const alt = uDef?.category === 'air' ? 2.6 : 0.35;
      const sp = this.worldToScreen(u.x, u.y, alt);
      return sp.visible && sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY;
    });
  }

  public validateBuildingPlacement(
    base: Base,
    buildingType: BuildingType,
    worldX: number,
    worldY: number
  ): { isValid: boolean; reason?: string } {
    const distFromCenter = Math.hypot(worldX - base.x, worldY - base.y);
    if (distFromCenter > base.radius - 0.45) {
      return { isValid: false, reason: 'OUTSIDE BASE PERIMETER' };
    }
    if (distFromCenter < 1.15 && buildingType !== 'command_center') {
      return { isValid: false, reason: 'RESERVED FOR HQ CORE' };
    }

    const cx = Math.floor(worldX);
    const cy = Math.floor(worldY);
    const cell = this.terrain[cy]?.[cx];
    if (cell === 'water' || cell === 'deep_water' || cell === 'mountain') {
      if (buildingType !== 'naval_dockyard' && buildingType !== 'coastal_battery') {
        return { isValid: false, reason: 'UNSUITABLE TERRAIN' };
      }
    }

    for (let i = 0; i < base.buildings.length; i++) {
      const b = base.buildings[i];
      if (b.type === buildingType) continue;
      const slot = this.getBuildingWorldPosition(base, b, i);
      if (Math.hypot(worldX - slot.x, worldY - slot.z) < 0.85) {
        return { isValid: false, reason: 'OVERLAPS EXISTING FACILITY' };
      }
    }

    return { isValid: true };
  }

  private getBuildingWorldPosition(
    base: Base,
    building: { type: BuildingType; offsetX?: number; offsetY?: number },
    idx: number
  ): { x: number; z: number } {
    if (building.type === 'command_center') {
      return { x: base.x, z: base.y };
    }
    if (building.offsetX !== undefined && building.offsetY !== undefined) {
      return { x: base.x + building.offsetX, z: base.y + building.offsetY };
    }

    let ring = 1;
    let ringIdx = idx;
    let countInRing = 6;
    let ringDist = 1.68;

    if (idx >= 6 && idx < 18) {
      ring = 2;
      ringIdx = idx - 6;
      countInRing = 12;
      ringDist = 2.78;
    } else if (idx >= 18) {
      ring = 3;
      ringIdx = idx - 18;
      countInRing = 18;
      ringDist = 3.7;
    }

    const angle = (ringIdx / countInRing) * Math.PI * 2 + (ring === 2 ? 0.35 : 0);
    return {
      x: base.x + Math.cos(angle) * ringDist,
      z: base.y + Math.sin(angle) * ringDist,
    };
  }

  public render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();
    const now = performance.now();

    if (
      this.hudCanvas.width !== this.canvas.width ||
      this.hudCanvas.height !== this.canvas.height
    ) {
      this.hudCanvas.width = this.canvas.width;
      this.hudCanvas.height = this.canvas.height;
      this.renderer.setSize(this.canvas.width, this.canvas.height, false);
      this.camera.aspect = this.canvas.width / Math.max(1, this.canvas.height);
      this.camera.updateProjectionMatrix();
    }

    // 0. Update Read-Only 3D Strategic Preview Camera & Patrol Animation when unauthenticated
    if (this.isPreviewMode) {
      this.cameraX = 36 + Math.cos(elapsed * 0.1) * 14;
      this.cameraY = 27 + Math.sin(elapsed * 0.075) * 8;
      this.cameraYaw = -0.18 + Math.sin(elapsed * 0.06) * 0.26;
      this.cameraPitch = 0.82;
      this.zoom = 0.88;

      for (const pu of this.previewUnits) {
        const route = this.previewPatrolRoutes.get(pu.id);
        if (!route) continue;
        const cycle = (Math.sin(elapsed * route.speed + route.phase * Math.PI * 2) + 1) * 0.5;
        const nextX = route.startX + (route.endX - route.startX) * cycle;
        const nextY = route.startY + (route.endY - route.startY) * cycle;
        const dx = nextX - pu.x;
        const dy = nextY - pu.y;
        if (Math.hypot(dx, dy) > 0.001) {
          pu.rotation = Math.atan2(dy, dx);
        }
        pu.x = nextX;
        pu.y = nextY;
      }

      // Periodic ambient preview exchange across the riverfront bridge
      if (now - this.lastPreviewShotMs > 1650 && this.previewUnits.length >= 10) {
        this.lastPreviewShotMs = now;
        const vanguardAttackers = this.previewUnits.filter((u) => u.ownerId === 'preview_vanguard');
        const kodiakTargets = this.previewUnits.filter((u) => u.ownerId === 'preview_kodiak');
        if (vanguardAttackers.length > 0 && kodiakTargets.length > 0) {
          const isVanguardVolley = Math.random() > 0.45;
          const attacker = isVanguardVolley
            ? vanguardAttackers[Math.floor(Math.random() * vanguardAttackers.length)]
            : kodiakTargets[Math.floor(Math.random() * kodiakTargets.length)];
          const target = isVanguardVolley
            ? kodiakTargets[Math.floor(Math.random() * kodiakTargets.length)]
            : vanguardAttackers[Math.floor(Math.random() * vanguardAttackers.length)];

          this.addCombatEvent({
            id: `prev_cb_${now}`,
            attackerId: attacker.id,
            attackerType: attacker.type,
            attackerOwnerId: attacker.ownerId,
            attackerX: attacker.x,
            attackerY: attacker.y,
            targetId: target.id,
            targetType: target.type,
            damage: 35,
            x: target.x + (Math.random() - 0.5) * 1.4,
            y: target.y + (Math.random() - 0.5) * 1.4,
            isFatal: false,
            timestamp: Date.now(),
          });
        }
      }
    }

    // 1. Update Damped RTS Camera
    const targetPitch = this.isPreviewMode ? 0.82 : this.isStrategicOverview ? 1.35 : this.cameraPitch;
    const targetZoom = this.isPreviewMode ? 0.88 : this.isStrategicOverview ? 0.48 : this.zoom;

    const damp = 1 - Math.exp(-12 * dt);
    this.smoothCamX += (this.cameraX - this.smoothCamX) * damp;
    this.smoothCamY += (this.cameraY - this.smoothCamY) * damp;
    this.smoothZoom += (targetZoom - this.smoothZoom) * damp;
    this.smoothYaw += (this.cameraYaw - this.smoothYaw) * damp;

    const groundY = this.terrainSys.groundHeightAt(this.smoothCamX, this.smoothCamY, this.terrain);
    const orbitDist = 23 / Math.max(0.38, this.smoothZoom);
    const horizDist = Math.cos(targetPitch) * orbitDist;
    const vertDist = Math.sin(targetPitch) * orbitDist;

    this.camera.position.set(
      this.smoothCamX + Math.sin(this.smoothYaw) * horizDist,
      groundY + vertDist,
      this.smoothCamY + Math.cos(this.smoothYaw) * horizDist
    );
    this.camera.lookAt(this.smoothCamX, groundY, this.smoothCamY);

    // Move directional shadow frustum with camera so shadows stay sharp anywhere on map
    this.sunLight.target.position.set(this.smoothCamX, groundY, this.smoothCamY);
    this.sunLight.target.updateMatrixWorld();

    // 2. Update Animated Water
    this.terrainSys.updateWater(elapsed);

    // 3. Sync & Animate 3D Military Bases
    this.syncBases3D(elapsed);

    // 4. Sync & Animate 3D Units (including Infantry stride, Tank turrets, Dust trails)
    this.syncUnits3D(dt, elapsed, now);

    // 5. Update 3D Building Placement Ghost
    this.syncPlacementGhost3D();

    // 6. Update 3D Projectiles, Explosions, Dust Plumes & Transient Lights
    this.updateCombatFX3D(dt, now);

    // 7. Render 3D WebGL Scene
    this.renderer.render(this.scene, this.camera);

    // 8. Render 2D Tactical HUD Overlay (Health bars, Base labels, Selection box)
    this.renderHudOverlay(now);
  }

  private syncBases3D(elapsed: number) {
    const activeBaseIds = new Set<string>();
    const sourceBases = this.isPreviewMode ? this.previewBases : this.bases;

    for (const base of sourceBases) {
      activeBaseIds.add(base.id);
      const isPlayer = this.isPreviewMode
        ? base.ownerId === 'preview_vanguard'
        : Boolean(this.currentUserId && base.ownerId === this.currentUserId);
      const isAllied = !this.isPreviewMode && Boolean(this.userAllianceId && base.allianceId === this.userAllianceId);
      const isEnemy = this.isPreviewMode
        ? base.ownerId === 'preview_kodiak'
        : base.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && base.ownerId !== 'neutral');
      const teamHex = isPlayer ? 0x3b82f6 : isAllied ? 0x10b981 : isEnemy ? 0xef4444 : 0xf59e0b;

      const sig = `${base.ownerId}_${base.buildings
        .map((b) => `${b.id}:${b.type}:${b.level}:${b.isConstructing ? 1 : 0}:${b.offsetX ?? ''}:${b.offsetY ?? ''}`)
        .join('|')}_${base.constructionQueue.map((q) => q.buildingType).join(',')}`;

      let st = this.baseStates.get(base.id);
      if (!st || st.signature !== sig) {
        if (st) {
          this.basesRoot.remove(st.group);
        }

        const group = new THREE.Group();
        const gy = this.terrainSys.groundHeightAt(base.x, base.y, this.terrain);
        group.position.set(base.x, gy, base.y);

        // Compound paved military tarmac foundation + road apron
        const padGeom = new THREE.CylinderGeometry(base.radius, base.radius + 0.25, 0.07, 28);
        const padMat = new THREE.MeshStandardMaterial({
          color: 0x262d38,
          roughness: 0.84,
          metalness: 0.14,
        });
        const padMesh = new THREE.Mesh(padGeom, padMat);
        padMesh.position.y = 0.025;
        padMesh.receiveShadow = true;
        group.add(padMesh);

        // 3D Perimeter Fortification Wall & Corner Watchtowers
        const wallSegments = 16;
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.78 });
        const accentMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.42 });
        for (let i = 0; i < wallSegments; i++) {
          const angle = (i / wallSegments) * Math.PI * 2;
          // Leave East/South-East gate open for vehicle access
          if (angle > -0.25 && angle < 0.75) continue;

          const wx = Math.cos(angle) * base.radius;
          const wz = Math.sin(angle) * base.radius;

          const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 1.18), wallMat);
          wall.position.set(wx, 0.19, wz);
          wall.rotation.y = -angle;
          wall.castShadow = true;
          wall.receiveShadow = true;
          group.add(wall);

          if (i % 4 === 0) {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.76, 0.46), wallMat);
            tower.position.set(wx, 0.38, wz);
            tower.castShadow = true;
            const roof = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.52), accentMat);
            roof.position.set(wx, 0.78, wz);
            group.add(tower, roof);
          }
        }

        const nonHqBuildings = base.buildings.filter((b) => b.type !== 'command_center');
        const hq = base.buildings.find((b) => b.type === 'command_center');
        if (hq) {
          const hqMesh = this.modelsRegistry.createBuildingMesh('command_center', teamHex, hq.isConstructing);
          group.add(hqMesh);
        }

        nonHqBuildings.forEach((b, idx) => {
          const pos = this.getBuildingWorldPosition(base, b, idx);
          const bMesh = this.modelsRegistry.createBuildingMesh(b.type, teamHex, b.isConstructing);
          bMesh.position.set(pos.x - base.x, 0, pos.z - base.y);
          group.add(bMesh);
        });

        base.constructionQueue.forEach((order, qIdx) => {
          if (!base.buildings.some((b) => b.type === order.buildingType)) {
            const pos = this.getBuildingWorldPosition(
              base,
              { type: order.buildingType, offsetX: order.offsetX, offsetY: order.offsetY },
              nonHqBuildings.length + qIdx
            );
            const cMesh = this.modelsRegistry.createBuildingMesh(order.buildingType, teamHex, true);
            cMesh.position.set(pos.x - base.x, 0, pos.z - base.y);
            group.add(cMesh);
          }
        });

        // 3D Energy Defense Shield Dome
        const shieldGeom = new THREE.SphereGeometry(base.radius * 1.04, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const shieldMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.1,
          wireframe: true,
        });
        const shieldMesh = new THREE.Mesh(shieldGeom, shieldMat);
        group.add(shieldMesh);

        // Selection Ring
        const selGeom = new THREE.RingGeometry(base.radius + 0.15, base.radius + 0.36, 36);
        selGeom.rotateX(-Math.PI / 2);
        const selRing = new THREE.Mesh(
          selGeom,
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
        );
        selRing.position.y = 0.06;
        group.add(selRing);

        this.basesRoot.add(group);
        st = { group, shieldMesh, selectionRing: selRing, signature: sig };
        this.baseStates.set(base.id, st);
      }

      st.group.traverse((obj) => {
        if (obj.name === 'radar') {
          obj.rotation.y = elapsed * 1.1;
        }
      });

      st.shieldMesh.visible = !this.isPreviewMode && base.defenseShield > 0 && this.selectedBaseId === base.id;
      st.selectionRing.visible = !this.isPreviewMode && this.selectedBaseId === base.id;
    }

    for (const [id, st] of this.baseStates.entries()) {
      if (!activeBaseIds.has(id)) {
        this.basesRoot.remove(st.group);
        this.baseStates.delete(id);
      }
    }
  }

  private syncUnits3D(dt: number, elapsed: number, now: number) {
    const activeIds = new Set<string>();
    const posLerp = 1 - Math.exp(-12 * dt);
    const sourceUnits = this.isPreviewMode ? this.previewUnits : this.units;

    for (const unit of sourceUnits) {
      activeIds.add(unit.id);

      const isPlayer = this.isPreviewMode
        ? unit.ownerId === 'preview_vanguard'
        : Boolean(this.currentUserId && unit.ownerId === this.currentUserId);
      const isAllied = !this.isPreviewMode && Boolean(this.userAllianceId && unit.allianceId === this.userAllianceId);
      const isEnemy = this.isPreviewMode
        ? unit.ownerId === 'preview_kodiak'
        : unit.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);
      const teamHex = isPlayer ? 0x2563eb : isAllied ? 0x10b981 : isEnemy ? 0xdc2626 : 0xd97706;

      let st = this.unitStates.get(unit.id);
      if (!st || st.teamColorHex !== teamHex) {
        if (st) {
          this.unitsRoot.remove(st.group);
          if (st.waypointLine) this.fxRoot.remove(st.waypointLine);
          this.fxRoot.remove(st.waypointMarker);
        }

        const meshGroup = this.modelsRegistry.createUnitMesh(unit.type, teamHex);

        // Tactical Ground Selection Ring
        const ringGeom = new THREE.RingGeometry(0.46, 0.56, 28);
        ringGeom.rotateX(-Math.PI / 2);
        const selectionRing = new THREE.Mesh(
          ringGeom,
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
        );
        selectionRing.position.y = 0.04;
        meshGroup.add(selectionRing);

        // 3D Muzzle Flash Cone attached to unit
        const flashGeom = new THREE.ConeGeometry(0.11, 0.34, 8);
        flashGeom.rotateZ(-Math.PI / 2);
        const flashMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.92,
        });
        const muzzleFlash = new THREE.Mesh(flashGeom, flashMat);
        muzzleFlash.position.set(0.75, 0.34, 0);
        muzzleFlash.visible = false;
        meshGroup.add(muzzleFlash);

        // Attack range circle when selected
        const uDef = UNIT_CATALOG[unit.type];
        const range = uDef?.attackRange || 6;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * range, 0.08, Math.sin(a) * range));
        }
        const rangeGeom = new THREE.BufferGeometry().setFromPoints(pts);
        const rangeRing = new THREE.Line(
          rangeGeom,
          new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 })
        );
        meshGroup.add(rangeRing);

        // Destination waypoint marker
        const wpGeom = new THREE.RingGeometry(0.18, 0.32, 16);
        wpGeom.rotateX(-Math.PI / 2);
        const waypointMarker = new THREE.Mesh(
          wpGeom,
          new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide })
        );
        waypointMarker.visible = false;
        this.fxRoot.add(waypointMarker);

        this.unitsRoot.add(meshGroup);

        st = {
          group: meshGroup,
          selectionRing,
          rangeRing,
          muzzleFlash,
          waypointLine: null,
          waypointMarker,
          displayX: unit.x,
          displayZ: unit.y,
          displayRot: unit.rotation,
          turretRot: unit.rotation,
          lastFireMs: 0,
          lastDustMs: 0,
          teamColorHex: teamHex,
          type: unit.type,
        };
        this.unitStates.set(unit.id, st);
      }

      const visible = this.isCellVisible(unit.x, unit.y);
      st.group.visible = visible;
      if (!visible) {
        st.waypointMarker.visible = false;
        if (st.waypointLine) st.waypointLine.visible = false;
        continue;
      }

      const prevX = st.displayX;
      const prevZ = st.displayZ;
      st.displayX += (unit.x - st.displayX) * posLerp;
      st.displayZ += (unit.y - st.displayZ) * posLerp;
      const moveDelta = Math.hypot(st.displayX - prevX, st.displayZ - prevZ);
      const isMoving = moveDelta > 0.002 || (unit.path && unit.path.length > 0);

      let angleDiff = unit.rotation - st.displayRot;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      st.displayRot += angleDiff * posLerp;

      const uDef = UNIT_CATALOG[unit.type];
      const gy = this.terrainSys.groundHeightAt(st.displayX, st.displayZ, this.terrain);

      if (uDef?.category === 'air') {
        const hover = Math.sin(elapsed * 3.2 + st.displayX) * 0.08;
        st.group.position.set(st.displayX, gy + 2.55 + hover, st.displayZ);
        st.group.rotation.set(angleDiff * 0.35, -st.displayRot, isMoving ? -0.12 : -0.04);
        st.selectionRing.position.y = -2.5;
        st.rangeRing.position.y = -2.47;
      } else if (uDef?.category === 'naval') {
        const bob = Math.sin(elapsed * 2.2 + st.displayX) * 0.03;
        st.group.position.set(st.displayX, -0.08 + bob, st.displayZ);
        st.group.rotation.set(0, -st.displayRot, 0);
      } else {
        // Subtle suspension vibration when ground vehicles move over terrain
        const suspPitch = isMoving && unit.type !== 'rifle_infantry' ? Math.sin(elapsed * 16 + st.displayX * 3) * 0.025 : 0;
        st.group.position.set(st.displayX, gy, st.displayZ);
        st.group.rotation.set(0, -st.displayRot, suspPitch);

        // Spawn dust plume behind moving ground vehicles
        if (
          isMoving &&
          unit.type !== 'rifle_infantry' &&
          this.graphicsQuality !== 'low' &&
          now - st.lastDustMs > 140
        ) {
          st.lastDustMs = now;
          this.spawnDustPlume(
            st.displayX - Math.cos(st.displayRot) * 0.48,
            gy + 0.08,
            st.displayZ - Math.sin(st.displayRot) * 0.48,
            false
          );
        }
      }

      // Emit damage smoke plume if unit is heavily damaged (< 50% HP)
      if (unit.health < (uDef?.maxHealth || unit.maxHealth) * 0.5 && now - st.lastDustMs > 260) {
        st.lastDustMs = now;
        this.spawnDustPlume(st.displayX, st.group.position.y + 0.38, st.displayZ, true);
      }

      // Animate Rifle Infantry Squad leg stride
      if (unit.type === 'rifle_infantry') {
        for (let sIdx = 0; sIdx < 4; sIdx++) {
          const soldier = st.group.getObjectByName(`soldier_${sIdx}`);
          if (soldier) {
            const legL = soldier.getObjectByName('legL');
            const legR = soldier.getObjectByName('legR');
            if (legL && legR) {
              const stride = isMoving ? Math.sin(elapsed * 14 + sIdx * 1.6) * 0.55 : 0;
              legL.rotation.z = stride;
              legR.rotation.z = -stride;
            }
          }
        }
      }

      // Animate Helicopter Rotors & Radar Dishes
      const rotor = st.group.getObjectByName('rotor');
      if (rotor) {
        rotor.rotation.y = elapsed * 20;
      }
      const radar = st.group.getObjectByName('radar');
      if (radar) {
        radar.rotation.y = elapsed * 2.6;
      }

      // Animate Turret Aiming & Barrel Recoil + Muzzle Flash
      const turret = st.group.getObjectByName('turret');
      if (turret) {
        if (now - st.lastFireMs < 1800) {
          turret.rotation.y = -(st.turretRot - st.displayRot);
        } else {
          turret.rotation.y *= 0.92;
        }
      }

      const fireElapsed = now - st.lastFireMs;
      st.muzzleFlash.visible = fireElapsed < 110;
      if (st.muzzleFlash.visible) {
        st.muzzleFlash.rotation.y = -(st.turretRot - st.displayRot);
      }

      const barrel = st.group.getObjectByName('barrel');
      if (barrel) {
        if (fireElapsed < 180) {
          const kick = Math.sin((fireElapsed / 180) * Math.PI) * 0.13;
          barrel.position.x = -kick;
        } else {
          barrel.position.x = 0;
        }
      }

      // Selection Ring & 3D Waypoint Path Line (disabled in preview mode)
      const isSelected = !this.isPreviewMode && this.selectedUnitIds.has(unit.id);
      st.selectionRing.visible = isSelected;
      st.rangeRing.visible = isSelected;

      if (isSelected && unit.path && unit.path.length > 0) {
        const dest = unit.path[unit.path.length - 1];
        const destY = this.terrainSys.groundHeightAt(dest.x, dest.y, this.terrain) + 0.08;
        st.waypointMarker.position.set(dest.x, destY, dest.y);
        st.waypointMarker.scale.setScalar(0.85 + Math.sin(elapsed * 6) * 0.15);
        st.waypointMarker.visible = true;

        const pathPoints: THREE.Vector3[] = [
          new THREE.Vector3(st.displayX, gy + 0.12, st.displayZ),
        ];
        unit.path.forEach((p) => {
          const py = this.terrainSys.groundHeightAt(p.x, p.y, this.terrain) + 0.12;
          pathPoints.push(new THREE.Vector3(p.x, py, p.y));
        });

        if (st.waypointLine) {
          st.waypointLine.geometry.dispose();
          st.waypointLine.geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
          st.waypointLine.visible = true;
        } else {
          const lineMat = new THREE.LineBasicMaterial({
            color: unit.command === 'attack' ? 0xf43f5e : 0x22d3ee,
            transparent: true,
            opacity: 0.78,
          });
          st.waypointLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPoints), lineMat);
          this.fxRoot.add(st.waypointLine);
        }
      } else {
        st.waypointMarker.visible = false;
        if (st.waypointLine) st.waypointLine.visible = false;
      }
    }

    for (const [id, st] of this.unitStates.entries()) {
      if (!activeIds.has(id)) {
        this.unitsRoot.remove(st.group);
        if (st.waypointLine) this.fxRoot.remove(st.waypointLine);
        this.fxRoot.remove(st.waypointMarker);
        this.unitStates.delete(id);
      }
    }
  }

  private spawnDustPlume(x: number, y: number, z: number, isDamageSmoke: boolean) {
    if (this.dustPlumes.length > 80) return;
    const mat = (isDamageSmoke ? this.damageSmokeMat : this.dustMat).clone();
    const mesh = new THREE.Mesh(this.dustGeom, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 0.18,
      y,
      z + (Math.random() - 0.5) * 0.18
    );
    this.fxRoot.add(mesh);

    this.dustPlumes.push({
      mesh,
      vx: (Math.random() - 0.5) * 0.25,
      vy: isDamageSmoke ? 0.65 + Math.random() * 0.35 : 0.28 + Math.random() * 0.2,
      vz: (Math.random() - 0.5) * 0.25,
      startTime: performance.now(),
      durationMs: isDamageSmoke ? 950 : 580,
      startScale: isDamageSmoke ? 0.9 : 0.75,
    });
  }

  private syncPlacementGhost3D() {
    if (!this.placementGhost) {
      if (this.ghostGroup) this.ghostGroup.visible = false;
      this.ghostPerimeterRing.visible = false;
      return;
    }

    const { baseId, buildingType, worldX, worldY, isValid } = this.placementGhost;
    const base = this.bases.find((b) => b.id === baseId);

    if (base) {
      const bGy = this.terrainSys.groundHeightAt(base.x, base.y, this.terrain);
      this.ghostPerimeterRing.position.set(base.x, bGy + 0.08, base.y);
      this.ghostPerimeterRing.visible = true;
    }

    if (!this.ghostGroup || this.ghostType !== buildingType) {
      if (this.ghostGroup) this.scene.remove(this.ghostGroup);
      this.ghostGroup = this.modelsRegistry.createBuildingMesh(buildingType, 0x38bdf8, false);
      this.scene.add(this.ghostGroup);
      this.ghostType = buildingType;
    }

    this.ghostGroup.visible = true;
    const gy = this.terrainSys.groundHeightAt(worldX, worldY, this.terrain);
    this.ghostGroup.position.set(worldX, gy, worldY);

    const tintHex = isValid ? 0x10b981 : 0xef4444;
    this.ghostGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshBasicMaterial({
          color: tintHex,
          transparent: true,
          opacity: 0.55,
          wireframe: !isValid,
        });
      }
    });
  }

  private updateCombatFX3D(dt: number, now: number) {
    if (this.flashLight.intensity > 0.05) {
      this.flashLight.intensity *= Math.exp(-14 * dt);
    } else {
      this.flashLight.intensity = 0;
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const t = (now - p.startTime) / p.durationMs;
      if (t >= 1) {
        this.fxRoot.remove(p.mesh);
        this.projectiles.splice(i, 1);
      } else {
        p.mesh.position.lerpVectors(p.startPos, p.endPos, t);
        p.mesh.position.y += Math.sin(t * Math.PI) * p.arcHeight;
        p.mesh.lookAt(p.endPos);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      const t = (now - ex.startTime) / ex.durationMs;
      if (t >= 1) {
        this.fxRoot.remove(ex.group);
        this.explosions.splice(i, 1);
      } else {
        const scale = 1 + t * ex.maxRadius;
        ex.fireball.scale.setScalar(scale * (1 - t * 0.4));
        (ex.fireball.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.2);

        ex.shockwave.scale.setScalar(1 + t * ex.maxRadius * 1.8);
        (ex.shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);

        ex.smokePuffs.forEach((puff) => {
          puff.mesh.position.x += puff.vx * dt;
          puff.mesh.position.y += puff.vy * dt;
          puff.mesh.position.z += puff.vz * dt;
          puff.mesh.scale.setScalar(1 + t * 1.8);
          (puff.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.75 * (1 - t));
        });
      }
    }

    // Update vehicle dust & damage smoke plumes
    for (let i = this.dustPlumes.length - 1; i >= 0; i--) {
      const dp = this.dustPlumes[i];
      const t = (now - dp.startTime) / dp.durationMs;
      if (t >= 1) {
        this.fxRoot.remove(dp.mesh);
        (dp.mesh.material as THREE.Material).dispose();
        this.dustPlumes.splice(i, 1);
      } else {
        dp.mesh.position.x += dp.vx * dt;
        dp.mesh.position.y += dp.vy * dt;
        dp.mesh.position.z += dp.vz * dt;
        dp.mesh.scale.setScalar(dp.startScale + t * 1.45);
        (dp.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.48 * (1 - t));
      }
    }
  }

  private renderHudOverlay(now: number) {
    const ctx = this.hudCtx;
    const width = this.hudCanvas.width;
    const height = this.hudCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Do not draw interactive 2D tactical bars, base capture labels, or selection boxes while in unauthenticated 3D preview mode
    if (this.isPreviewMode) {
      this.damageTexts = [];
      return;
    }

    // 1. Base Labels, Health Bars, Shield Bars & Capture Progress
    for (const base of this.bases) {
      const sp = this.worldToScreen(base.x, base.y, 1.9);
      if (!sp.visible) continue;

      const isPlayer = base.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && base.allianceId === this.userAllianceId;
      const isEnemy =
        base.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && base.ownerId !== 'neutral');

      const hpPct = Math.max(0, base.health / base.maxHealth);
      const shieldPct = base.maxShield > 0 ? Math.max(0, base.defenseShield / base.maxShield) : 0;
      const barW = 92;
      const barH = 5;

      // Base Name Tag
      ctx.font = 'bold 11px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(9, 14, 23, 0.88)';
      ctx.fillRect(sp.x - barW / 2 - 6, sp.y - 23, barW + 12, 29);
      ctx.strokeStyle = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';
      ctx.lineWidth = 1;
      ctx.strokeRect(sp.x - barW / 2 - 6, sp.y - 23, barW + 12, 29);

      ctx.fillStyle = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';
      ctx.fillText(base.name, sp.x, sp.y - 10);

      // Shield bar
      if (base.maxShield > 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sp.x - barW / 2, sp.y - 6, barW, 3);
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(sp.x - barW / 2, sp.y - 6, barW * shieldPct, 3);
      }

      // Health bar
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(sp.x - barW / 2, sp.y - 2, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(sp.x - barW / 2, sp.y - 2, barW * hpPct, barH);

      if (base.captureProgress > 0) {
        const capPct = base.captureProgress / 100;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(sp.x - barW / 2, sp.y + 5, barW, 8);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(sp.x - barW / 2, sp.y + 5, barW * capPct, 8);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`CAPTURE ${base.captureProgress}%`, sp.x, sp.y + 12);
      }
    }

    // 2. Unit Health Bars & Faction Badges (Always show subtle tactical health bar like Alpha Force reference)
    for (const unit of this.units) {
      if (!this.isCellVisible(unit.x, unit.y)) continue;
      const st = this.unitStates.get(unit.id);
      const ux = st ? st.displayX : unit.x;
      const uz = st ? st.displayZ : unit.y;
      const uDef = UNIT_CATALOG[unit.type];
      const alt = uDef?.category === 'air' ? 3.15 : 0.72;

      const sp = this.worldToScreen(ux, uz, alt);
      if (!sp.visible) continue;

      const isSelected = this.selectedUnitIds.has(unit.id);
      const isPlayer = unit.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && unit.allianceId === this.userAllianceId;
      const isEnemy = unit.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);

      const maxHp = uDef?.maxHealth || unit.maxHealth;
      const hpPct = Math.max(0, unit.health / maxHp);

      if (isSelected || hpPct < 0.99 || this.smoothZoom >= 1.1) {
        const uBarW = isSelected ? 42 : 32;
        const uBarH = isSelected ? 4.5 : 3.5;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.fillRect(sp.x - uBarW / 2 - 1, sp.y - 1, uBarW + 2, uBarH + 2);

        const barColor = isEnemy
          ? '#ef4444'
          : hpPct > 0.5
          ? '#22c55e'
          : hpPct > 0.25
          ? '#eab308'
          : '#ef4444';
        ctx.fillStyle = barColor;
        ctx.fillRect(sp.x - uBarW / 2, sp.y, uBarW * hpPct, uBarH);

        if (isSelected) {
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(uDef?.name.split(' ')[0].toUpperCase() || unit.type, sp.x, sp.y - 4);
        }
      }
    }

    // 3. 3D Building Placement Ghost Label
    if (this.placementGhost) {
      const sp = this.worldToScreen(this.placementGhost.worldX, this.placementGhost.worldY, 1.2);
      if (sp.visible) {
        const bDef = BUILDING_CATALOG[this.placementGhost.buildingType];
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.placementGhost.isValid ? '#34d399' : '#f87171';
        ctx.fillText(
          this.placementGhost.isValid
            ? `[CLICK TO CONSTRUCT ${bDef?.name.toUpperCase()}]`
            : `[INVALID: ${this.placementGhost.reason}]`,
          sp.x,
          sp.y
        );
      }
    }

    // 4. Floating Damage Numbers
    this.damageTexts = this.damageTexts.filter((d) => now - d.startTime < d.durationMs);
    for (const dmg of this.damageTexts) {
      const t = (now - dmg.startTime) / dmg.durationMs;
      const sp = this.worldToScreen(dmg.x, dmg.z, dmg.y + t * 1.2);
      if (!sp.visible) continue;

      ctx.save();
      ctx.font = 'bold 12px "Chakra Petch", sans-serif';
      ctx.fillStyle = dmg.color;
      ctx.globalAlpha = Math.max(0, 1 - t * 0.85);
      ctx.textAlign = 'center';
      ctx.fillText(dmg.text, sp.x, sp.y);
      ctx.restore();
    }

    // 5. Drag-Selection Marquee Box
    if (this.selectionBox) {
      const { startX, startY, currentX, currentY } = this.selectionBox;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const boxW = Math.abs(currentX - startX);
      const boxH = Math.abs(currentY - startY);

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.fillRect(left, top, boxW, boxH);
      ctx.strokeRect(left, top, boxW, boxH);
      ctx.restore();
    }
  }

  public drawMinimap(minimapCanvas: HTMLCanvasElement) {
    const mCtx = minimapCanvas.getContext('2d');
    if (!mCtx || this.terrain.length === 0) return;

    const mW = minimapCanvas.width;
    const mH = minimapCanvas.height;
    const tW = this.terrain[0].length;
    const tH = this.terrain.length;

    const cellW = mW / tW;
    const cellH = mH / tH;

    for (let y = 0; y < tH; y++) {
      for (let x = 0; x < tW; x++) {
        const c = this.terrain[y][x];
        mCtx.fillStyle = assetManager.getTerrainColor(c);
        mCtx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Base Dots
    this.bases.forEach((b) => {
      const isPlayer = b.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && b.allianceId === this.userAllianceId;
      const isEnemy = base.ownerIsEnemy(b.ownerId, isPlayer, !!isAllied);

      mCtx.fillStyle = isPlayer ? '#3b82f6' : isAllied ? '#10b981' : isEnemy ? '#ef4444' : '#f59e0b';
      mCtx.beginPath();
      mCtx.arc(b.x * cellW, b.y * cellH, 4.5, 0, Math.PI * 2);
      mCtx.fill();
    });

    // Unit Dots
    const isFlashing = Date.now() < this.flashUnitsUntil;
    this.units.forEach((u) => {
      if (!this.isCellVisible(u.x, u.y)) return;
      const isPlayer = u.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && u.allianceId === this.userAllianceId;
      const isEnemy = u.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);

      if (isFlashing && isPlayer) {
        const pulse = 1.0 + Math.sin(Date.now() / 100) * 0.4;
        mCtx.fillStyle = '#ffffff';
        mCtx.beginPath();
        mCtx.arc(u.x * cellW, u.y * cellH, 6 * pulse, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.fillStyle = '#38bdf8';
        mCtx.beginPath();
        mCtx.arc(u.x * cellW, u.y * cellH, 3.5 * pulse, 0, Math.PI * 2);
        mCtx.fill();
      } else {
        mCtx.fillStyle = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';
        mCtx.fillRect(u.x * cellW - 1.5, u.y * cellH - 1.5, 3.2, 3.2);
      }
    });

    // 3D Camera Frustum Box on Minimap
    const viewSpanX = 24 / Math.max(0.42, this.smoothZoom);
    const viewSpanY = 18 / Math.max(0.42, this.smoothZoom);

    mCtx.save();
    mCtx.translate(this.smoothCamX * cellW, this.smoothCamY * cellH);
    mCtx.rotate(-this.smoothYaw);
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(
      (-viewSpanX / 2) * cellW,
      (-viewSpanY / 2) * cellH,
      viewSpanX * cellW,
      viewSpanY * cellH
    );
    mCtx.restore();
  }
}

function baseOwnerIsEnemy(ownerId: string, isPlayer: boolean, isAllied: boolean): boolean {
  return ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && ownerId !== 'neutral');
}
const base = { ownerIsEnemy: baseOwnerIsEnemy };
