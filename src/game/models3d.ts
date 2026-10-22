import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BuildingType, EnvironmentObject, TerrainType, UnitType } from '../types/game';
import { Terrain3DSystem } from './terrain3d';

const BUILDING_GLB_MAP: Partial<Record<BuildingType, string>> = {
  command_center: 'building-a',
  command_bunker: 'building-b',
  operations_center: 'building-c',
  comms_tower: 'building-d',
  military_gate: 'building-e',
  barracks: 'building-f',
  vehicle_factory: 'building-g',
  aviation_hangar: 'building-h',
  naval_dockyard: 'building-i',
  rail_depot: 'building-j',
  concrete_works: 'building-k',
  steel_foundry: 'building-l',
  aluminum_smelter: 'building-m',
  fuel_refinery: 'building-n',
  storage_depot: 'building-o',
  power_station: 'building-p',
  repair_depot: 'building-q',
  logistics_center: 'building-r',
  guard_tower: 'water-tower',
  radar_station: 'windmill',
};

function createTacticalColormapDataUrl(): string {
  const fallbackPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  if (typeof document === 'undefined') return fallbackPng;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallbackPng;

    // 8x8 grid of tactical military & industrial palette swatches matching Kenney UV layout
    const palette = [
      '#64748b', '#475569', '#334155', '#1e293b', '#94a3b8', '#cbd5e1', '#38bdf8', '#0284c7',
      '#57534e', '#44403c', '#292524', '#78716c', '#a8a29e', '#d6d3d1', '#f59e0b', '#d97706',
      '#3f6212', '#365314', '#1a2e05', '#4d7c0f', '#65a30d', '#84cc16', '#ef4444', '#b91c1c',
      '#374151', '#1f2937', '#111827', '#4b5563', '#6b7280', '#9ca3af', '#10b981', '#047857',
      '#52525b', '#3f3f46', '#27272a', '#71717a', '#a1a1aa', '#e4e4e7', '#06b6d4', '#0e7490',
      '#7c2d12', '#9a3412', '#431407', '#b45309', '#f97316', '#fbbf24', '#eab308', '#ca8a04',
      '#475569', '#334155', '#1e293b', '#0f172a', '#64748b', '#94a3b8', '#22d3ee', '#0891b2',
      '#334155', '#1e293b', '#0f172a', '#475569', '#64748b', '#cbd5e1', '#f43f5e', '#be123c',
    ];

    const cell = 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = palette[(y * 8 + x) % palette.length];
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    return canvas.toDataURL('image/png') || fallbackPng;
  } catch {
    return fallbackPng;
  }
}

export class Models3DRegistry {
  private loadingManager: THREE.LoadingManager;
  private loader: GLTFLoader;
  private glbCache = new Map<string, THREE.Group>();
  private loadingPromises = new Map<string, Promise<THREE.Group | null>>();
  private onModelLoadedCallbacks: (() => void)[] = [];

  // Shared reusable materials for performance
  private darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.35 });
  private gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.28 });
  private trackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.3, roughness: 0.85 });
  private concreteMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.1, roughness: 0.85 });
  private darkConcreteMat = new THREE.MeshStandardMaterial({ color: 0x27303f, metalness: 0.15, roughness: 0.8 });
  private glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.12 });
  private hazardMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.45 });
  private glowCyanMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  private glowRedMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xe11d48,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  private afterburnerMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });

  constructor() {
    const colormapDataUrl = createTacticalColormapDataUrl();
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.setURLModifier((url) => {
      if (url.toLowerCase().includes('colormap.png')) {
        return colormapDataUrl;
      }
      return url;
    });
    this.loader = new GLTFLoader(this.loadingManager);
    this.preloadKenneyModels();
  }

  public onModelsUpdated(cb: () => void) {
    this.onModelLoadedCallbacks.push(cb);
  }

  private preloadKenneyModels() {
    const uniqueFiles = new Set<string>(Object.values(BUILDING_GLB_MAP) as string[]);
    uniqueFiles.add('chimney-large');
    uniqueFiles.add('detail-tank-large');
    uniqueFiles.add('shipping-container-a');

    uniqueFiles.forEach((file) => {
      this.loadGlb(file);
    });
  }

  private loadGlb(file: string): Promise<THREE.Group | null> {
    if (this.glbCache.has(file)) {
      return Promise.resolve(this.glbCache.get(file)!);
    }
    if (this.loadingPromises.has(file)) {
      return this.loadingPromises.get(file)!;
    }

    const promise = new Promise<THREE.Group | null>((resolve) => {
      this.loader.load(
        `/assets/models/${file}.glb`,
        (gltf) => {
          const root = gltf.scene;
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxHoriz = Math.max(size.x, size.z, 0.001);
          const normScale = 0.85 / maxHoriz;

          const wrapper = new THREE.Group();
          root.scale.setScalar(normScale);
          root.position.set(-center.x * normScale, -box.min.y * normScale, -center.z * normScale);
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const mat = mesh.material as THREE.MeshStandardMaterial;
              if (mat && mat.map) {
                mat.map.magFilter = THREE.NearestFilter;
                mat.map.minFilter = THREE.NearestFilter;
                mat.map.needsUpdate = true;
              }
            }
          });
          wrapper.add(root);

          this.glbCache.set(file, wrapper);
          this.onModelLoadedCallbacks.forEach((cb) => cb());
          resolve(wrapper);
        },
        undefined,
        () => {
          resolve(null);
        }
      );
    });

    this.loadingPromises.set(file, promise);
    return promise;
  }

  // Create a distinct, articulated 3D military unit mesh (6–12 parts)
  public createUnitMesh(type: UnitType, teamColorHex: number): THREE.Group {
    const group = new THREE.Group();
    const teamMat = new THREE.MeshStandardMaterial({
      color: teamColorHex,
      metalness: 0.45,
      roughness: 0.42,
    });

    switch (type) {
      case 'vanguard_scout': {
        // Fast 4x4 Tactical Recon Buggy (Chassis, Rollcage, 4 Offroad Wheels, Roof MG Turret)
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.38), teamMat);
        chassis.position.y = 0.16;
        chassis.castShadow = true;
        group.add(chassis);

        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.32), this.darkMetalMat);
        nose.position.set(0.32, 0.15, 0);
        group.add(nose);

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.32), this.glassMat);
        cabin.position.set(-0.02, 0.28, 0);
        group.add(cabin);

        const wheelGeom = new THREE.CylinderGeometry(0.11, 0.11, 0.09, 10);
        wheelGeom.rotateX(Math.PI / 2);
        [
          [0.24, 0.11, 0.22],
          [0.24, 0.11, -0.22],
          [-0.24, 0.11, 0.22],
          [-0.24, 0.11, -0.22],
        ].forEach(([wx, wy, wz]) => {
          const w = new THREE.Mesh(wheelGeom, this.trackMat);
          w.position.set(wx, wy, wz);
          group.add(w);
        });

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(-0.05, 0.36, 0);
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), this.gunMetalMat);
        gun.rotation.z = Math.PI / 2;
        gun.position.set(0.14, 0, 0);
        gun.name = 'barrel';
        turret.add(gun);
        group.add(turret);
        break;
      }

      case 'ironclad_apc': {
        // 8-Wheeled Armored Personnel Carrier with Twin 30mm Autocannons
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.24, 0.48), teamMat);
        hull.position.y = 0.2;
        hull.castShadow = true;
        group.add(hull);

        const glacis = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.44), this.darkMetalMat);
        glacis.position.set(0.4, 0.18, 0);
        group.add(glacis);

        const wheelGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10);
        wheelGeom.rotateX(Math.PI / 2);
        [-0.3, -0.1, 0.1, 0.3].forEach((wx) => {
          const wL = new THREE.Mesh(wheelGeom, this.trackMat);
          wL.position.set(wx, 0.1, 0.26);
          const wR = new THREE.Mesh(wheelGeom, this.trackMat);
          wR.position.set(wx, 0.1, -0.26);
          group.add(wL, wR);
        });

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0.05, 0.36, 0);
        const tBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.26), this.darkMetalMat);
        turret.add(tBody);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6), this.gunMetalMat);
        b1.rotation.z = Math.PI / 2;
        b1.position.set(0.24, 0.02, 0.05);
        const b2 = b1.clone();
        b2.position.set(0.24, 0.02, -0.05);
        barrelGroup.add(b1, b2);
        turret.add(barrelGroup);
        group.add(turret);
        break;
      }

      case 'titan_mbt': {
        // Heavy Main Battle Tank (Dual Treads, Armored Skirt, Sloped Hull, Turret, 120mm Cannon, Muzzle Brake)
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.18, 0.16), this.trackMat);
        trackL.position.set(0, 0.09, 0.25);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.09, -0.25);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.2, 0.44), teamMat);
        hull.position.y = 0.2;
        hull.castShadow = true;
        group.add(hull);

        const reactiveArmor = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.58), this.darkMetalMat);
        reactiveArmor.position.y = 0.21;
        group.add(reactiveArmor);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(-0.02, 0.34, 0);

        const tMain = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.38), teamMat);
        tMain.castShadow = true;
        turret.add(tMain);

        const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 8), this.darkMetalMat);
        cupola.position.set(-0.08, 0.1, 0.08);
        turret.add(cupola);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.72, 10), this.gunMetalMat);
        cannon.rotation.z = Math.PI / 2;
        cannon.position.set(0.46, 0.01, 0);
        const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), this.hazardMat);
        muzzle.position.set(0.8, 0.01, 0);
        barrelGroup.add(cannon, muzzle);
        turret.add(barrelGroup);

        group.add(turret);
        break;
      }

      case 'goliath_howitzer': {
        // Self-Propelled Siege Artillery with Elevated 155mm Long-Range Barrel & Outriggers
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.2, 0.18), this.trackMat);
        trackL.position.set(0, 0.1, 0.27);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.1, -0.27);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.22, 0.48), teamMat);
        hull.position.y = 0.21;
        hull.castShadow = true;
        group.add(hull);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(-0.12, 0.38, 0);

        const breech = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.42), this.darkMetalMat);
        breech.castShadow = true;
        turret.add(breech);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        barrelGroup.rotation.z = 0.35; // Elevated artillery angle
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 1.05, 10), this.gunMetalMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(0.55, 0.06, 0);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), this.hazardMat);
        brake.rotation.z = Math.PI / 2;
        brake.position.set(1.06, 0.06, 0);
        barrelGroup.add(tube, brake);
        turret.add(barrelGroup);

        group.add(turret);
        break;
      }

      case 'skyguard_aa': {
        // Mobile Anti-Aircraft Flak & Radar Platform
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 0.15), this.trackMat);
        trackL.position.set(0, 0.09, 0.24);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.09, -0.24);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, 0.44), teamMat);
        hull.position.y = 0.2;
        hull.castShadow = true;
        group.add(hull);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 0.36, 0);

        const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 10), this.darkMetalMat);
        turret.add(dome);

        const radarDish = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.32), this.glowCyanMat);
        radarDish.position.set(-0.14, 0.18, 0);
        radarDish.name = 'radar';
        turret.add(radarDish);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        barrelGroup.rotation.z = 0.42;
        [-0.14, -0.05, 0.05, 0.14].forEach((zOff) => {
          const flak = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.56, 6), this.glowCyanMat);
          flak.rotation.z = Math.PI / 2;
          flak.position.set(0.28, 0.04, zOff);
          barrelGroup.add(flak);
        });
        turret.add(barrelGroup);
        group.add(turret);
        break;
      }

      case 'dominator_conquest': {
        // Heavy Command & Base Conquest Vehicle with Uplink Satellite Emitter
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.18), this.trackMat);
        trackL.position.set(0, 0.11, 0.28);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.11, -0.28);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.28, 0.52), teamMat);
        hull.position.y = 0.24;
        hull.castShadow = true;
        group.add(hull);

        const commandPod = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.42), this.darkMetalMat);
        commandPod.position.set(-0.08, 0.44, 0);
        group.add(commandPod);

        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 12), this.glowRedMat);
        beacon.position.set(0.05, 0.58, 0);
        beacon.name = 'radar';
        group.add(beacon);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 20), this.hazardMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0.05, 0.62, 0);
        group.add(ring);
        break;
      }

      case 'hawk_scout_heli':
      case 'cobra_gunship': {
        // Attack / Scout Helicopter with Cockpit Canopy, Stub Wings, Tail Boom, Spinning Main & Tail Rotors
        const isGunship = type === 'cobra_gunship';
        const fuselage = new THREE.Mesh(
          new THREE.BoxGeometry(isGunship ? 0.88 : 0.7, 0.22, isGunship ? 0.26 : 0.24),
          teamMat
        );
        fuselage.castShadow = true;
        group.add(fuselage);

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), this.glassMat);
        canopy.position.set(0.26, 0.02, 0);
        group.add(canopy);

        const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.08), this.darkMetalMat);
        tailBoom.position.set(-0.56, 0.04, 0);
        group.add(tailBoom);

        const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.04), teamMat);
        tailFin.position.set(-0.84, 0.12, 0);
        group.add(tailFin);

        if (isGunship) {
          const stubWings = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.68), this.darkMetalMat);
          stubWings.position.set(0.04, -0.02, 0);
          group.add(stubWings);

          const podL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), this.gunMetalMat);
          podL.rotation.z = Math.PI / 2;
          podL.position.set(0.06, -0.08, 0.26);
          const podR = podL.clone();
          podR.position.set(0.06, -0.08, -0.26);
          group.add(podL, podR);
        }

        // Main Rotor Group
        const rotorGroup = new THREE.Group();
        rotorGroup.name = 'rotor';
        rotorGroup.position.set(0, 0.16, 0);
        const blade1 = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.015, 0.07), this.gunMetalMat);
        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 1.35), this.gunMetalMat);
        rotorGroup.add(blade1, blade2);
        group.add(rotorGroup);

        break;
      }

      case 'stormbringer_jet':
      case 'thunderbolt_bomber': {
        // Supersonic Strike Jet / Heavy Stealth Bomber with Delta Wings, Twin Tail Fins & Glowing Afterburners
        const isBomber = type === 'thunderbolt_bomber';
        const bodyLen = isBomber ? 1.15 : 0.96;
        const wingSpan = isBomber ? 1.25 : 0.92;

        const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.16, bodyLen, 6), teamMat);
        fuselage.rotation.z = -Math.PI / 2;
        fuselage.castShadow = true;
        group.add(fuselage);

        const wings = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, wingSpan), teamMat);
        wings.position.set(-0.08, 0, 0);
        wings.castShadow = true;
        group.add(wings);

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.14), this.glassMat);
        canopy.position.set(0.18, 0.08, 0);
        group.add(canopy);

        const finL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.03), this.darkMetalMat);
        finL.position.set(-0.36, 0.1, 0.12);
        finL.rotation.x = 0.2;
        const finR = finL.clone();
        finR.position.set(-0.36, 0.1, -0.12);
        finR.rotation.x = -0.2;
        group.add(finL, finR);

        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.18, 8), this.afterburnerMat);
        burner.rotation.z = Math.PI / 2;
        burner.position.set(-bodyLen * 0.48, 0, 0);
        group.add(burner);
        break;
      }

      case 'wavecutter_corvette':
      case 'trident_destroyer': {
        // Naval Warship with Bow, Superstructure Bridge, Radar Mast & Naval Deck Turret
        const isDestroyer = type === 'trident_destroyer';
        const len = isDestroyer ? 1.35 : 0.98;
        const beam = isDestroyer ? 0.42 : 0.34;

        const hull = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, beam), teamMat);
        hull.position.y = 0.08;
        hull.castShadow = true;
        group.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(beam * 0.72, 0.42, 4), teamMat);
        bow.rotation.z = -Math.PI / 2;
        bow.rotation.x = Math.PI / 4;
        bow.position.set(len * 0.5 + 0.12, 0.08, 0);
        group.add(bow);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(len * 0.38, 0.24, beam * 0.72), this.darkMetalMat);
        bridge.position.set(-0.08, 0.28, 0);
        group.add(bridge);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.28, 6), this.gunMetalMat);
        mast.position.set(-0.12, 0.48, 0);
        group.add(mast);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(len * 0.28, 0.22, 0);
        const gunHouse = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.16), this.gunMetalMat);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), this.darkMetalMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0.18, 0.02, 0);
        barrel.name = 'barrel';
        turret.add(gunHouse, barrel);
        group.add(turret);
        break;
      }

      case 'iron_dreadnought': {
        // Heavy Armored Siege Train with Twin Railgun Turrets
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.28, 0.48), this.darkMetalMat);
        chassis.position.y = 0.16;
        chassis.castShadow = true;
        group.add(chassis);

        const armorPlating = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.22, 0.52), teamMat);
        armorPlating.position.y = 0.26;
        group.add(armorPlating);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0.2, 0.42, 0);
        const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 10), this.hazardMat);
        const railgun = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.14), this.glowCyanMat);
        railgun.position.set(0.32, 0.02, 0);
        railgun.name = 'barrel';
        turret.add(tBody, railgun);
        group.add(turret);
        break;
      }
    }

    return group;
  }

  // Create a 3D base building mesh (Hybrid Kenney GLB + Military Tactical Attachments)
  public createBuildingMesh(
    type: BuildingType,
    teamColorHex: number,
    isConstructing: boolean = false
  ): THREE.Group {
    const group = new THREE.Group();
    const teamMat = new THREE.MeshStandardMaterial({
      color: teamColorHex,
      metalness: 0.5,
      roughness: 0.4,
    });

    // Concrete foundation pad with team accent trim
    const padSize = type === 'command_center' ? 1.45 : 0.92;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(padSize, 0.08, padSize), this.darkConcreteMat);
    pad.position.y = 0.04;
    pad.receiveShadow = true;
    group.add(pad);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(padSize + 0.04, 0.04, padSize + 0.04), teamMat);
    trim.position.y = 0.02;
    group.add(trim);

    if (isConstructing) {
      // 3D Scaffolding wireframe + crane jib for buildings under construction
      const scaf = new THREE.Mesh(
        new THREE.BoxGeometry(padSize * 0.85, 0.75, padSize * 0.85),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, wireframe: true })
      );
      scaf.position.y = 0.42;
      group.add(scaf);

      const core = new THREE.Mesh(
        new THREE.BoxGeometry(padSize * 0.65, 0.38, padSize * 0.65),
        this.concreteMat
      );
      core.position.y = 0.22;
      group.add(core);
      return group;
    }

    // Check if Kenney GLB model is available for this building
    const glbKey = BUILDING_GLB_MAP[type];
    if (glbKey && this.glbCache.has(glbKey)) {
      const clonedGlb = this.glbCache.get(glbKey)!.clone(true);
      const scaleMult = type === 'command_center' ? 1.45 : 0.95;
      clonedGlb.scale.setScalar(scaleMult);
      clonedGlb.position.y = 0.08;
      group.add(clonedGlb);
    } else {
      // High-detail procedural military structure body
      this.addProceduralBuildingBody(group, type, teamMat, padSize);
    }

    // Add animated / functional military topper (radar dish, turret barrels, helipad, smokestack)
    this.addMilitaryTopper(group, type, teamMat);

    return group;
  }

  private addProceduralBuildingBody(
    group: THREE.Group,
    type: BuildingType,
    teamMat: THREE.Material,
    padSize: number
  ) {
    if (type === 'command_center') {
      const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.2), this.concreteMat);
      baseBlock.position.y = 0.35;
      baseBlock.castShadow = true;
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.75), teamMat);
      upper.position.y = 0.82;
      upper.castShadow = true;
      group.add(baseBlock, upper);
    } else if (
      type === 'vulcan_turret' ||
      type === 'sam_launcher' ||
      type === 'coastal_battery' ||
      type === 'mg_turret' ||
      type === 'artillery_post'
    ) {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.32, 8), this.concreteMat);
      pedestal.position.y = 0.22;
      pedestal.castShadow = true;
      group.add(pedestal);
    } else {
      const mainH = type === 'comms_tower' || type === 'guard_tower' ? 0.95 : 0.48;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(padSize * 0.78, mainH, padSize * 0.78),
        this.concreteMat
      );
      body.position.y = 0.08 + mainH / 2;
      body.castShadow = true;
      group.add(body);
    }
  }

  private addMilitaryTopper(group: THREE.Group, type: BuildingType, teamMat: THREE.Material) {
    if (type === 'command_center' || type === 'radar_station' || type === 'comms_tower') {
      const radarGroup = new THREE.Group();
      radarGroup.name = 'radar';
      radarGroup.position.set(0, type === 'command_center' ? 1.15 : 0.95, 0);
      const dish = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), this.glowCyanMat);
      dish.rotation.x = -0.35;
      radarGroup.add(dish);
      group.add(radarGroup);
    } else if (
      type === 'vulcan_turret' ||
      type === 'sam_launcher' ||
      type === 'coastal_battery' ||
      type === 'mg_turret' ||
      type === 'artillery_post'
    ) {
      const turretGroup = new THREE.Group();
      turretGroup.name = 'radar'; // Rotates smoothly to scan sector
      turretGroup.position.set(0, 0.45, 0);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.34), teamMat);
      turretGroup.add(head);

      if (type === 'sam_launcher') {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.28), this.hazardMat);
        rack.position.set(0.08, 0.14, 0);
        rack.rotation.z = 0.45;
        turretGroup.add(rack);
      } else {
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), this.gunMetalMat);
        b1.rotation.z = Math.PI / 2;
        b1.position.set(0.28, 0.04, 0.06);
        const b2 = b1.clone();
        b2.position.set(0.28, 0.04, -0.06);
        turretGroup.add(b1, b2);
      }

      group.add(turretGroup);
    } else if (type === 'aviation_hangar') {
      const helipad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16), this.hazardMat);
      helipad.position.set(0, 0.09, 0);
      group.add(helipad);
    }
  }

  // Build InstancedMesh batches for all battlefield trees, rocks, craters, bunkers & fortifications
  public buildInstancedEnvironmentProps(
    envObjects: EnvironmentObject[],
    terrainSys: Terrain3DSystem,
    terrainGrid: TerrainType[][]
  ): THREE.Group {
    const propGroup = new THREE.Group();
    if (!envObjects || envObjects.length === 0) return propGroup;

    const trees = envObjects.filter((o) => o.type.startsWith('tree_'));
    const bushes = envObjects.filter((o) => o.type === 'bush' || o.type === 'fern_cluster');
    const rocks = envObjects.filter((o) => o.type === 'boulder' || o.type === 'cliff_rock' || o.type === 'fallen_log');
    const craters = envObjects.filter((o) => o.type === 'crater_large' || o.type === 'crater_small');
    const structures = envObjects.filter(
      (o) =>
        o.type === 'bunker' ||
        o.type === 'watchtower' ||
        o.type === 'sandbags' ||
        o.type === 'barricade' ||
        o.type === 'ruined_tank' ||
        o.type === 'fuel_drums' ||
        o.type === 'crate_stack' ||
        o.type === 'camo_tent' ||
        o.type === 'radar_dish'
    );

    const dummy = new THREE.Object3D();

    // 1. Instanced 3D Trees (Trunk + Multi-Tiered Canopy)
    if (trees.length > 0) {
      const trunkGeom = new THREE.CylinderGeometry(0.06, 0.09, 0.45, 6);
      trunkGeom.translate(0, 0.22, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x452c1e, roughness: 0.9 });
      const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, trees.length);
      trunkInst.castShadow = true;

      const foliageGeom = new THREE.ConeGeometry(0.36, 0.82, 7);
      foliageGeom.translate(0, 0.65, 0);
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1e4620, roughness: 0.82 });
      const foliageInst = new THREE.InstancedMesh(foliageGeom, foliageMat, trees.length);
      foliageInst.castShadow = true;
      foliageInst.receiveShadow = true;

      const color = new THREE.Color();

      trees.forEach((t, i) => {
        const gy = terrainSys.groundHeightAt(t.x, t.y, terrainGrid);
        const s = (t.scale || 1.0) * 0.9;
        dummy.position.set(t.x, gy, t.y);
        dummy.rotation.set(0, t.rotation || i * 1.1, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();

        trunkInst.setMatrixAt(i, dummy.matrix);
        foliageInst.setMatrixAt(i, dummy.matrix);

        if (t.type === 'tree_pine' || t.type === 'tree_cedar') {
          color.setHex(0x16381c);
        } else if (t.type === 'tree_birch') {
          color.setHex(0x3a6b2c);
        } else {
          color.setHex(0x234d20);
        }
        foliageInst.setColorAt(i, color);
      });

      trunkInst.instanceMatrix.needsUpdate = true;
      trunkInst.computeBoundingSphere();
      foliageInst.instanceMatrix.needsUpdate = true;
      if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;
      foliageInst.computeBoundingSphere();

      propGroup.add(trunkInst, foliageInst);
    }

    // 2. Instanced 3D Undergrowth Bushes
    if (bushes.length > 0) {
      const bushGeom = new THREE.DodecahedronGeometry(0.22, 0);
      bushGeom.translate(0, 0.14, 0);
      const bushMat = new THREE.MeshStandardMaterial({ color: 0x295224, roughness: 0.88 });
      const bushInst = new THREE.InstancedMesh(bushGeom, bushMat, bushes.length);

      bushes.forEach((b, i) => {
        const gy = terrainSys.groundHeightAt(b.x, b.y, terrainGrid);
        const s = (b.scale || 1.0) * 0.85;
        dummy.position.set(b.x, gy, b.y);
        dummy.rotation.set(0, i * 0.7, 0);
        dummy.scale.set(s, s * 0.75, s);
        dummy.updateMatrix();
        bushInst.setMatrixAt(i, dummy.matrix);
      });

      bushInst.instanceMatrix.needsUpdate = true;
      bushInst.computeBoundingSphere();
      propGroup.add(bushInst);
    }

    // 3. Instanced 3D Boulders & Cliff Outcrops
    if (rocks.length > 0) {
      const rockGeom = new THREE.DodecahedronGeometry(0.32, 0);
      rockGeom.translate(0, 0.18, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.1 });
      const rockInst = new THREE.InstancedMesh(rockGeom, rockMat, rocks.length);
      rockInst.castShadow = true;
      rockInst.receiveShadow = true;

      rocks.forEach((r, i) => {
        const gy = terrainSys.groundHeightAt(r.x, r.y, terrainGrid);
        const s = (r.scale || 1.0) * (r.type === 'cliff_rock' ? 1.35 : 0.9);
        dummy.position.set(r.x, gy, r.y);
        dummy.rotation.set(i * 0.3, r.rotation || i * 1.2, 0);
        dummy.scale.set(s, s * 0.8, s * 1.1);
        dummy.updateMatrix();
        rockInst.setMatrixAt(i, dummy.matrix);
      });

      rockInst.instanceMatrix.needsUpdate = true;
      rockInst.computeBoundingSphere();
      propGroup.add(rockInst);
    }

    // 4. Instanced 3D Blast Craters
    if (craters.length > 0) {
      const craterGeom = new THREE.RingGeometry(0.12, 0.42, 12);
      craterGeom.rotateX(-Math.PI / 2);
      const craterMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.95 });
      const craterInst = new THREE.InstancedMesh(craterGeom, craterMat, craters.length);

      craters.forEach((c, i) => {
        const gy = terrainSys.groundHeightAt(c.x, c.y, terrainGrid);
        const s = c.type === 'crater_large' ? 1.4 : 0.85;
        dummy.position.set(c.x, gy + 0.02, c.y);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, 1, s);
        dummy.updateMatrix();
        craterInst.setMatrixAt(i, dummy.matrix);
      });

      craterInst.instanceMatrix.needsUpdate = true;
      craterInst.computeBoundingSphere();
      propGroup.add(craterInst);
    }

    // 5. Instanced 3D Field Bunkers, Watchtowers, Sandbags & Anti-Tank Hedgehogs
    if (structures.length > 0) {
      const structGeom = new THREE.BoxGeometry(0.52, 0.38, 0.46);
      structGeom.translate(0, 0.19, 0);
      const structInst = new THREE.InstancedMesh(structGeom, this.concreteMat, structures.length);
      structInst.castShadow = true;
      structInst.receiveShadow = true;

      structures.forEach((st, i) => {
        const gy = terrainSys.groundHeightAt(st.x, st.y, terrainGrid);
        const s = st.scale || 1.0;
        dummy.position.set(st.x, gy, st.y);
        dummy.rotation.set(0, st.rotation || 0, 0);
        if (st.type === 'watchtower') {
          dummy.scale.set(s * 0.7, s * 1.9, s * 0.7);
        } else if (st.type === 'sandbags' || st.type === 'barricade') {
          dummy.scale.set(s * 0.9, s * 0.45, s * 0.45);
        } else {
          dummy.scale.set(s, s, s);
        }
        dummy.updateMatrix();
        structInst.setMatrixAt(i, dummy.matrix);
      });

      structInst.instanceMatrix.needsUpdate = true;
      structInst.computeBoundingSphere();
      propGroup.add(structInst);
    }

    return propGroup;
  }
}
