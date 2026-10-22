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

export class Models3DRegistry {
  private loader: GLTFLoader;
  private glbCache = new Map<string, THREE.Group>();
  private loadingPromises = new Map<string, Promise<THREE.Group | null>>();
  private onModelLoadedCallbacks: (() => void)[] = [];

  // Shared reusable PBR materials for high performance
  private darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x222b38, metalness: 0.68, roughness: 0.36 });
  private oliveDrabMat = new THREE.MeshStandardMaterial({ color: 0x3b4935, metalness: 0.28, roughness: 0.62 });
  private gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x384352, metalness: 0.82, roughness: 0.25 });
  private trackMat = new THREE.MeshStandardMaterial({ color: 0x161b22, metalness: 0.25, roughness: 0.88 });
  private concreteMat = new THREE.MeshStandardMaterial({ color: 0x56616e, metalness: 0.08, roughness: 0.86 });
  private darkConcreteMat = new THREE.MeshStandardMaterial({ color: 0x2b3441, metalness: 0.12, roughness: 0.82 });
  private sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8c7b5c, metalness: 0.04, roughness: 0.92 });
  private skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, metalness: 0.05, roughness: 0.75 });
  private glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.92, roughness: 0.1 });
  private hazardMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.45 });
  private glowCyanMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
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
    emissiveIntensity: 2.4,
    roughness: 0.2,
  });

  constructor() {
    this.loader = new GLTFLoader();
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
          const normScale = 0.88 / maxHoriz;

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
                mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.roughness = 0.65;
                mat.metalness = 0.2;
                mat.needsUpdate = true;
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

  // Create a realistic, articulated 3D military unit mesh
  public createUnitMesh(type: UnitType, teamColorHex: number): THREE.Group {
    const group = new THREE.Group();
    const teamMat = new THREE.MeshStandardMaterial({
      color: teamColorHex,
      metalness: 0.42,
      roughness: 0.44,
    });

    switch (type) {
      case 'rifle_infantry': {
        // 4-Soldier Tactical Rifle Fireteam in Staggered Diamond Formation
        const offsets: [number, number][] = [
          [0.18, 0.0],
          [-0.04, 0.2],
          [-0.04, -0.2],
          [-0.24, 0.04],
        ];

        const legGeom = new THREE.BoxGeometry(0.048, 0.14, 0.048);
        legGeom.translate(0, -0.07, 0);
        const torsoGeom = new THREE.BoxGeometry(0.09, 0.16, 0.11);
        const packGeom = new THREE.BoxGeometry(0.06, 0.12, 0.08);
        const headGeom = new THREE.SphereGeometry(0.048, 8, 8);
        const helmetGeom = new THREE.SphereGeometry(0.056, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
        const rifleBodyGeom = new THREE.BoxGeometry(0.22, 0.032, 0.025);
        const rifleBarrelGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.14, 6);
        rifleBarrelGeom.rotateZ(Math.PI / 2);

        offsets.forEach(([ox, oz], idx) => {
          const soldier = new THREE.Group();
          soldier.name = `soldier_${idx}`;
          soldier.position.set(ox, 0, oz);

          // Articulated legs
          const legL = new THREE.Mesh(legGeom, this.oliveDrabMat);
          legL.name = 'legL';
          legL.position.set(0, 0.14, 0.03);
          legL.castShadow = true;

          const legR = new THREE.Mesh(legGeom, this.oliveDrabMat);
          legR.name = 'legR';
          legR.position.set(0, 0.14, -0.03);
          legR.castShadow = true;
          soldier.add(legL, legR);

          // Armored Torso + Team Plate Carrier
          const torso = new THREE.Mesh(torsoGeom, teamMat);
          torso.position.set(0, 0.22, 0);
          torso.castShadow = true;
          soldier.add(torso);

          // Tactical Rucksack
          const pack = new THREE.Mesh(packGeom, this.oliveDrabMat);
          pack.position.set(-0.06, 0.23, 0);
          soldier.add(pack);

          // Head & Ballistic Helmet + Goggles
          const head = new THREE.Mesh(headGeom, this.skinMat);
          head.position.set(0, 0.34, 0);
          const helmet = new THREE.Mesh(helmetGeom, this.darkMetalMat);
          helmet.position.set(0, 0.35, 0);
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.075), this.glassMat);
          visor.position.set(0.04, 0.345, 0);
          soldier.add(head, helmet, visor);

          // Assault Carbine + Muzzle
          const weaponGroup = new THREE.Group();
          if (idx === 0) weaponGroup.name = 'barrel';
          weaponGroup.position.set(0.09, 0.23, 0.045);
          const rifle = new THREE.Mesh(rifleBodyGeom, this.darkMetalMat);
          const rBarrel = new THREE.Mesh(rifleBarrelGeom, this.gunMetalMat);
          rBarrel.position.set(0.14, 0.005, 0);
          weaponGroup.add(rifle, rBarrel);
          soldier.add(weaponGroup);

          group.add(soldier);
        });
        break;
      }

      case 'vanguard_scout': {
        // Armored 4x4 Tactical Recon Vehicle (Humvee / Fennek silhouette)
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.16, 0.42), this.oliveDrabMat);
        chassis.position.y = 0.16;
        chassis.castShadow = true;
        group.add(chassis);

        // Team armor trim & sloped hood
        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.38), teamMat);
        hood.position.set(0.24, 0.2, 0);
        hood.rotation.z = -0.12;
        hood.castShadow = true;
        group.add(hood);

        // Front bull-bar & headlights
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.42), this.darkMetalMat);
        bumper.position.set(0.41, 0.15, 0);
        const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.06), this.glowCyanMat);
        lightL.position.set(0.42, 0.18, 0.14);
        const lightR = lightL.clone();
        lightR.position.z = -0.14;
        group.add(bumper, lightL, lightR);

        // Armored Crew Cab & Ballistic Windshield
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.38), teamMat);
        cab.position.set(-0.06, 0.29, 0);
        cab.castShadow = true;
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34), this.glassMat);
        windshield.position.set(0.12, 0.3, 0);
        windshield.rotation.z = -0.25;
        group.add(cab, windshield);

        // 4 Off-road Wheels + Hubcaps + Rear Spare Tire
        const wheelGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.09, 12);
        wheelGeom.rotateX(Math.PI / 2);
        const hubGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8);
        hubGeom.rotateX(Math.PI / 2);
        [
          [0.24, 0.12, 0.23],
          [0.24, 0.12, -0.23],
          [-0.24, 0.12, 0.23],
          [-0.24, 0.12, -0.23],
        ].forEach(([wx, wy, wz]) => {
          const w = new THREE.Mesh(wheelGeom, this.trackMat);
          w.position.set(wx, wy, wz);
          const hub = new THREE.Mesh(hubGeom, this.gunMetalMat);
          hub.position.set(wx, wy, wz);
          group.add(w, hub);
        });

        // Roof CROWS Remote Weapon Station
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(-0.04, 0.4, 0);
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 8), this.darkMetalMat);
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.38, 8), this.gunMetalMat);
        gun.rotation.z = Math.PI / 2;
        gun.position.set(0.16, 0.03, 0);
        gun.name = 'barrel';
        turret.add(mount, gun);
        group.add(turret);
        break;
      }

      case 'ironclad_apc': {
        // 8x8 Stryker / BTR Heavy Armored Personnel Carrier
        const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.48), this.oliveDrabMat);
        lowerHull.position.y = 0.16;
        lowerHull.castShadow = true;
        group.add(lowerHull);

        const upperHull = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.46), teamMat);
        upperHull.position.set(-0.02, 0.28, 0);
        upperHull.castShadow = true;
        group.add(upperHull);

        // Sloped amphibious bow glacis
        const glacis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.44), this.darkMetalMat);
        glacis.position.set(0.42, 0.22, 0);
        glacis.rotation.z = -0.28;
        group.add(glacis);

        // Side applique armor skirts
        const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.04), this.darkMetalMat);
        skirtL.position.set(-0.02, 0.24, 0.25);
        const skirtR = skirtL.clone();
        skirtR.position.z = -0.25;
        group.add(skirtL, skirtR);

        // 8 Off-road Wheels + Armored Hubs
        const wheelGeom = new THREE.CylinderGeometry(0.105, 0.105, 0.085, 12);
        wheelGeom.rotateX(Math.PI / 2);
        const hubGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.095, 8);
        hubGeom.rotateX(Math.PI / 2);
        [-0.33, -0.11, 0.11, 0.33].forEach((wx) => {
          [0.25, -0.25].forEach((wz) => {
            const w = new THREE.Mesh(wheelGeom, this.trackMat);
            w.position.set(wx, 0.105, wz);
            const h = new THREE.Mesh(hubGeom, this.gunMetalMat);
            h.position.set(wx, 0.105, wz);
            group.add(w, h);
          });
        });

        // Rotating Unmanned Turret with Twin 30mm Autocannons + ATGM Pod
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0.06, 0.4, 0);
        const tBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.28), this.darkMetalMat);
        tBody.castShadow = true;
        const atgmPod = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.09), this.hazardMat);
        atgmPod.position.set(-0.02, 0.06, 0.17);
        turret.add(tBody, atgmPod);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.46, 8), this.gunMetalMat);
        b1.rotation.z = Math.PI / 2;
        b1.position.set(0.26, 0.02, 0.05);
        const b2 = b1.clone();
        b2.position.set(0.26, 0.02, -0.05);
        barrelGroup.add(b1, b2);
        turret.add(barrelGroup);
        group.add(turret);
        break;
      }

      case 'titan_mbt': {
        // Heavy Main Battle Tank (M1A2 / Leopard 2A7 Composite Silhouette)
        // 1. Track Modules + 6 Roadwheels per side
        const trackGeom = new THREE.BoxGeometry(1.04, 0.18, 0.16);
        const trackL = new THREE.Mesh(trackGeom, this.trackMat);
        trackL.position.set(0, 0.09, 0.27);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.09, -0.27);
        group.add(trackL, trackR);

        const roadWheelGeom = new THREE.CylinderGeometry(0.075, 0.075, 0.18, 10);
        roadWheelGeom.rotateX(Math.PI / 2);
        [-0.38, -0.23, -0.08, 0.08, 0.23, 0.38].forEach((wx) => {
          const rwL = new THREE.Mesh(roadWheelGeom, this.gunMetalMat);
          rwL.position.set(wx, 0.085, 0.27);
          const rwR = rwL.clone();
          rwR.position.z = -0.27;
          group.add(rwL, rwR);
        });

        // 2. Armored Chassis, Sloped Glacis & Side Ballistic Skirts
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.18, 0.48), this.oliveDrabMat);
        hull.position.y = 0.2;
        hull.castShadow = true;
        group.add(hull);

        const glacis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.46), teamMat);
        glacis.position.set(0.4, 0.22, 0);
        glacis.rotation.z = -0.22;
        glacis.castShadow = true;
        group.add(glacis);

        const sideSkirtL = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.11, 0.05), teamMat);
        sideSkirtL.position.set(0, 0.21, 0.34);
        const sideSkirtR = sideSkirtL.clone();
        sideSkirtR.position.z = -0.34;
        group.add(sideSkirtL, sideSkirtR);

        // Rear engine louver deck
        const engineDeck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.42), this.darkMetalMat);
        engineDeck.position.set(-0.32, 0.3, 0);
        group.add(engineDeck);

        // 3. Articulated Turret with Wedge Cheeks, Bustle Rack, Commander Cupola & 120mm L/55 Smoothbore Cannon
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0.02, 0.35, 0);

        const tMain = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.17, 0.44), teamMat);
        tMain.castShadow = true;
        turret.add(tMain);

        // Angled wedge armor cheeks
        const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.18), this.darkMetalMat);
        cheekL.position.set(0.24, 0, 0.12);
        cheekL.rotation.y = 0.28;
        const cheekR = cheekL.clone();
        cheekR.position.z = -0.12;
        cheekR.rotation.y = -0.28;
        turret.add(cheekL, cheekR);

        // Rear ammo bustle rack
        const bustle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.38), this.oliveDrabMat);
        bustle.position.set(-0.34, 0.01, 0);
        turret.add(bustle);

        // Commander cupola + thermal sight
        const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 10), this.darkMetalMat);
        cupola.position.set(-0.08, 0.11, 0.1);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.08), this.glassMat);
        sight.position.set(0.14, 0.11, -0.1);
        turret.add(cupola, sight);

        // 120mm Smoothbore Barrel + Bore Evacuator (Fume Extractor) + Muzzle Reference
        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.82, 12), this.gunMetalMat);
        cannon.rotation.z = Math.PI / 2;
        cannon.position.set(0.52, 0.01, 0);
        cannon.castShadow = true;

        const evacuator = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.18, 12), this.darkMetalMat);
        evacuator.rotation.z = Math.PI / 2;
        evacuator.position.set(0.46, 0.01, 0);

        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), this.hazardMat);
        muzzle.rotation.z = Math.PI / 2;
        muzzle.position.set(0.92, 0.01, 0);

        barrelGroup.add(cannon, evacuator, muzzle);
        turret.add(barrelGroup);

        group.add(turret);
        break;
      }

      case 'goliath_howitzer': {
        // 155mm Self-Propelled Siege Artillery (PzH 2000 / M109A7 Silhouette)
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.2, 0.18), this.trackMat);
        trackL.position.set(0, 0.1, 0.28);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.1, -0.28);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.5), this.oliveDrabMat);
        hull.position.y = 0.21;
        hull.castShadow = true;
        group.add(hull);

        // Rear recoil stabilizer spades
        const spade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.46), this.darkMetalMat);
        spade.position.set(-0.52, 0.08, 0);
        group.add(spade);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(-0.14, 0.38, 0);

        const breech = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.26, 0.44), teamMat);
        breech.castShadow = true;
        turret.add(breech);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        barrelGroup.rotation.z = 0.36; // Elevated howitzer firing angle
        const recoilCradle = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.14), this.darkMetalMat);
        recoilCradle.position.set(0.24, 0.05, 0);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.12, 12), this.gunMetalMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(0.62, 0.05, 0);
        tube.castShadow = true;
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), this.hazardMat);
        brake.rotation.z = Math.PI / 2;
        brake.position.set(1.16, 0.05, 0);
        barrelGroup.add(recoilCradle, tube, brake);
        turret.add(barrelGroup);

        group.add(turret);
        break;
      }

      case 'skyguard_aa': {
        // Mobile Radar Flak & SAM Platform
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.18, 0.16), this.trackMat);
        trackL.position.set(0, 0.09, 0.25);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.09, -0.25);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.46), teamMat);
        hull.position.y = 0.2;
        hull.castShadow = true;
        group.add(hull);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 0.36, 0);

        const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 12), this.darkMetalMat);
        turret.add(dome);

        const radarDish = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.36), this.glowCyanMat);
        radarDish.position.set(-0.14, 0.2, 0);
        radarDish.name = 'radar';
        turret.add(radarDish);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'barrel';
        barrelGroup.rotation.z = 0.45;
        [-0.15, -0.06, 0.06, 0.15].forEach((zOff) => {
          const flak = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.58, 8), this.gunMetalMat);
          flak.rotation.z = Math.PI / 2;
          flak.position.set(0.28, 0.04, zOff);
          barrelGroup.add(flak);
        });
        turret.add(barrelGroup);
        group.add(turret);
        break;
      }

      case 'dominator_conquest': {
        // Heavy Armored Mobile Command & Sector Capture Vehicle
        const trackL = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.22, 0.18), this.trackMat);
        trackL.position.set(0, 0.11, 0.29);
        const trackR = trackL.clone();
        trackR.position.set(0, 0.11, -0.29);
        group.add(trackL, trackR);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.28, 0.54), teamMat);
        hull.position.y = 0.24;
        hull.castShadow = true;
        group.add(hull);

        const commandPod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.44), this.darkMetalMat);
        commandPod.position.set(-0.06, 0.45, 0);
        commandPod.castShadow = true;
        group.add(commandPod);

        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 12), this.glowCyanMat);
        beacon.position.set(0.05, 0.6, 0);
        beacon.name = 'radar';
        group.add(beacon);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 24), this.hazardMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0.05, 0.64, 0);
        group.add(ring);
        break;
      }

      case 'hawk_scout_heli':
      case 'cobra_gunship': {
        // Attack / Recon Helicopter with Tandem Canopy, Stub Wings, Hellfire Pods, Skids & Dual Rotors
        const isGunship = type === 'cobra_gunship';
        const fuselage = new THREE.Mesh(
          new THREE.BoxGeometry(isGunship ? 0.94 : 0.74, 0.22, isGunship ? 0.26 : 0.24),
          teamMat
        );
        fuselage.castShadow = true;
        group.add(fuselage);

        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), this.darkMetalMat);
        nose.rotation.z = -Math.PI / 2;
        nose.position.set(isGunship ? 0.56 : 0.46, -0.02, 0);
        group.add(nose);

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.22), this.glassMat);
        canopy.position.set(0.24, 0.06, 0);
        group.add(canopy);

        // Landing skids
        [-0.14, 0.14].forEach((zOff) => {
          const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.65, 6), this.darkMetalMat);
          skid.rotation.z = Math.PI / 2;
          skid.position.set(0.05, -0.16, zOff);
          group.add(skid);
        });

        const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.08), this.darkMetalMat);
        tailBoom.position.set(-0.58, 0.04, 0);
        group.add(tailBoom);

        const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.04), teamMat);
        tailFin.position.set(-0.88, 0.12, 0);
        group.add(tailFin);

        // Chin turret barrel
        const chinGun = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), this.gunMetalMat);
        chinGun.rotation.z = Math.PI / 2;
        chinGun.position.set(0.52, -0.1, 0);
        chinGun.name = 'barrel';
        group.add(chinGun);

        if (isGunship) {
          const stubWings = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.76), this.darkMetalMat);
          stubWings.position.set(0.04, 0.0, 0);
          group.add(stubWings);

          const podL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.34, 8), this.gunMetalMat);
          podL.rotation.z = Math.PI / 2;
          podL.position.set(0.06, -0.07, 0.28);
          const podR = podL.clone();
          podR.position.set(0.06, -0.07, -0.28);
          group.add(podL, podR);
        }

        // Main 4-Blade Rotor Group
        const rotorGroup = new THREE.Group();
        rotorGroup.name = 'rotor';
        rotorGroup.position.set(0, 0.17, 0);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), this.darkMetalMat);
        const blade1 = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.015, 0.075), this.gunMetalMat);
        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.015, 1.48), this.gunMetalMat);
        rotorGroup.add(mast, blade1, blade2);
        group.add(rotorGroup);
        break;
      }

      case 'stormbringer_jet':
      case 'thunderbolt_bomber': {
        const isBomber = type === 'thunderbolt_bomber';
        const bodyLen = isBomber ? 1.22 : 1.02;
        const wingSpan = isBomber ? 1.34 : 0.98;

        const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.17, bodyLen, 8), teamMat);
        fuselage.rotation.z = -Math.PI / 2;
        fuselage.castShadow = true;
        group.add(fuselage);

        const wings = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, wingSpan), teamMat);
        wings.position.set(-0.08, 0, 0);
        wings.castShadow = true;
        group.add(wings);

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.15), this.glassMat);
        canopy.position.set(0.2, 0.08, 0);
        group.add(canopy);

        const finL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.03), this.darkMetalMat);
        finL.position.set(-0.38, 0.11, 0.13);
        finL.rotation.x = 0.22;
        const finR = finL.clone();
        finR.position.set(-0.38, 0.11, -0.13);
        finR.rotation.x = -0.22;
        group.add(finL, finR);

        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.055, 0.2, 10), this.afterburnerMat);
        burner.rotation.z = Math.PI / 2;
        burner.position.set(-bodyLen * 0.48, 0, 0);
        group.add(burner);
        break;
      }

      case 'wavecutter_corvette':
      case 'trident_destroyer': {
        const isDestroyer = type === 'trident_destroyer';
        const len = isDestroyer ? 1.42 : 1.04;
        const beam = isDestroyer ? 0.44 : 0.36;

        const hull = new THREE.Mesh(new THREE.BoxGeometry(len, 0.24, beam), teamMat);
        hull.position.y = 0.09;
        hull.castShadow = true;
        group.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(beam * 0.72, 0.44, 4), teamMat);
        bow.rotation.z = -Math.PI / 2;
        bow.rotation.x = Math.PI / 4;
        bow.position.set(len * 0.5 + 0.12, 0.09, 0);
        group.add(bow);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(len * 0.38, 0.26, beam * 0.74), this.darkMetalMat);
        bridge.position.set(-0.08, 0.3, 0);
        group.add(bridge);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.32, 6), this.gunMetalMat);
        mast.position.set(-0.12, 0.5, 0);
        group.add(mast);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(len * 0.28, 0.24, 0);
        const gunHouse = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.18), this.gunMetalMat);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), this.darkMetalMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0.2, 0.02, 0);
        barrel.name = 'barrel';
        turret.add(gunHouse, barrel);
        group.add(turret);
        break;
      }

      case 'iron_dreadnought': {
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.28, 0.5), this.darkMetalMat);
        chassis.position.y = 0.16;
        chassis.castShadow = true;
        group.add(chassis);

        const armorPlating = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.24, 0.54), teamMat);
        armorPlating.position.y = 0.28;
        group.add(armorPlating);

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0.22, 0.44, 0);
        const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 12), this.hazardMat);
        const railgun = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.15), this.glowCyanMat);
        railgun.position.set(0.36, 0.02, 0);
        railgun.name = 'barrel';
        turret.add(tBody, railgun);
        group.add(turret);
        break;
      }
    }

    return group;
  }

  // Create a 3D base building mesh (Hybrid Kenney GLB + Detailed Military Attachments)
  public createBuildingMesh(
    type: BuildingType,
    teamColorHex: number,
    isConstructing: boolean = false
  ): THREE.Group {
    const group = new THREE.Group();
    const teamMat = new THREE.MeshStandardMaterial({
      color: teamColorHex,
      metalness: 0.48,
      roughness: 0.38,
    });

    const padSize = type === 'command_center' ? 1.52 : 0.96;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(padSize, 0.08, padSize), this.darkConcreteMat);
    pad.position.y = 0.04;
    pad.receiveShadow = true;
    group.add(pad);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(padSize + 0.05, 0.04, padSize + 0.05), teamMat);
    trim.position.y = 0.02;
    group.add(trim);

    if (isConstructing) {
      const scaf = new THREE.Mesh(
        new THREE.BoxGeometry(padSize * 0.85, 0.78, padSize * 0.85),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, wireframe: true })
      );
      scaf.position.y = 0.44;
      group.add(scaf);

      const core = new THREE.Mesh(
        new THREE.BoxGeometry(padSize * 0.65, 0.42, padSize * 0.65),
        this.concreteMat
      );
      core.position.y = 0.24;
      group.add(core);
      return group;
    }

    const glbKey = BUILDING_GLB_MAP[type];
    if (glbKey && this.glbCache.has(glbKey)) {
      const clonedGlb = this.glbCache.get(glbKey)!.clone(true);
      const scaleMult = type === 'command_center' ? 1.5 : 1.02;
      clonedGlb.scale.setScalar(scaleMult);
      clonedGlb.position.y = 0.08;
      group.add(clonedGlb);
    } else {
      this.addProceduralBuildingBody(group, type, teamMat, padSize);
    }

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
      const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.58, 1.25), this.concreteMat);
      baseBlock.position.y = 0.36;
      baseBlock.castShadow = true;
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.48, 0.8), teamMat);
      upper.position.y = 0.86;
      upper.castShadow = true;
      group.add(baseBlock, upper);
    } else if (
      type === 'vulcan_turret' ||
      type === 'sam_launcher' ||
      type === 'coastal_battery' ||
      type === 'mg_turret' ||
      type === 'artillery_post'
    ) {
      // Octagonal reinforced bunker turret pedestal + sandbag ring
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.34, 8), this.concreteMat);
      pedestal.position.y = 0.23;
      pedestal.castShadow = true;
      const sandbagRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 12), this.sandbagMat);
      sandbagRing.rotation.x = Math.PI / 2;
      sandbagRing.position.y = 0.11;
      group.add(pedestal, sandbagRing);
    } else {
      const mainH = type === 'comms_tower' || type === 'guard_tower' ? 1.02 : 0.52;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(padSize * 0.8, mainH, padSize * 0.8),
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
      radarGroup.position.set(0, type === 'command_center' ? 1.2 : 0.98, 0);
      const dish = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.06), this.glowCyanMat);
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
      turretGroup.name = 'radar';
      turretGroup.position.set(0, 0.46, 0);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.36), teamMat);
      head.castShadow = true;
      turretGroup.add(head);

      if (type === 'sam_launcher') {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), this.hazardMat);
        rack.position.set(0.08, 0.15, 0);
        rack.rotation.z = 0.45;
        turretGroup.add(rack);
      } else {
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.58, 8), this.gunMetalMat);
        b1.rotation.z = Math.PI / 2;
        b1.position.set(0.3, 0.04, 0.07);
        const b2 = b1.clone();
        b2.position.set(0.3, 0.04, -0.07);
        turretGroup.add(b1, b2);
      }

      group.add(turretGroup);
    } else if (type === 'aviation_hangar') {
      const helipad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 20), this.hazardMat);
      helipad.position.set(0, 0.09, 0);
      group.add(helipad);
    }
  }

  // Build High-Density Multi-Tiered Instanced Forests, Bushes, Cliff Rocks & Fortifications
  public buildInstancedEnvironmentProps(
    envObjects: EnvironmentObject[],
    terrainSys: Terrain3DSystem,
    terrainGrid: TerrainType[][]
  ): THREE.Group {
    const propGroup = new THREE.Group();
    if (!envObjects || envObjects.length === 0) return propGroup;

    const pineTrees = envObjects.filter((o) => o.type === 'tree_pine' || o.type === 'tree_cedar');
    const deciduousTrees = envObjects.filter(
      (o) => o.type === 'tree_oak' || o.type === 'tree_birch' || o.type === 'tree_dead'
    );
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
    const color = new THREE.Color();

    // 1A. Multi-Tiered Pine / Conifer Forests (Trunk + 3 Stacked Conical Bough Tiers)
    if (pineTrees.length > 0) {
      const trunkGeom = new THREE.CylinderGeometry(0.045, 0.085, 0.55, 6);
      trunkGeom.translate(0, 0.27, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x432b1d, roughness: 0.92 });
      const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, pineTrees.length);
      trunkInst.castShadow = true;

      const tier1Geom = new THREE.ConeGeometry(0.42, 0.55, 7);
      tier1Geom.translate(0, 0.55, 0);
      const tier2Geom = new THREE.ConeGeometry(0.33, 0.52, 7);
      tier2Geom.translate(0, 0.85, 0);
      const tier3Geom = new THREE.ConeGeometry(0.22, 0.46, 7);
      tier3Geom.translate(0, 1.14, 0);

      const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.02 });
      const tier1Inst = new THREE.InstancedMesh(tier1Geom, pineMat, pineTrees.length);
      const tier2Inst = new THREE.InstancedMesh(tier2Geom, pineMat, pineTrees.length);
      const tier3Inst = new THREE.InstancedMesh(tier3Geom, pineMat, pineTrees.length);
      tier1Inst.castShadow = true;
      tier1Inst.receiveShadow = true;
      tier2Inst.castShadow = true;
      tier2Inst.receiveShadow = true;
      tier3Inst.castShadow = true;

      const pinePalette = [0x1c3d22, 0x224926, 0x17331c, 0x295228, 0x1e4220];

      pineTrees.forEach((t, i) => {
        const tx = Number.isFinite(t.x) ? t.x : 0;
        const ty = Number.isFinite(t.y) ? t.y : 0;
        const gy = terrainSys.groundHeightAt(tx, ty, terrainGrid);
        const s = (t.scale || 1.0) * (0.92 + (i % 5) * 0.08);
        dummy.position.set(tx, gy - 0.02, ty);
        dummy.rotation.set(0, t.rotation || i * 1.1, 0);
        dummy.scale.set(s, s * 1.08, s);
        dummy.updateMatrix();

        trunkInst.setMatrixAt(i, dummy.matrix);
        tier1Inst.setMatrixAt(i, dummy.matrix);

        dummy.rotation.y += 0.45;
        dummy.updateMatrix();
        tier2Inst.setMatrixAt(i, dummy.matrix);

        dummy.rotation.y += 0.45;
        dummy.updateMatrix();
        tier3Inst.setMatrixAt(i, dummy.matrix);

        color.setHex(pinePalette[i % pinePalette.length]);
        tier1Inst.setColorAt(i, color);
        color.offsetHSL(0, 0, 0.025);
        tier2Inst.setColorAt(i, color);
        color.offsetHSL(0, 0, 0.03);
        tier3Inst.setColorAt(i, color);
      });

      trunkInst.instanceMatrix.needsUpdate = true;
      trunkInst.computeBoundingSphere();
      [tier1Inst, tier2Inst, tier3Inst].forEach((inst) => {
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere();
      });

      propGroup.add(trunkInst, tier1Inst, tier2Inst, tier3Inst);
    }

    // 1B. Deciduous Oak & Birch Trees (Trunk + Multi-Clustered Organic Crown)
    if (deciduousTrees.length > 0) {
      const trunkGeom = new THREE.CylinderGeometry(0.05, 0.09, 0.52, 6);
      trunkGeom.translate(0, 0.25, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e3524, roughness: 0.9 });
      const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, deciduousTrees.length);
      trunkInst.castShadow = true;

      const crownGeom = new THREE.DodecahedronGeometry(0.42, 1);
      crownGeom.translate(0, 0.72, 0);
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
      const crownInst = new THREE.InstancedMesh(crownGeom, crownMat, deciduousTrees.length);
      crownInst.castShadow = true;
      crownInst.receiveShadow = true;

      const oakPalette = [0x2d5a27, 0x386b2d, 0x264e22, 0x447733, 0x315f26];

      deciduousTrees.forEach((t, i) => {
        const tx = Number.isFinite(t.x) ? t.x : 0;
        const ty = Number.isFinite(t.y) ? t.y : 0;
        const gy = terrainSys.groundHeightAt(tx, ty, terrainGrid);
        const s = (t.scale || 1.0) * (0.9 + (i % 4) * 0.09);
        dummy.position.set(tx, gy - 0.02, ty);
        dummy.rotation.set(0, t.rotation || i * 1.3, 0);
        dummy.scale.set(s, s * 0.95, s);
        dummy.updateMatrix();

        trunkInst.setMatrixAt(i, dummy.matrix);
        crownInst.setMatrixAt(i, dummy.matrix);

        color.setHex(oakPalette[i % oakPalette.length]);
        crownInst.setColorAt(i, color);
      });

      trunkInst.instanceMatrix.needsUpdate = true;
      trunkInst.computeBoundingSphere();
      crownInst.instanceMatrix.needsUpdate = true;
      if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
      crownInst.computeBoundingSphere();

      propGroup.add(trunkInst, crownInst);
    }

    // 2. Instanced 3D Undergrowth Bushes & Fern Clusters
    if (bushes.length > 0) {
      const bushGeom = new THREE.DodecahedronGeometry(0.25, 1);
      bushGeom.translate(0, 0.14, 0);
      const bushMat = new THREE.MeshStandardMaterial({ color: 0x2e5926, roughness: 0.88 });
      const bushInst = new THREE.InstancedMesh(bushGeom, bushMat, bushes.length);
      bushInst.receiveShadow = true;

      bushes.forEach((b, i) => {
        const bx = Number.isFinite(b.x) ? b.x : 0;
        const by = Number.isFinite(b.y) ? b.y : 0;
        const gy = terrainSys.groundHeightAt(bx, by, terrainGrid);
        const s = (b.scale || 1.0) * 0.9;
        dummy.position.set(bx, gy - 0.02, by);
        dummy.rotation.set(0, i * 0.7, 0);
        dummy.scale.set(s * 1.1, s * 0.72, s);
        dummy.updateMatrix();
        bushInst.setMatrixAt(i, dummy.matrix);
      });

      bushInst.instanceMatrix.needsUpdate = true;
      bushInst.computeBoundingSphere();
      propGroup.add(bushInst);
    }

    // 3. Instanced 3D Boulders & Cliff Outcrops
    if (rocks.length > 0) {
      const rockGeom = new THREE.DodecahedronGeometry(0.36, 0);
      rockGeom.translate(0, 0.18, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x686e75, roughness: 0.86, metalness: 0.08 });
      const rockInst = new THREE.InstancedMesh(rockGeom, rockMat, rocks.length);
      rockInst.castShadow = true;
      rockInst.receiveShadow = true;

      rocks.forEach((r, i) => {
        const rx = Number.isFinite(r.x) ? r.x : 0;
        const ry = Number.isFinite(r.y) ? r.y : 0;
        const gy = terrainSys.groundHeightAt(rx, ry, terrainGrid);
        const s = (r.scale || 1.0) * (r.type === 'cliff_rock' ? 1.45 : 0.95);
        dummy.position.set(rx, gy - 0.03, ry);
        dummy.rotation.set(i * 0.3, r.rotation || i * 1.2, 0);
        dummy.scale.set(s * 1.15, s * 0.82, s * 1.05);
        dummy.updateMatrix();
        rockInst.setMatrixAt(i, dummy.matrix);
      });

      rockInst.instanceMatrix.needsUpdate = true;
      rockInst.computeBoundingSphere();
      propGroup.add(rockInst);
    }

    // 4. Instanced 3D Blast Craters
    if (craters.length > 0) {
      const craterGeom = new THREE.RingGeometry(0.14, 0.45, 14);
      craterGeom.rotateX(-Math.PI / 2);
      const craterMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.95 });
      const craterInst = new THREE.InstancedMesh(craterGeom, craterMat, craters.length);

      craters.forEach((c, i) => {
        const cx = Number.isFinite(c.x) ? c.x : 0;
        const cy = Number.isFinite(c.y) ? c.y : 0;
        const gy = terrainSys.groundHeightAt(cx, cy, terrainGrid);
        const s = c.type === 'crater_large' ? 1.45 : 0.88;
        dummy.position.set(cx, gy + 0.02, cy);
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
      const structGeom = new THREE.BoxGeometry(0.56, 0.4, 0.48);
      structGeom.translate(0, 0.2, 0);
      const structInst = new THREE.InstancedMesh(structGeom, this.concreteMat, structures.length);
      structInst.castShadow = true;
      structInst.receiveShadow = true;

      structures.forEach((st, i) => {
        const gy = terrainSys.groundHeightAt(st.x, st.y, terrainGrid);
        const s = st.scale || 1.0;
        dummy.position.set(st.x, gy, st.y);
        dummy.rotation.set(0, st.rotation || 0, 0);
        if (st.type === 'watchtower') {
          dummy.scale.set(s * 0.72, s * 2.1, s * 0.72);
        } else if (st.type === 'sandbags' || st.type === 'barricade') {
          dummy.scale.set(s * 0.95, s * 0.45, s * 0.45);
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
