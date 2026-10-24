import { Server, Socket } from 'socket.io';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath, isCellPassable, isRailCell, getConnectedRailwayCells, getConnectedRailwayCellsForBase, findRailwayPath } from '../src/game/pathfinder';
import {
  AIDifficulty,
  Base,
  BuildingInstance,
  BuildingType,
  CombatEvent,
  ConstructionOrder,
  FullWorldState,
  GameNotification,
  Resources,
  TerrainType,
  Unit,
  UnitProductionOrder,
  UnitType,
} from '../src/types/game';
import { gameStore } from './store';

const DEFENSIVE_TURRET_TYPES: BuildingType[] = [
  'vulcan_turret',
  'sam_launcher',
  'coastal_battery',
  'mg_turret',
  'artillery_post',
  'guard_tower',
];

export class GameSimulation {
  private io: Server | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private terrainsByMap: Record<string, TerrainType[][]> = {};
  private worldConfig = { width: 100, height: 75, tileSize: 40, seed: 202610 };
  private lastTickMs: number = Date.now();
  private lastEconomyTickMs: number = Date.now();
  private lastAiTickMs: number = Date.now();
  public aiDifficulty: AIDifficulty = 'medium';
  public lastTickDurationMs: number = 1.2;
  public totalTicks: number = 0;
  public recentCombatEvents: CombatEvent[] = [];

  constructor() {
    const data = gameStore.getData();
    if (data.worldConfig) {
      this.worldConfig = { ...data.worldConfig };
    }
    this.initAllMapTerrains();
  }

  private ensureMapBaseInfrastructureTerrain(mapId: string, terrain: TerrainType[][]) {
    if (!terrain || terrain.length === 0) return;
    const height = terrain.length;
    const width = terrain[0]?.length || 100;
    const railY = Math.floor(height * 0.48);
    const data = gameStore.getData();
    const mapBases = (data.bases || []).filter((b) => (b.mapId || 'map_riverfront_assault') === mapId);

    for (const base of mapBases) {
      const bx = Math.round(base.x);
      const by = Math.round(base.y);
      if (bx < 1 || bx >= width - 1 || by < 1 || by >= height - 1) continue;

      if (base.type === 'air') {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
              if (terrain[ny][nx] === 'water' || terrain[ny][nx] === 'deep_water' || terrain[ny][nx] === 'mountain' || terrain[ny][nx] === 'snow') {
                terrain[ny][nx] = dy === 0 ? 'road' : 'plains';
              }
            }
          }
        }
      } else if (base.type === 'helicopter') {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
              if (terrain[ny][nx] === 'water' || terrain[ny][nx] === 'deep_water' || terrain[ny][nx] === 'mountain' || terrain[ny][nx] === 'snow') {
                terrain[ny][nx] = 'plains';
              }
            }
          }
        }
      } else if (base.type === 'harbor') {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 0; dx++) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
              terrain[ny][nx] = 'sand';
            }
          }
          for (let dx = 1; dx <= 5; dx++) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
              terrain[ny][nx] = dx >= 4 ? 'deep_water' : 'water';
            }
          }
        }
      } else if (base.type === 'train' || base.type === 'rail') {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = bx + dx;
          if (nx >= 1 && nx < width - 1) {
            terrain[by][nx] = 'railway';
          }
        }
        const minY = Math.min(railY, by);
        const maxY = Math.max(railY, by);
        for (let y = minY; y <= maxY; y++) {
          if (y >= 1 && y < height - 1) {
            terrain[y][bx] = 'railway';
          }
        }
      }
    }
  }

  public hasValidRunwaySpace(terrain: TerrainType[][], base: Base): boolean {
    if (!terrain || terrain.length === 0) return false;
    const bx = Math.round(base.x);
    const by = Math.round(base.y);
    let passableRunwayTiles = 0;
    for (let dx = -4; dx <= 4; dx++) {
      if (isCellPassable(terrain, bx + dx, by, 'ground')) {
        passableRunwayTiles++;
      }
    }
    return passableRunwayTiles >= 5;
  }

  public hasValidHelipadSpace(terrain: TerrainType[][], base: Base): boolean {
    if (!terrain || terrain.length === 0) return false;
    const bx = Math.round(base.x);
    const by = Math.round(base.y);
    let passablePads = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (isCellPassable(terrain, bx + dx, by + dy, 'ground')) {
          passablePads++;
        }
      }
    }
    return passablePads >= 9;
  }

  public hasNavigableWaterAccess(terrain: TerrainType[][], base: Base): boolean {
    if (!terrain || terrain.length === 0) return false;
    const bx = Math.round(base.x);
    const by = Math.round(base.y);
    const maxR = Math.ceil(base.radius || 4) + 3;
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        if (isCellPassable(terrain, bx + dx, by + dy, 'naval')) {
          return true;
        }
      }
    }
    return false;
  }

  public getConnectedRailwayCellsForBase(terrain: TerrainType[][], base: Base): string[] {
    return Array.from(getConnectedRailwayCellsForBase(terrain, base));
  }

  private initAllMapTerrains() {
    const data = gameStore.getData();
    for (const m of data.maps || []) {
      const gen = generateWorld({
        width: m.width || 100,
        height: m.height || 75,
        tileSize: m.tileSize || 40,
        seed: m.seed || 202610,
      });
      this.ensureMapBaseInfrastructureTerrain(m.id, gen.terrain);
      this.terrainsByMap[m.id] = gen.terrain;
    }
    if (!this.terrainsByMap['map_riverfront_assault']) {
      const gen = generateWorld(this.worldConfig);
      this.ensureMapBaseInfrastructureTerrain('map_riverfront_assault', gen.terrain);
      this.terrainsByMap['map_riverfront_assault'] = gen.terrain;
    }
  }

  public setSocketServer(io: Server) {
    this.io = io;
  }

  public getTerrain(mapId = 'map_riverfront_assault'): TerrainType[][] {
    if (!this.terrainsByMap[mapId]) {
      const cfg = gameStore.getMapConfig(mapId);
      const gen = generateWorld({
        width: cfg.width,
        height: cfg.height,
        tileSize: cfg.tileSize,
        seed: cfg.seed,
      });
      this.ensureMapBaseInfrastructureTerrain(mapId, gen.terrain);
      this.terrainsByMap[mapId] = gen.terrain;
    }
    return this.terrainsByMap[mapId];
  }

  public getWorldConfig(mapId = 'map_riverfront_assault') {
    const cfg = gameStore.getMapConfig(mapId);
    return {
      width: cfg.width || this.worldConfig.width,
      height: cfg.height || this.worldConfig.height,
      tileSize: cfg.tileSize || this.worldConfig.tileSize,
      seed: cfg.seed || this.worldConfig.seed,
    };
  }

  public setAiDifficulty(diff: AIDifficulty) {
    this.aiDifficulty = diff;
    const data = gameStore.getData();
    for (const m of data.matches || []) {
      if (m.status === 'active') {
        m.aiDifficulty = diff;
      }
    }
    gameStore.recordBotActivity('enemy_insurgent', diff);
  }

  public updateCellTerrain(x: number, y: number, type: TerrainType, mapId = 'map_riverfront_assault') {
    const terrain = this.getTerrain(mapId);
    if (y >= 0 && y < terrain.length && x >= 0 && x < (terrain[0]?.length || 0)) {
      terrain[y][x] = type;
      return true;
    }
    return false;
  }

  public regenerateWorldWithSeed(seed: number, width = 100, height = 75, mapId = 'map_riverfront_assault') {
    const data = gameStore.getData();
    const mapCfg = data.maps.find((m) => m.id === mapId);
    if (mapCfg) {
      mapCfg.seed = seed;
      mapCfg.width = width;
      mapCfg.height = height;
    }
    if (mapId === 'map_riverfront_assault') {
      this.worldConfig = { width, height, tileSize: 40, seed };
      data.worldConfig = { ...this.worldConfig };
    }
    const generated = generateWorld({ width, height, tileSize: 40, seed });
    this.terrainsByMap[mapId] = generated.terrain;
    const taggedEnv = generated.envObjects.map((e) => ({ ...e, mapId }));
    if (!data.envObjectsByMap) data.envObjectsByMap = {};
    data.envObjectsByMap[mapId] = taggedEnv;
    if (mapId === 'map_riverfront_assault') {
      data.envObjects = taggedEnv;
    }
    return generated;
  }

  // ==========================================================================
  // PHASE 3: SERVER-ENFORCED FOG OF WAR & MULTI-MAP STATE FILTERING
  // ==========================================================================

  public isAuthoritativeHomeBase(base: Base): boolean {
    if (!base.isHomeBase) return false;
    if (!base.ownerId || base.ownerId === 'neutral' || base.ownerId === 'enemy_insurgent') {
      return Boolean(base.isHomeBase);
    }
    const data = gameStore.getData();
    const ownerProfile = data.users[base.ownerId]?.profile;
    if (ownerProfile && ownerProfile.homeBaseId && ownerProfile.homeBaseId !== base.id) {
      return false;
    }
    return true;
  }

  public computeBaseConsumptionRates(base: Base): Resources {
    const data = gameStore.getData();
    let fuelBurn = 0;
    for (const u of data.units) {
      if (u.ownerId === base.ownerId && u.homeBaseId === base.id) {
        const uDef = gameStore.getEffectiveUnitDef(u.type as UnitType);
        const burn = uDef?.fuelBurnPerSec || 0.1;
        const isActive = u.command !== 'idle' && u.command !== 'hold' && u.command !== 'stop';
        fuelBurn += isActive ? burn : burn * 0.2;
      }
    }
    return {
      concrete: 0,
      steel: 0,
      aluminum: 0,
      fuel: Math.round(fuelBurn * 100) / 100,
    };
  }

  public isBaseProtectedNow(base: Base, now = Date.now()): boolean {
    if (base.rebuildProtectionUntil && base.rebuildProtectionUntil > now) {
      return true;
    }
    if (base.isNewcomerBase && base.newcomerProtectionUntil && base.newcomerProtectionUntil > now) {
      return true;
    }
    const data = gameStore.getData();
    const owner = data.users[base.ownerId]?.profile;
    if (owner && owner.beginnerProtectionUntil && owner.beginnerProtectionUntil > now) {
      return true;
    }
    return false;
  }

  public hasActiveDefensiveTurrets(base: Base): boolean {
    if (!Array.isArray(base.buildings)) return false;
    return base.buildings.some(
      (b) => DEFENSIVE_TURRET_TYPES.includes(b.type) && !b.isConstructing && b.health > 0
    );
  }

  public isBaseNeutralizedOrDestroyed(base: Base): boolean {
    return (
      base.lifecycleState === 'neutralized' ||
      base.lifecycleState === 'destroyed' ||
      base.health <= 0
    );
  }

  public findApproachPointForBase(
    terrain: TerrainType[][],
    unitX: number,
    unitY: number,
    base: Base,
    category: 'ground' | 'air' | 'naval' | 'rail',
    attackRange: number
  ): { x: number; y: number } {
    if (category === 'air' || isCellPassable(terrain, Math.round(base.x), Math.round(base.y), category)) {
      return { x: base.x, y: base.y };
    }
    const maxStandOff = Math.max(1, Math.floor(attackRange + (base.radius || 4) - 0.5));
    let bestX = base.x;
    let bestY = base.y;
    let bestScore = Infinity;

    for (let dy = -maxStandOff; dy <= maxStandOff; dy++) {
      for (let dx = -maxStandOff; dx <= maxStandOff; dx++) {
        const distToBase = Math.hypot(dx, dy);
        if (distToBase > attackRange + (base.radius || 4) - 0.25) continue;
        const cx = Math.max(1, Math.min(98, Math.round(base.x + dx)));
        const cy = Math.max(1, Math.min(73, Math.round(base.y + dy)));
        if (!isCellPassable(terrain, cx, cy, category)) continue;
        const distFromUnit = Math.hypot(cx - unitX, cy - unitY);
        const score = distFromUnit + distToBase * 0.25;
        if (score < bestScore) {
          bestScore = score;
          bestX = cx;
          bestY = cy;
        }
      }
    }
    return { x: bestX, y: bestY };
  }

  public computeBasePower(base: Base): { powerUsed: number; powerCapacity: number } {
    let capacity = 25;
    let used = 0;
    for (const b of base.buildings || []) {
      if (b.isConstructing || b.health <= 0) continue;
      if (b.type === 'command_center') capacity += 20 * b.level;
      else if (b.type === 'power_station') capacity += 35 * b.level;
      else used += 4 * b.level;
    }
    return { powerUsed: used, powerCapacity: capacity };
  }

  public getVisibleWorldState(
    userId: string | null,
    requestedMapId?: string,
    onlineUserIds: string[] = []
  ): FullWorldState {
    const data = gameStore.getData();
    const settings = gameStore.getSystemSettings();
    const econ = gameStore.getEconomyConfig();
    const now = Date.now();
    const userProfile = userId ? data.users[userId]?.profile : null;
    const mapId = requestedMapId || userProfile?.currentMapId || 'map_riverfront_assault';
    const mapCfg = gameStore.getMapConfig(mapId);

    const mapBases = data.bases.filter((b) => (b.mapId || 'map_riverfront_assault') === mapId);
    const mapUnits = data.units.filter((u) => (u.mapId || 'map_riverfront_assault') === mapId);
    const mapEnvObjects = gameStore.getMapEnvObjects(mapId);

    // If unauthenticated preview or fog of war disabled in settings, return sanitized map state
    if (!userId || !settings.fogOfWarEnforced) {
      return {
        mapId,
        bases: mapBases.map((b) => {
          const power = this.computeBasePower(b);
          const isAuthHome = this.isAuthoritativeHomeBase(b);
          const ccLevel = (b.buildings || []).find((bld) => bld.type === 'command_center')?.level || 1;
          return {
            ...b,
            isHomeBase: isAuthHome,
            hqLevel: ccLevel,
            armorMultiplier: isAuthHome ? econ.homeBaseArmorMultiplier || 3.0 : 1.0,
            consumptionRates: this.computeBaseConsumptionRates(b),
            isProtected: this.isBaseProtectedNow(b, now),
            powerUsed: power.powerUsed,
            powerCapacity: power.powerCapacity,
            constructionQueue: b.ownerId === userId ? b.constructionQueue : [],
            productionQueue: b.ownerId === userId ? b.productionQueue : [],
          };
        }),
        units: mapUnits,
        alliances: data.alliances,
        onlineUserIds,
        envObjects: mapEnvObjects,
        highwayExits: mapCfg.highwayExits || [],
        timestamp: now,
      };
    }

    const userAllianceId = userProfile?.allianceId || null;
    const isFriendly = (ownerId: string, allianceId?: string | null) => {
      if (ownerId === userId) return true;
      if (userAllianceId && allianceId && userAllianceId === allianceId) return true;
      return false;
    };

    // Collect vision circles from friendly/allied bases and units on this map
    const visionSources: Array<{ x: number; y: number; radius: number }> = [];
    for (const b of mapBases) {
      if (isFriendly(b.ownerId, b.allianceId)) {
        const hasRadar = (b.buildings || []).some(
          (bld) => (bld.type === 'radar_station' || bld.type === 'comms_tower') && !bld.isConstructing && bld.health > 0
        );
        visionSources.push({
          x: b.x,
          y: b.y,
          radius: b.radius + (hasRadar ? 26 : 15),
        });
      }
    }

    for (const u of mapUnits) {
      if (isFriendly(u.ownerId, u.allianceId)) {
        const uDef = gameStore.getEffectiveUnitDef(u.type);
        visionSources.push({
          x: u.x,
          y: u.y,
          radius: (uDef?.visionRadius || 10) + 2,
        });
      }
    }

    // Track explored bounding box per user and map
    if (!data.exploredByUserMap) data.exploredByUserMap = {};
    if (!data.exploredByUserMap[userId]) data.exploredByUserMap[userId] = {};
    let bounds = data.exploredByUserMap[userId][mapId] || [100, 75, 0, 0];
    for (const vs of visionSources) {
      bounds = [
        Math.min(bounds[0], Math.max(0, Math.floor(vs.x - vs.radius))),
        Math.min(bounds[1], Math.max(0, Math.floor(vs.y - vs.radius))),
        Math.max(bounds[2], Math.min(mapCfg.width, Math.ceil(vs.x + vs.radius))),
        Math.max(bounds[3], Math.min(mapCfg.height, Math.ceil(vs.y + vs.radius))),
      ];
    }
    data.exploredByUserMap[userId][mapId] = bounds;

    // Filter enemy units strictly by server-side line-of-sight vision
    const visibleUnits = mapUnits.filter((u) => {
      if (isFriendly(u.ownerId, u.allianceId)) return true;
      for (const vs of visionSources) {
        if (Math.hypot(u.x - vs.x, u.y - vs.y) <= vs.radius) {
          return true;
        }
      }
      return false;
    });

    // Sanitize enemy bases so private queues aren't leaked and resolve live owner & alliance info
    const sanitizedBases = mapBases.map((b) => {
      const isAuthHome = this.isAuthoritativeHomeBase(b);
      const ccLevel = (b.buildings || []).find((bld) => bld.type === 'command_center')?.level || 1;

      // Authoritative Owner Display Name & Alliance Resolution
      let currentOwnerName = b.ownerName;
      let currentAllianceId = b.allianceId || null;
      let currentAllianceName: string | null = b.allianceName || null;
      let currentAllianceTag: string | null = b.allianceTag || null;

      if (b.ownerId && b.ownerId !== 'neutral' && b.ownerId !== 'enemy_insurgent') {
        const ownerProf = data.users[b.ownerId]?.profile;
        if (ownerProf) {
          currentOwnerName = ownerProf.username;
          currentAllianceId = ownerProf.allianceId || null;
          if (currentAllianceId) {
            const ally = data.alliances.find((a) => a.id === currentAllianceId);
            if (ally) {
              currentAllianceName = ally.name;
              currentAllianceTag = ally.tag;
            } else {
              currentAllianceId = null;
              currentAllianceName = null;
              currentAllianceTag = null;
            }
          } else {
            currentAllianceName = null;
            currentAllianceTag = null;
          }
        }
      } else if (b.ownerId === 'neutral' || b.lifecycleState === 'neutralized') {
        currentOwnerName = 'Neutral Territory';
        currentAllianceId = null;
        currentAllianceName = null;
        currentAllianceTag = null;
      }

      const friendly = isFriendly(b.ownerId, currentAllianceId);
      const power = this.computeBasePower(b);

      return {
        ...b,
        ownerName: currentOwnerName,
        allianceId: currentAllianceId,
        allianceName: currentAllianceName,
        allianceTag: currentAllianceTag,
        isHomeBase: isAuthHome,
        hqLevel: ccLevel,
        armorMultiplier: isAuthHome ? econ.homeBaseArmorMultiplier || 3.0 : 1.0,
        consumptionRates: friendly ? this.computeBaseConsumptionRates(b) : undefined,
        isProtected: this.isBaseProtectedNow(b, now),
        powerUsed: power.powerUsed,
        powerCapacity: power.powerCapacity,
        constructionQueue: friendly ? b.constructionQueue : [],
        productionQueue: friendly ? b.productionQueue : [],
      };
    });

    return {
      mapId,
      bases: sanitizedBases,
      units: visibleUnits,
      alliances: data.alliances,
      onlineUserIds,
      envObjects: mapEnvObjects,
      highwayExits: mapCfg.highwayExits || [],
      exploredBounds: bounds,
      timestamp: now,
    };
  }

  public broadcastWorldSync(now = Date.now()) {
    if (!this.io) return;
    const room = this.io.sockets.adapter.rooms.get('authenticated_commanders');
    if (!room) return;

    for (const socketId of room) {
      const sock: Socket | undefined = this.io.sockets.sockets.get(socketId);
      if (!sock) continue;
      const userId = (sock.data as any)?.userId as string | undefined;
      const mapId = (sock.data as any)?.mapId as string | undefined;
      const visible = this.getVisibleWorldState(userId || null, mapId);
      sock.emit('world:sync', {
        mapId: visible.mapId,
        units: visible.units,
        bases: visible.bases,
        highwayExits: visible.highwayExits,
        timestamp: now,
      });
    }
  }

  public start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error('[Simulation] Error during tick:', err);
      }
    }, 100);

    console.log('[Simulation] Multi-sector game simulation engine running at 10Hz.');
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Authoritative tick across all active sector maps
  public tick(forceEconomyTick = false) {
    const tickStart = performance.now();
    const now = Date.now();
    const dt = Math.min((now - this.lastTickMs) / 1000, 0.5);
    this.lastTickMs = now;
    this.totalTicks += 1;

    const data = gameStore.getData();
    const settings = gameStore.getSystemSettings();
    const econ = gameStore.getEconomyConfig();

    if (settings.maintenanceMode) {
      this.lastTickDurationMs = Math.round((performance.now() - tickStart) * 100) / 100;
      return;
    }

    let hasStateChange = false;

    // 1. Move Units + Tactical Target Pursuit + Patrol & Attack-Move Handling (per map)
    for (const unit of data.units) {
      const unitMapId = unit.mapId || 'map_riverfront_assault';
      const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
      if (!def) continue;
      const terrain = this.getTerrain(unitMapId);

      // Range-aware stopping and dynamic pursuit for explicit attack orders
      if (unit.command === 'attack') {
        if (unit.targetUnitId) {
          const tUnit = data.units.find(
            (u) => u.id === unit.targetUnitId && (u.mapId || 'map_riverfront_assault') === unitMapId
          );
          if (!tUnit) {
            unit.targetUnitId = null;
            if (!unit.targetBaseId && (!unit.path || unit.path.length === 0)) {
              unit.command = 'idle';
            }
          } else {
            const distToTarget = Math.hypot(tUnit.x - unit.x, tUnit.y - unit.y);
            if (distToTarget <= def.attackRange * 0.95) {
              if (unit.path && unit.path.length > 0) {
                unit.path = [];
                hasStateChange = true;
              }
            } else {
              const lastPt = unit.path && unit.path.length > 0 ? unit.path[unit.path.length - 1] : null;
              const needsRepath = !lastPt || Math.hypot(lastPt.x - tUnit.x, lastPt.y - tUnit.y) > 2.0;
              if (needsRepath) {
                const newPath = findPath(terrain, unit.x, unit.y, tUnit.x, tUnit.y, def.category);
                if (newPath.length > 0) {
                  unit.path = newPath;
                  hasStateChange = true;
                }
              }
            }
          }
        } else if (unit.targetBaseId) {
          const tBase = data.bases.find(
            (b) => b.id === unit.targetBaseId && (b.mapId || 'map_riverfront_assault') === unitMapId
          );
          if (!tBase || tBase.ownerId === unit.ownerId) {
            unit.targetBaseId = null;
            unit.path = [];
            unit.command = 'idle';
          } else if (this.isBaseNeutralizedOrDestroyed(tBase)) {
            if (def.canCaptureBase) {
              unit.targetBaseId = null;
              unit.command = 'move';
            } else {
              unit.targetBaseId = null;
              unit.path = [];
              unit.command = 'idle';
            }
          } else {
            const distToBase = Math.hypot(tBase.x - unit.x, tBase.y - unit.y);
            if (distToBase <= def.attackRange + tBase.radius - 0.25) {
              if (unit.path && unit.path.length > 0) {
                unit.path = [];
                hasStateChange = true;
              }
            } else if (!unit.path || unit.path.length === 0) {
              const approach = this.findApproachPointForBase(
                terrain,
                unit.x,
                unit.y,
                tBase,
                def.category,
                def.attackRange
              );
              const newPath = findPath(terrain, unit.x, unit.y, approach.x, approach.y, def.category);
              if (newPath.length > 0) {
                unit.path = newPath;
                hasStateChange = true;
              }
            }
          }
        }
      }

      // Pause movement along path during attack_move or patrol when a valid hostile target is in weapon range
      let pauseMovementForEngagement = false;
      if ((unit.command === 'attack_move' || unit.command === 'patrol') && unit.path && unit.path.length > 0) {
        const hasHostileUnitInRange = data.units.some((other) => {
          if (
            other.id === unit.id ||
            other.ownerId === unit.ownerId ||
            (other.mapId || 'map_riverfront_assault') !== unitMapId
          ) {
            return false;
          }
          if (unit.allianceId && other.allianceId && unit.allianceId === other.allianceId) return false;
          const otherOwner = data.users[other.ownerId]?.profile;
          if (otherOwner && otherOwner.beginnerProtectionUntil > now) return false;
          const otherDef = gameStore.getEffectiveUnitDef(other.type as UnitType);
          if (!otherDef || !def.targets.includes(otherDef.category)) return false;
          return Math.hypot(other.x - unit.x, other.y - unit.y) <= def.attackRange;
        });

        const hasHostileBaseInRange =
          !hasHostileUnitInRange &&
          def.targets.includes('ground') &&
          data.bases.some((base) => {
            if ((base.mapId || 'map_riverfront_assault') !== unitMapId) return false;
            if (base.ownerId === unit.ownerId || this.isBaseNeutralizedOrDestroyed(base)) {
              return false;
            }
            if (unit.allianceId && base.allianceId && unit.allianceId === base.allianceId) return false;
            if (this.isBaseProtectedNow(base, now)) return false;
            return Math.hypot(base.x - unit.x, base.y - unit.y) <= def.attackRange + base.radius;
          });

        if (hasHostileUnitInRange || hasHostileBaseInRange) {
          pauseMovementForEngagement = true;
        }
      }

      if (!pauseMovementForEngagement && unit.path && unit.path.length > 0) {
        hasStateChange = true;
        const target = unit.path[0];
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.hypot(dx, dy);

        const speed = def.speed || 3.0;
        const step = speed * dt;

        if (dist <= step) {
          unit.x = target.x;
          unit.y = target.y;
          unit.path.shift();
          if (unit.path.length === 0) {
            if (unit.command === 'move' || unit.command === 'retreat' || unit.command === 'attack_move') {
              unit.command = 'idle';
            } else if (
              unit.command === 'patrol' &&
              unit.patrolStartX !== undefined &&
              unit.patrolStartY !== undefined &&
              unit.patrolTargetX !== undefined &&
              unit.patrolTargetY !== undefined
            ) {
              const nextTargetX = unit.patrolStartX;
              const nextTargetY = unit.patrolStartY;
              unit.patrolStartX = unit.x;
              unit.patrolStartY = unit.y;
              unit.patrolTargetX = nextTargetX;
              unit.patrolTargetY = nextTargetY;
              const reversePath = findPath(terrain, unit.x, unit.y, nextTargetX, nextTargetY, def.category);
              if (reversePath.length > 0) {
                unit.path = reversePath;
              } else {
                unit.command = 'idle';
              }
            }
          }
        } else {
          unit.x += (dx / dist) * step;
          unit.y += (dy / dist) * step;
          unit.rotation = Math.atan2(dy, dx);
        }
      }
    }

    for (let i = 0; i < data.units.length; i++) {
      const uA = data.units[i];
      const mapA = uA.mapId || 'map_riverfront_assault';
      const defA = gameStore.getEffectiveUnitDef(uA.type as UnitType);
      if (!defA || defA.category === 'rail') continue;
      const terrain = this.getTerrain(mapA);

      for (let j = i + 1; j < data.units.length; j++) {
        const uB = data.units[j];
        if ((uB.mapId || 'map_riverfront_assault') !== mapA) continue;
        const defB = gameStore.getEffectiveUnitDef(uB.type as UnitType);
        if (!defB || defB.category !== defA.category) continue;

        const dx = uB.x - uA.x;
        const dy = uB.y - uA.y;
        const d = Math.hypot(dx, dy);
        const minSep = defA.category === 'air' ? 0.95 : 0.72;

        if (d > 0.001 && d < minSep) {
          const push = (minSep - d) * 0.25;
          const nx = (dx / d) * push;
          const ny = (dy / d) * push;
          const aPass = isCellPassable(terrain, Math.round(uA.x - nx), Math.round(uA.y - ny), defA.category);
          const bPass = isCellPassable(terrain, Math.round(uB.x + nx), Math.round(uB.y + ny), defB.category);
          if (aPass) {
            uA.x = Math.max(1, Math.min(98, uA.x - nx));
            uA.y = Math.max(1, Math.min(73, uA.y - ny));
          }
          if (bPass) {
            uB.x = Math.max(1, Math.min(98, uB.x + nx));
            uB.y = Math.max(1, Math.min(73, uB.y + ny));
          }
          hasStateChange = true;
        }
      }
    }

    // 2. Unit Combat & Siege Targeting (strictly within same mapId)
    const destroyedUnitIds = new Set<string>();
    const combatEvents: CombatEvent[] = [];

    for (const unit of data.units) {
      if (destroyedUnitIds.has(unit.id)) continue;
      const unitMapId = unit.mapId || 'map_riverfront_assault';

      const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
      if (!def) continue;

      const canAttack = now - unit.lastAttackTime >= def.cooldownSec * 1000;
      if (!canAttack) continue;

      let targetUnit: Unit | undefined;
      if (unit.targetUnitId) {
        targetUnit = data.units.find(
          (u) =>
            u.id === unit.targetUnitId &&
            !destroyedUnitIds.has(u.id) &&
            (u.mapId || 'map_riverfront_assault') === unitMapId
        );
        if (!targetUnit) unit.targetUnitId = null;
      }

      if (!targetUnit && !unit.targetBaseId && unit.command !== 'retreat') {
        let closestDist = def.attackRange;
        for (const other of data.units) {
          if (
            other.id === unit.id ||
            other.ownerId === unit.ownerId ||
            destroyedUnitIds.has(other.id) ||
            (other.mapId || 'map_riverfront_assault') !== unitMapId
          ) {
            continue;
          }
          if (unit.allianceId && other.allianceId && unit.allianceId === other.allianceId) continue;

          // Respect beginner protection on target owner's units near their protected home base
          const otherOwner = data.users[other.ownerId]?.profile;
          if (otherOwner && otherOwner.beginnerProtectionUntil > now) continue;

          const otherDef = gameStore.getEffectiveUnitDef(other.type as UnitType);
          if (!otherDef || !def.targets.includes(otherDef.category)) continue;

          const d = Math.hypot(other.x - unit.x, other.y - unit.y);
          if (d <= closestDist) {
            closestDist = d;
            targetUnit = other;
          }
        }
      }

      if (targetUnit) {
        const d = Math.hypot(targetUnit.x - unit.x, targetUnit.y - unit.y);
        if (d <= def.attackRange) {
          unit.rotation = Math.atan2(targetUnit.y - unit.y, targetUnit.x - unit.x);
          unit.lastAttackTime = now;
          hasStateChange = true;

          const targetDef = gameStore.getEffectiveUnitDef(targetUnit.type as UnitType);
          let multiplier = 1.0;
          if (unit.type === 'skyguard_aa' && targetDef?.category === 'air') multiplier = 2.4;
          if (unit.type === 'titan_mbt' && targetDef?.category === 'ground') multiplier = 1.3;
          if (unit.type === 'thunderbolt_bomber') multiplier = 1.6;

          const armorReduction = Math.max(0.1, 1 - (targetDef?.armor || 0) / 100);
          const damage = Math.round(def.attackDamage * multiplier * armorReduction);

          targetUnit.health -= damage;

          const evt: CombatEvent = {
            id: `cb_${now}_${Math.random().toString(36).substring(2, 7)}`,
            mapId: unitMapId,
            attackerId: unit.id,
            attackerType: unit.type,
            attackerOwnerId: unit.ownerId,
            attackerX: unit.x,
            attackerY: unit.y,
            targetId: targetUnit.id,
            targetType: targetUnit.type,
            damage,
            x: targetUnit.x,
            y: targetUnit.y,
            isFatal: targetUnit.health <= 0,
            timestamp: now,
          };
          combatEvents.push(evt);

          if (targetUnit.health <= 0) {
            destroyedUnitIds.add(targetUnit.id);
            unit.kills += 1;
            unit.targetUnitId = null;

            const ownerProfile = data.users[unit.ownerId]?.profile;
            if (ownerProfile) {
              ownerProfile.totalUnitsDestroyed += 1;
              ownerProfile.score += Math.round((targetDef?.maxHealth || 300) / 10);
              gameStore.recalculatePlayerProgression(ownerProfile);
            }
          }
        }
      }

      // Base attacking (with Phase 4 protection & turret siege damage)
      if (
        !targetUnit &&
        unit.command !== 'move' &&
        unit.command !== 'retreat' &&
        unit.command !== 'stop' &&
        def.targets.includes('ground')
      ) {
        const candidateBases = unit.targetBaseId
          ? data.bases.filter((b) => b.id === unit.targetBaseId)
          : data.bases.filter(
              (b) =>
                b.ownerId !== 'neutral' ||
                unit.command === 'attack_move' ||
                unit.command === 'patrol'
            );

        for (const base of candidateBases) {
          if ((base.mapId || 'map_riverfront_assault') !== unitMapId) continue;
          if (base.ownerId === unit.ownerId) continue;
          if (unit.allianceId && base.allianceId && unit.allianceId === base.allianceId) continue;
          if (this.isBaseProtectedNow(base, now)) continue;
          // Neutralized or already destroyed bases cannot be attacked by weapons
          if (this.isBaseNeutralizedOrDestroyed(base)) continue;

          const dist = Math.hypot(base.x - unit.x, base.y - unit.y);
          if (dist <= def.attackRange + base.radius) {
            unit.rotation = Math.atan2(base.y - unit.y, base.x - unit.x);
            unit.lastAttackTime = now;
            hasStateChange = true;

            // Attacking an enemy or fortified base forfeits attacker's beginner protection
            const attackerProfile = data.users[unit.ownerId]?.profile;
            if (attackerProfile && attackerProfile.beginnerProtectionUntil > now) {
              attackerProfile.beginnerProtectionUntil = 0;
            }

            const econ = gameStore.getEconomyConfig();
            let baseDamage = def.attackDamage * (unit.type === 'goliath_howitzer' ? 2.0 : 0.8);
            const isAuthHome = this.isAuthoritativeHomeBase(base);
            if (isAuthHome) {
              const armorMult = econ.homeBaseArmorMultiplier || 3.0;
              baseDamage = baseDamage / armorMult;
            }
            const damage = Math.max(1, Math.round(baseDamage));

            if (base.defenseShield > 0) {
              base.defenseShield = Math.max(0, base.defenseShield - damage);
            } else {
              // Damage active defensive turrets first so base defenses are neutralized
              const activeTurret = (base.buildings || []).find(
                (b) => DEFENSIVE_TURRET_TYPES.includes(b.type) && !b.isConstructing && b.health > 0
              );
              if (activeTurret) {
                activeTurret.health = Math.max(0, activeTurret.health - damage);
              } else {
                // Structural HP damage once shield and turrets are down
                base.health = Math.max(0, base.health - damage);
                if (base.health <= 0) {
                  if (isAuthHome) {
                    this.destroyAndRelocateHomeBase(base, unit, now);
                    hasStateChange = true;
                  } else {
                    this.neutralizeOrdinaryBase(base, unit, now);
                    hasStateChange = true;
                  }
                }
              }
            }

            const remainingTurrets = (base.buildings || []).filter(
              (b) => DEFENSIVE_TURRET_TYPES.includes(b.type) && !b.isConstructing && b.health > 0
            );
            base.activeTurretsCount = remainingTurrets.length;
            base.defensesIntact = base.defenseShield > 0 || remainingTurrets.length > 0;

            combatEvents.push({
              id: `cb_base_${now}_${Math.random().toString(36).substring(2, 7)}`,
              mapId: unitMapId,
              attackerId: unit.id,
              attackerType: unit.type,
              attackerOwnerId: unit.ownerId,
              attackerX: unit.x,
              attackerY: unit.y,
              targetId: base.id,
              targetType: 'base',
              damage,
              x: base.x,
              y: base.y,
              isFatal: base.health <= 0,
              timestamp: now,
            });
            break;
          }
        }
      }
    }

    // 3. Base Turrets Auto-Firing at Hostile Units on the same map (including fortified neutral bases)
    for (const base of data.bases) {
      if (this.isBaseNeutralizedOrDestroyed(base)) {
        continue;
      }
      const baseMapId = base.mapId || 'map_riverfront_assault';
      const turrets = base.buildings.filter(
        (b: BuildingInstance) =>
          DEFENSIVE_TURRET_TYPES.includes(b.type) &&
          b.health > 0 &&
          !b.isConstructing
      );

      for (const t of turrets) {
        const bDef = gameStore.getEffectiveBuildingDef(t.type as BuildingType);
        if (!bDef || !bDef.defenseStats) continue;

        const range = bDef.defenseStats.range;
        const targetsAllowed = bDef.defenseStats.targets;

        let bestTarget: Unit | null = null;
        let bestDist = range;

        for (const u of data.units) {
          if ((u.mapId || 'map_riverfront_assault') !== baseMapId) continue;
          if (u.ownerId === base.ownerId || destroyedUnitIds.has(u.id)) continue;
          if (base.allianceId && u.allianceId && base.allianceId === u.allianceId) continue;

          const uDef = gameStore.getEffectiveUnitDef(u.type as UnitType);
          if (!uDef || !targetsAllowed.includes(uDef.category)) continue;

          const d = Math.hypot(u.x - base.x, u.y - base.y);
          if (d <= bestDist) {
            bestDist = d;
            bestTarget = u;
          }
        }

        const rateOfFire = bDef.defenseStats.rateOfFire || 1.0;
        const turretCooldownMs = Math.max(200, Math.round(1000 / rateOfFire));
        const canTurretFire = now - (t.lastAttackTime || 0) >= turretCooldownMs;

        if (bestTarget && canTurretFire) {
          t.lastAttackTime = now;
          const damage = Math.round(bDef.defenseStats.damage * (1 + (t.level - 1) * 0.25));
          bestTarget.health -= damage;
          hasStateChange = true;

          const tx = base.x + (t.offsetX || 0);
          const ty = base.y + (t.offsetY || 0);

          combatEvents.push({
            id: `cb_turret_${now}_${Math.random().toString(36).substring(2, 7)}`,
            mapId: baseMapId,
            attackerId: `${base.id}_${t.id}`,
            attackerType: t.type,
            attackerOwnerId: base.ownerId,
            attackerX: tx,
            attackerY: ty,
            targetId: bestTarget.id,
            targetType: bestTarget.type,
            damage,
            x: bestTarget.x,
            y: bestTarget.y,
            isFatal: bestTarget.health <= 0,
            timestamp: now,
          });

          if (bestTarget.health <= 0) {
            destroyedUnitIds.add(bestTarget.id);
            const defenderProfile = data.users[base.ownerId]?.profile;
            if (defenderProfile) {
              const targetDef = gameStore.getEffectiveUnitDef(bestTarget.type as UnitType);
              defenderProfile.totalUnitsDestroyed += 1;
              defenderProfile.score += Math.round((targetDef?.maxHealth || 300) / 10);
              gameStore.recalculatePlayerProgression(defenderProfile);
            }
          }
        }
      }
    }

    if (destroyedUnitIds.size > 0) {
      data.units = data.units.filter((u) => !destroyedUnitIds.has(u.id));
      hasStateChange = true;
    }

    // 4. Phase 4: Deeper Siege & Base Capture Mechanics
    const captureStep = econ.captureSpeedPerTick || 5;
    for (const base of data.bases) {
      const baseMapId = base.mapId || 'map_riverfront_assault';
      const mapCfg = gameStore.getMapConfig(baseMapId);
      base.isProtected = this.isBaseProtectedNow(base, now);

      const activeTurrets = (base.buildings || []).filter(
        (b) => DEFENSIVE_TURRET_TYPES.includes(b.type) && !b.isConstructing && b.health > 0
      );
      base.activeTurretsCount = activeTurrets.length;
      base.totalTurretsCount = (base.buildings || []).filter((b) => DEFENSIVE_TURRET_TYPES.includes(b.type)).length;
      const defensesIntact = base.defenseShield > 0 || activeTurrets.length > 0;
      base.defensesIntact = defensesIntact;

      // 1. Home bases and protected bases cannot be captured
      if (this.isAuthoritativeHomeBase(base)) {
        if (base.captureProgress > 0) {
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          base.captureContested = false;
          hasStateChange = true;
        }
        base.captureBlockedReason = 'Home Bases are permanent command centers and cannot be conquered';
        continue;
      }

      if (base.isProtected) {
        if (base.captureProgress > 0) {
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          base.captureContested = false;
          hasStateChange = true;
        }
        base.captureBlockedReason = 'Base is shielded by active command protection';
        continue;
      }

      // 2. Only neutralized bases (where health <= 0 and defenses are eliminated) can be conquered
      if (!this.isBaseNeutralizedOrDestroyed(base)) {
        if (base.captureProgress > 0) {
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          base.captureContested = false;
          hasStateChange = true;
        }
        if (base.defenseShield > 0 && activeTurrets.length > 0) {
          base.captureBlockedReason = 'Base defensive shield and all defensive turrets must be destroyed first';
        } else if (base.defenseShield > 0) {
          base.captureBlockedReason = 'Defense shield active — deplete shield before structural siege';
        } else if (activeTurrets.length > 0) {
          base.captureBlockedReason = 'Destroy defensive turrets first before structural siege';
        } else {
          base.captureBlockedReason = 'Structural integrity exposed — reduce base health to 0 to neutralize';
        }
        continue;
      }

      // Ensure neutralized base fields stay consistent
      if (base.lifecycleState !== 'neutralized' && base.lifecycleState !== 'destroyed') {
        base.lifecycleState = 'neutralized';
      }

      // 3. Find designated conquest units in range
      const allowedConquestTypes = econ.conquestUnitTypes || ['dominator_conquest'];
      const captureRadius = Math.max(6.0, (base.radius || 4) + 2.5);
      const conquestUnits = data.units.filter((u) => {
        if ((u.mapId || 'map_riverfront_assault') !== baseMapId) return false;
        if (!allowedConquestTypes.includes(u.type)) return false;
        const uDef = gameStore.getEffectiveUnitDef(u.type);
        if (!uDef?.canCaptureBase) return false;
        if (u.health <= 0) return false;
        if (u.ownerId === 'neutral') return false;
        if (u.ownerId === base.ownerId) return false;
        if (base.allianceId && u.allianceId && base.allianceId === u.allianceId) return false;
        const dist = Math.hypot(u.x - base.x, u.y - base.y);
        return dist <= captureRadius;
      });

      const factionKeys = new Set(conquestUnits.map((u) => u.allianceId || `owner_${u.ownerId}`));
      const isContested = factionKeys.size > 1;
      base.captureContested = isContested;

      if (defensesIntact) {
        if (base.captureProgress > 0) {
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          hasStateChange = true;
        }
        base.captureBlockedReason = 'Base defensive shield and all defensive turrets must be destroyed first';
        continue;
      }

      if (conquestUnits.length === 0) {
        if (base.captureProgress > 0) {
          base.captureProgress = Math.max(0, base.captureProgress - 2);
          if (base.captureProgress === 0) base.capturingPlayerId = null;
          hasStateChange = true;
        }
        base.captureBlockedReason = 'Requires designated conquest vehicle (Dominator) to capture';
        continue;
      }

      if (isContested) {
        base.captureBlockedReason = 'Territory contested by hostile factions';
        hasStateChange = true;
        continue;
      }

      const capturingUnit = conquestUnits[0];

      // 4. Newcomer Base Protection Check
      if (base.isNewcomerBase) {
        const newcomerCheck = gameStore.checkNewcomerBaseEligibility(capturingUnit.ownerId, base, now);
        if (!newcomerCheck.eligible) {
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          base.captureBlockedReason = newcomerCheck.reason;
          hasStateChange = true;
          continue;
        }
      }

      // 5. Weekly capture quota and map capacity checks
      const capturerProfile = data.users[capturingUnit.ownerId]?.profile;
      const weeklyLimit = econ.weeklyCaptureLimitPerPlayer || 10;
      if (capturerProfile && (capturerProfile.weeklyCapturesCount || 0) >= weeklyLimit) {
        base.captureProgress = 0;
        base.capturingPlayerId = null;
        base.captureBlockedReason = `Weekly conquest quota reached (${weeklyLimit} bases/week)`;
        hasStateChange = true;
        continue;
      }

      const maxBases = mapCfg.maxBasesPerPlayer || econ.maxBasesPerPlayerOnMap || 6;
      const ownedOnMap = data.bases.filter(
        (b) => (b.mapId || 'map_riverfront_assault') === baseMapId && b.ownerId === capturingUnit.ownerId
      ).length;
      if (ownedOnMap >= maxBases) {
        base.captureProgress = 0;
        base.capturingPlayerId = null;
        base.captureBlockedReason = `Maximum base capacity reached in this sector (${maxBases} max)`;
        hasStateChange = true;
        continue;
      }

      // Capture progresses
      base.captureBlockedReason = undefined;
      base.capturingPlayerId = capturingUnit.ownerId;
      base.captureProgress = Math.min(100, base.captureProgress + captureStep);
      hasStateChange = true;

      if (base.captureProgress >= 100) {
        this.resolveBaseCapture(base, capturingUnit, now);
      }
    }

    // 5. Economy, Power, Repair Depots, and Queue processing (Every 1 second)
    if (forceEconomyTick || now - this.lastEconomyTickMs >= 1000) {
      const elapsedSec = Math.max(0.1, (now - this.lastEconomyTickMs) / 1000);
      this.lastEconomyTickMs = now;
      const globalMult = econ.resourceGenerationMultiplier || 1.0;

      for (const base of data.bases) {
        if (!Array.isArray(base.buildings)) base.buildings = [];
        if (!Array.isArray(base.constructionQueue)) base.constructionQueue = [];
        if (!Array.isArray(base.productionQueue)) base.productionQueue = [];
        if (!base.resources) base.resources = { concrete: 500, steel: 500, aluminum: 300, fuel: 400 };
        if (!base.storageCap) base.storageCap = { concrete: 2500, steel: 2500, aluminum: 1800, fuel: 2000 };

        const baseMapId = base.mapId || 'map_riverfront_assault';
        const terrain = this.getTerrain(baseMapId);
        const power = this.computeBasePower(base);
        base.powerUsed = power.powerUsed;
        base.powerCapacity = power.powerCapacity;
        const lowPowerPenalty = power.powerUsed > power.powerCapacity ? 0.65 : 1.0;

        let concRate = econ.baseGenerationRates?.concrete ?? 2.5;
        let steelRate = econ.baseGenerationRates?.steel ?? 2.5;
        let alumRate = econ.baseGenerationRates?.aluminum ?? 1.5;
        let fuelRate = econ.baseGenerationRates?.fuel ?? 2.0;

        for (const b of base.buildings) {
          const bDef = gameStore.getEffectiveBuildingDef(b.type as BuildingType);
          if (bDef?.productionBonus && !b.isConstructing && b.health > 0 && bDef.enabled !== false) {
            const mult = 1 + (b.level - 1) * 0.4;
            if (bDef.productionBonus.concrete) concRate += bDef.productionBonus.concrete * mult;
            if (bDef.productionBonus.steel) steelRate += bDef.productionBonus.steel * mult;
            if (bDef.productionBonus.aluminum) alumRate += bDef.productionBonus.aluminum * mult;
            if (bDef.productionBonus.fuel) fuelRate += bDef.productionBonus.fuel * mult;
          }
        }

        concRate *= globalMult * lowPowerPenalty;
        steelRate *= globalMult * lowPowerPenalty;
        alumRate *= globalMult * lowPowerPenalty;
        fuelRate *= globalMult * lowPowerPenalty;

        base.productionRates = {
          concrete: Math.round(concRate * 10) / 10,
          steel: Math.round(steelRate * 10) / 10,
          aluminum: Math.round(alumRate * 10) / 10,
          fuel: Math.round(fuelRate * 10) / 10,
        };
        base.consumptionRates = this.computeBaseConsumptionRates(base);
        const ccLevel = (base.buildings || []).find((b) => b.type === 'command_center')?.level || 1;
        base.hqLevel = ccLevel;
        base.armorMultiplier = this.isAuthoritativeHomeBase(base) ? econ.homeBaseArmorMultiplier || 3.0 : 1.0;

        if (base.lifecycleState === 'rebuilding' && (!base.rebuildProtectionUntil || base.rebuildProtectionUntil <= now)) {
          base.lifecycleState = base.isProtected ? 'protected' : 'active';
        }

        const netFuelRate = Math.max(0, fuelRate - (base.consumptionRates.fuel || 0));
        base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + concRate * elapsedSec);
        base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + steelRate * elapsedSec);
        base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + alumRate * elapsedSec);
        base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + netFuelRate * elapsedSec);
        base.lastResourceUpdate = now;

        const ownerProfile = data.users[base.ownerId]?.profile;
        if (ownerProfile) {
          ownerProfile.totalResourcesHarvested += Math.round((concRate + steelRate + alumRate + fuelRate) * elapsedSec);
        }

        // Auto-heal / service friendly units near bases with a repair_depot or specialized servicing facilities
        const hasRepairDepot = base.buildings.some((b) => b.type === 'repair_depot' && !b.isConstructing && b.health > 0);
        const hasNavalDock = base.type === 'harbor' && base.buildings.some((b) => b.type === 'naval_dockyard' && !b.isConstructing && b.health > 0);
        const hasRailService = (base.type === 'rail' || base.type === 'train') && base.buildings.some((b) => (b.type === 'repair_depot' || b.type === 'rail_depot' || b.type === 'logistics_center') && !b.isConstructing && b.health > 0);
        const hasAirService = base.type === 'air' && base.buildings.some((b) => b.type === 'aviation_hangar' && !b.isConstructing && b.health > 0);
        const hasHeliService = base.type === 'helicopter' && base.buildings.some((b) => b.type === 'helicopter_hangar' && !b.isConstructing && b.health > 0);

        if (hasRepairDepot || hasNavalDock || hasRailService || hasAirService || hasHeliService) {
          for (const u of data.units) {
            if ((u.mapId || 'map_riverfront_assault') !== baseMapId) continue;
            if (u.ownerId === base.ownerId && u.health < u.maxHealth) {
              const d = Math.hypot(u.x - base.x, u.y - base.y);
              if (d <= base.radius + 3.0) {
                const uDef = gameStore.getEffectiveUnitDef(u.type);
                const canService =
                  hasRepairDepot ||
                  (hasNavalDock && uDef?.category === 'naval') ||
                  (hasRailService && uDef?.category === 'rail') ||
                  (hasAirService && (u.type === 'stormbringer_jet' || u.type === 'thunderbolt_bomber')) ||
                  (hasHeliService && (u.type === 'hawk_scout_heli' || u.type === 'cobra_gunship'));
                if (canService) {
                  u.health = Math.min(u.maxHealth, Math.round(u.health + u.maxHealth * 0.04));
                  hasStateChange = true;
                }
              }
            }
          }
        }

        // Process Construction Queue
        if (base.constructionQueue.length > 0) {
          const finishedOrders = base.constructionQueue.filter((o: ConstructionOrder) => o.finishTime <= now);
          base.constructionQueue = base.constructionQueue.filter((o: ConstructionOrder) => o.finishTime > now);

          for (const order of finishedOrders) {
            const existingBuilding = base.buildings.find((b: BuildingInstance) => b.type === order.buildingType);
            if (existingBuilding) {
              existingBuilding.level = order.targetLevel;
              existingBuilding.isConstructing = false;
              existingBuilding.health = existingBuilding.maxHealth = 500 + order.targetLevel * 250;
              if (order.offsetX !== undefined && order.offsetY !== undefined) {
                existingBuilding.offsetX = order.offsetX;
                existingBuilding.offsetY = order.offsetY;
              }
            } else {
              base.buildings.push({
                id: `bld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                type: order.buildingType,
                level: order.targetLevel,
                health: 500,
                maxHealth: 500,
                offsetX: order.offsetX,
                offsetY: order.offsetY,
              });
            }

            if (order.buildingType === 'command_center') {
              base.hqLevel = order.targetLevel;
            }

            const bDef = gameStore.getEffectiveBuildingDef(order.buildingType as BuildingType);
            if (bDef?.storageBonus) {
              if (bDef.storageBonus.concrete) base.storageCap.concrete += bDef.storageBonus.concrete;
              if (bDef.storageBonus.steel) base.storageCap.steel += bDef.storageBonus.steel;
              if (bDef.storageBonus.aluminum) base.storageCap.aluminum += bDef.storageBonus.aluminum;
              if (bDef.storageBonus.fuel) base.storageCap.fuel += bDef.storageBonus.fuel;
            }

            hasStateChange = true;
          }
        }

        // Process Unit Production Queue
        if (base.productionQueue.length > 0) {
          const finishedProd = base.productionQueue.filter((p: UnitProductionOrder) => p.finishTime <= now);
          base.productionQueue = base.productionQueue.filter((p: UnitProductionOrder) => p.finishTime > now);

          for (const prod of finishedProd) {
            const uDef = gameStore.getEffectiveUnitDef(prod.unitType as UnitType);
            if (uDef && uDef.enabled !== false) {
              let spawnX = Math.round(base.x + base.radius * 0.6);
              let spawnY = Math.round(base.y + base.radius * 0.6);
              let foundSpot = false;

              if (uDef.category === 'rail') {
                if (base.type !== 'train' && base.type !== 'rail') {
                  continue;
                }
                const connected = getConnectedRailwayCellsForBase(terrain, base);
                for (let r = 0; r <= base.radius + 6 && !foundSpot; r++) {
                  for (let dy = -r; dy <= r && !foundSpot; dy++) {
                    for (let dx = -r; dx <= r && !foundSpot; dx++) {
                      const tx = Math.round(base.x + dx);
                      const ty = Math.round(base.y + dy);
                      const key = `${tx},${ty}`;
                      if (connected.has(key)) {
                        const occupied = data.units.some((u) => Math.hypot(u.x - tx, u.y - ty) < 0.85);
                        if (!occupied) {
                          spawnX = tx;
                          spawnY = ty;
                          foundSpot = true;
                        }
                      }
                    }
                  }
                }

                if (!foundSpot) {
                  // Retain order in production queue as pending deployment (WAITING FOR RAIL ACCESS)
                  base.productionQueue.push({
                    ...prod,
                    status: 'WAITING FOR RAIL ACCESS',
                    blockedReason: 'Track exit or nearby railway cells are occupied or obstructed',
                    finishTime: now + 2000,
                  });
                  continue;
                }
              } else if (uDef.category === 'naval') {
                if (base.type !== 'harbor') {
                  continue;
                }
                for (let r = 1; r <= base.radius + 4 && !foundSpot; r++) {
                  for (let dy = -r; dy <= r && !foundSpot; dy++) {
                    for (let dx = -r; dx <= r && !foundSpot; dx++) {
                      const tx = Math.round(base.x + dx);
                      const ty = Math.round(base.y + dy);
                      if (isCellPassable(terrain, tx, ty, 'naval')) {
                        const occupied = data.units.some((u) => Math.hypot(u.x - tx, u.y - ty) < 0.75);
                        if (!occupied) {
                          spawnX = tx;
                          spawnY = ty;
                          foundSpot = true;
                        }
                      }
                    }
                  }
                }
                if (!foundSpot) {
                  base.productionQueue.push({
                    ...prod,
                    status: 'WAITING FOR BERTH',
                    blockedReason: 'Harbor naval berth water cells are occupied or obstructed',
                    finishTime: now + 2000,
                  });
                  continue;
                }
              } else {
                for (let r = 1; r <= base.radius + 3 && !foundSpot; r++) {
                  for (let a = 0; a < 16 && !foundSpot; a++) {
                    const angle = (a / 16) * Math.PI * 2;
                    const tx = Math.round(base.x + Math.cos(angle) * (base.radius * 0.65 + r * 0.4));
                    const ty = Math.round(base.y + Math.sin(angle) * (base.radius * 0.65 + r * 0.4));
                    if (isCellPassable(terrain, tx, ty, uDef.category)) {
                      spawnX = tx;
                      spawnY = ty;
                      foundSpot = true;
                    }
                  }
                }
              }

              const newUnit: Unit = {
                id: `unit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                mapId: baseMapId,
                type: prod.unitType,
                ownerId: base.ownerId,
                ownerName: base.ownerName,
                allianceId: base.allianceId,
                x: spawnX,
                y: spawnY,
                rotation: Math.random() * Math.PI * 2,
                health: uDef.maxHealth,
                maxHealth: uDef.maxHealth,
                command: 'idle',
                path: [],
                lastAttackTime: 0,
                kills: 0,
                homeBaseId: base.id,
              };

              data.units.push(newUnit);

              if (ownerProfile) {
                ownerProfile.totalUnitsProduced += 1;
                ownerProfile.score += 15;
                gameStore.recalculatePlayerProgression(ownerProfile);
              }
              const activeMatch = data.matches?.find((m) => m.status === 'active' && m.mapId === baseMapId);
              if (activeMatch) {
                activeMatch.totalUnitsSpawned += 1;
              }

              this.io?.to('authenticated_commanders').emit('unit:spawn', newUnit);
              hasStateChange = true;
            }
          }
        }
      }
    }

    // 6. Autonomous AI Commander Logic (Kodiak PMC) across maps
    if (settings.aiAggressionEnabled) {
      const aiInterval = this.aiDifficulty === 'hard' ? 2200 : this.aiDifficulty === 'medium' ? 3500 : 5500;
      if (now - this.lastAiTickMs >= aiInterval) {
        this.lastAiTickMs = now;
        if (this.updateAICommander(now)) {
          hasStateChange = true;
        }
      }
    }

    if (combatEvents.length > 0) {
      this.recentCombatEvents.unshift(...combatEvents);
      if (this.recentCombatEvents.length > 100) {
        this.recentCombatEvents = this.recentCombatEvents.slice(0, 100);
      }
      for (const evt of combatEvents) {
        this.io?.to('authenticated_commanders').emit('combat:event', evt);
      }
    }

    if (hasStateChange) {
      this.broadcastWorldSync(now);
    }

    if (now % 10000 < 150) {
      gameStore.saveData();
    }

    this.lastTickDurationMs = Math.round((performance.now() - tickStart) * 100) / 100;
  }

  // ==========================================================================
  // PHASE 4: COMBAT SIEGE BASE RELOCATION, NEUTRALIZATION & CAPTURE
  // ==========================================================================

  public destroyAndRelocateHomeBase(base: Base, attackerUnit: Unit, now: number) {
    const lockRes = gameStore.withLock(`home_destroy_${base.id}`, () => {
      const data = gameStore.getData();
      const econ = gameStore.getEconomyConfig();
      const previousMapId = base.mapId || 'map_riverfront_assault';
      const previousCoords = { x: base.x, y: base.y };
      const mapCfg = gameStore.getMapConfig(previousMapId);
      const ownerId = base.ownerId;
      const ownerProfile = data.users[ownerId]?.profile;

      // Transition through destroyed state first
      base.lifecycleState = 'destroyed';

      // Ensure no duplicate Home Base exists for this player
      data.bases = data.bases.filter((b) => !(b.ownerId === ownerId && b.isHomeBase && b.id !== base.id));

      // 1. Atomically reserve new safe spawn location on player's assigned home map
      const targetMapId = ownerProfile?.homeMapId || previousMapId;
      const spawnRes = gameStore.findAndReserveBaseSpawnLocation(targetMapId, ownerProfile?.allianceId, base.radius || 4, {
        preferredCoords: base.lastKnownValidCoords || previousCoords,
        ownerId,
        excludeBaseId: base.id,
      });

      let finalMapId = targetMapId;
      let finalX = base.x;
      let finalY = base.y;

      if (spawnRes.success) {
        finalMapId = spawnRes.mapId;
        finalX = spawnRes.x;
        finalY = spawnRes.y;
        gameStore.releaseSpawnReservation(spawnRes.reservationId);
      } else {
        const terrain = this.getTerrain(targetMapId);
        for (let r = 0; r < 50; r++) {
          const cx = Math.floor(Math.random() * (terrain[0]?.length - 12) + 6);
          const cy = Math.floor(Math.random() * (terrain.length - 12) + 6);
          if (isCellPassable(terrain, cx, cy, 'ground')) {
            finalX = cx;
            finalY = cy;
            break;
          }
        }
      }

      // 2. Relocate Home Base and preserve persistent HQ structures while resetting resettable facilities
      const persistentTypes: BuildingType[] = [
        'command_center',
        'command_bunker',
        'operations_center',
        'comms_tower',
        'radar_station',
        'storage_depot',
        'military_gate',
      ];
      const preservedStructures: BuildingInstance[] = [];
      const preservedNames: string[] = [];
      let resetBuildingsCount = 0;

      for (const existingBld of base.buildings || []) {
        if (persistentTypes.includes(existingBld.type)) {
          preservedStructures.push({
            ...existingBld,
            health: existingBld.maxHealth || 1000,
            isConstructing: false,
          });
          preservedNames.push(`${existingBld.type}:L${existingBld.level}`);
        } else if (existingBld.level > 1) {
          resetBuildingsCount += 1;
        }
      }

      if (!preservedStructures.some((b) => b.type === 'command_center')) {
        preservedStructures.unshift({
          id: `b_cc_${ownerId}`,
          type: 'command_center',
          level: base.hqLevel || 1,
          health: 1000,
          maxHealth: 1000,
        });
        preservedNames.push(`command_center:L${base.hqLevel || 1}`);
      }

      const resettableStarterFacilities: BuildingInstance[] = [
        { id: `b_cw_${ownerId}`, type: 'concrete_works', level: 1, health: 500, maxHealth: 500 },
        { id: `b_sf_${ownerId}`, type: 'steel_foundry', level: 1, health: 500, maxHealth: 500 },
        { id: `b_as_${ownerId}`, type: 'aluminum_smelter', level: 1, health: 400, maxHealth: 400 },
        { id: `b_fr_${ownerId}`, type: 'fuel_refinery', level: 1, health: 450, maxHealth: 450 },
        { id: `b_br_${ownerId}`, type: 'barracks', level: 1, health: 500, maxHealth: 500 },
        { id: `b_vf_${ownerId}`, type: 'vehicle_factory', level: 1, health: 700, maxHealth: 700 },
        { id: `b_vt_${ownerId}`, type: 'vulcan_turret', level: 1, health: 400, maxHealth: 400 },
      ];

      base.buildings = [...preservedStructures, ...resettableStarterFacilities];
      base.hqLevel = preservedStructures.find((b) => b.type === 'command_center')?.level || 1;
      base.armorMultiplier = econ.homeBaseArmorMultiplier || 3.0;
      base.mapId = finalMapId;
      base.x = finalX;
      base.y = finalY;
      base.lastKnownValidCoords = { x: finalX, y: finalY };
      base.lastReconstructionAt = now;
      base.health = base.maxHealth;
      base.defenseShield = base.maxShield;
      base.captureProgress = 0;
      base.capturingPlayerId = null;
      base.captureContested = false;
      base.captureBlockedReason = undefined;
      base.lifecycleState = 'rebuilding';

      const rebuildMinutes = econ.rebuildProtectionDurationMinutes || 30;
      const shieldExpiresAt = now + rebuildMinutes * 60000;
      base.rebuildProtectionUntil = shieldExpiresAt;
      base.isProtected = true;
      base.constructionQueue = [];
      base.productionQueue = [];

      // Guaranteed survivor resources
      base.resources = {
        concrete: Math.max(econ.startingResources.concrete * 0.5, Math.round(base.resources.concrete * 0.3)),
        steel: Math.max(econ.startingResources.steel * 0.5, Math.round(base.resources.steel * 0.3)),
        aluminum: Math.max(econ.startingResources.aluminum * 0.5, Math.round(base.resources.aluminum * 0.3)),
        fuel: Math.max(econ.startingResources.fuel * 0.5, Math.round(base.resources.fuel * 0.3)),
      };

      const destructionRecord = {
        id: `hbd_${now}_${Math.random().toString(36).substring(2, 6)}`,
        baseId: base.id,
        attackerId: attackerUnit.ownerId,
        attackerName: attackerUnit.ownerName,
        previousMapId,
        previousCoords,
        newMapId: finalMapId,
        newCoords: { x: finalX, y: finalY },
        persistentBuildingsPreserved: preservedNames,
        resetBuildingsCount,
        shieldExpiresAt,
        timestamp: now,
      };
      base.destructionHistory = [destructionRecord, ...(base.destructionHistory || [])].slice(0, 20);

      if (ownerProfile) {
        ownerProfile.homeBaseDestroyedCount = (ownerProfile.homeBaseDestroyedCount || 0) + 1;
        ownerProfile.homeBaseDestructionHistory = [
          destructionRecord,
          ...(ownerProfile.homeBaseDestructionHistory || []),
        ].slice(0, 20);
        ownerProfile.homeBaseId = base.id;
        ownerProfile.homeMapId = finalMapId;
        ownerProfile.currentMapId = finalMapId;
        gameStore.persistUser(ownerId);
      }

      // Attacker rewards
      const attackerProfile = data.users[attackerUnit.ownerId]?.profile;
      if (attackerProfile) {
        attackerProfile.score += 750;
        attackerProfile.totalBasesCaptured += 1;
        gameStore.recalculatePlayerProgression(attackerProfile);
      }

      // Record Battle Report
      const report = gameStore.recordBattleReport({
        mapId: previousMapId,
        mapName: mapCfg.name,
        type: 'home_base_destroyed',
        attackerId: attackerUnit.ownerId,
        attackerName: attackerUnit.ownerName,
        defenderId: ownerId,
        defenderName: base.ownerName,
        baseId: base.id,
        baseName: base.name,
        replacementBaseId: base.id,
        replacementCoords: { x: finalX, y: finalY },
        coords: { x: finalX, y: finalY },
        summary: `ATTACK ALERT: ${attackerUnit.ownerName} destroyed ${base.ownerName}'s Home Base in ${mapCfg.name}! High Command executed tactical relocation to sector ${finalMapId} at (${finalX}, ${finalY}) with a ${rebuildMinutes}-min Reconstruction Shield.`,
      });

      this.io?.to('authenticated_commanders').emit('battle:report', report);
      this.io?.to('authenticated_commanders').emit('notification:new', {
        id: `notif_hbd_${now}`,
        userId: ownerId,
        mapId: finalMapId,
        type: 'attack',
        title: 'Home Base Relocated & Rebuilding!',
        message: `Your Home Base was destroyed by ${attackerUnit.ownerName} and has reconstructed at (${finalX}, ${finalY}) under emergency shield protection!`,
        coords: { x: finalX, y: finalY },
        timestamp: now,
        read: false,
      });

      gameStore.persistBaseAndUnits(base, []);
      gameStore.saveData();
      this.broadcastWorldSync(now);
      return true;
    });
    return lockRes.result;
  }

  public neutralizeOrdinaryBase(base: Base, attackerUnit: Unit, now: number) {
    const lockRes = gameStore.withLock(`base_neutralize_${base.id}`, () => {
      // Idempotency: if already neutralized, do not repeat destruction or event broadcasting
      if (base.lifecycleState === 'neutralized') {
        return false;
      }

      const data = gameStore.getData();
      const econ = gameStore.getEconomyConfig();
      const mapId = base.mapId || 'map_riverfront_assault';
      const mapCfg = gameStore.getMapConfig(mapId);
      const oldOwnerId = base.ownerId;
      const oldOwnerName = base.ownerName;

      base.previousOwnerId = oldOwnerId;
      base.previousOwnerName = oldOwnerName;
      base.ownerId = 'neutral';
      base.ownerName = 'Neutral Territory';
      base.allianceId = null;
      base.lifecycleState = 'neutralized';
      base.neutralizedAt = now;
      base.neutralizedByPlayerId = attackerUnit.ownerId;
      base.health = 0; // Structural integrity clamped to zero
      base.defenseShield = 0;
      base.activeTurretsCount = 0;
      base.defensesIntact = false;
      base.captureProgress = 0;
      base.capturingPlayerId = null;
      base.captureContested = false;
      base.captureBlockedReason = 'Requires designated conquest vehicle (Dominator) to capture';

      // 50% eligible production buildings destroyed (deterministic rounding)
      const eligibleTypes: BuildingType[] = [
        'concrete_works',
        'steel_foundry',
        'aluminum_smelter',
        'fuel_refinery',
        'barracks',
        'vehicle_factory',
        'aviation_hangar',
        'helicopter_hangar',
        'naval_dockyard',
        'rail_depot',
        'power_station',
      ];
      const eligible = (base.buildings || []).filter((b) => eligibleTypes.includes(b.type));
      const destroyPct = econ.productionDestroyPercentOnNeutralize ?? 50;
      const destroyCount = Math.floor(eligible.length * (destroyPct / 100));

      eligible.sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
      const destroyedIds = new Set(eligible.slice(0, destroyCount).map((b) => b.id));

      base.buildings = (base.buildings || []).filter((b) => {
        if (destroyedIds.has(b.id)) return false;
        if (econ.destroyMaxCapBuildingsOnNeutralize !== false && b.type === 'logistics_center') return false;
        return true;
      });

      // Turrets set to destroyed (0 health) and disabled
      for (const b of base.buildings) {
        if (DEFENSIVE_TURRET_TYPES.includes(b.type)) {
          b.health = 0;
          b.isConstructing = false;
        } else {
          b.health = Math.round(b.maxHealth * 0.4);
        }
      }

      base.constructionQueue = [];
      base.productionQueue = [];

      // Clear targeting on neutralized base for non-conquest units and reassign homeBaseId for surviving former owner units
      const survivingFormerOwnerHome = data.bases.find((b) => b.ownerId === oldOwnerId && b.id !== base.id);
      for (const u of data.units) {
        if (u.targetBaseId === base.id) {
          if (u.type !== 'dominator_conquest') {
            u.targetBaseId = null;
            if (u.command === 'attack') {
              u.command = 'idle';
            }
          } else {
            u.command = 'move';
          }
        }
        if (u.homeBaseId === base.id && survivingFormerOwnerHome) {
          u.homeBaseId = survivingFormerOwnerHome.id;
        }
      }

      const power = this.computeBasePower(base);
      base.powerUsed = power.powerUsed;
      base.powerCapacity = power.powerCapacity;

      console.log(
        `[BaseLifecycle] Base neutralized: baseId=${base.id}, name='${base.name}', mapId=${mapId}, formerOwner=${oldOwnerName} (${oldOwnerId}), neutralizedBy=${attackerUnit.ownerName} (${attackerUnit.ownerId})`
      );

      const report = gameStore.recordBattleReport({
        mapId,
        mapName: mapCfg.name,
        type: 'base_neutralized',
        attackerId: attackerUnit.ownerId,
        attackerName: attackerUnit.ownerName,
        defenderId: oldOwnerId,
        defenderName: oldOwnerName,
        baseId: base.id,
        baseName: base.name,
        coords: { x: base.x, y: base.y },
        summary: `${attackerUnit.ownerName} eliminated defenses at '${base.name}' (${mapCfg.name}). 50% production capacity destroyed. Sector neutralized and open for conquest!`,
      });

      this.io?.to('authenticated_commanders').emit('battle:report', report);
      this.io?.to('authenticated_commanders').emit('base:neutralized', {
        baseId: base.id,
        mapId,
        neutralizedBy: attackerUnit.ownerName,
        previousOwnerId: oldOwnerId,
        previousOwnerName: oldOwnerName,
        lifecycleState: 'neutralized',
      });

      gameStore.persistBaseAndUnits(base, []);
      gameStore.saveData();
      this.broadcastWorldSync(now);
      return true;
    });
    return lockRes.result;
  }

  public resolveBaseCapture(base: Base, capturingUnit: Unit, now: number) {
    const lockRes = gameStore.withLock(`base_capture_${base.id}`, () => {
      // Idempotency: prevent double-capturing if already transferred in a concurrent tick
      if (base.ownerId === capturingUnit.ownerId && base.lifecycleState === 'active') {
        return false;
      }
      // Permanent home bases cannot be captured
      if (base.isHomeBase || base.type === 'home') {
        return false;
      }
      // Active, protected, or rebuilding bases with remaining structural integrity cannot be captured without neutralization
      if (!this.isBaseNeutralizedOrDestroyed(base) || base.defenseShield > 0 || this.hasActiveDefensiveTurrets(base)) {
        return false;
      }

      const data = gameStore.getData();
      const mapId = base.mapId || 'map_riverfront_assault';
      const mapCfg = gameStore.getMapConfig(mapId);
      const oldOwnerId = base.ownerId;
      const oldOwnerName = base.ownerName;

      // 1. Plunder 35% of stored resources to attacker's base
      const plunder: Resources = {
        concrete: Math.round(base.resources.concrete * 0.35),
        steel: Math.round(base.resources.steel * 0.35),
        aluminum: Math.round(base.resources.aluminum * 0.35),
        fuel: Math.round(base.resources.fuel * 0.35),
      };
      base.resources.concrete = Math.max(0, base.resources.concrete - plunder.concrete);
      base.resources.steel = Math.max(0, base.resources.steel - plunder.steel);
      base.resources.aluminum = Math.max(0, base.resources.aluminum - plunder.aluminum);
      base.resources.fuel = Math.max(0, base.resources.fuel - plunder.fuel);

      const attackerHome =
        data.bases.find((b) => b.ownerId === capturingUnit.ownerId && b.mapId === mapId) ||
        data.bases.find((b) => b.ownerId === capturingUnit.ownerId);

      if (attackerHome) {
        attackerHome.resources.concrete = Math.min(attackerHome.storageCap.concrete, attackerHome.resources.concrete + plunder.concrete);
        attackerHome.resources.steel = Math.min(attackerHome.storageCap.steel, attackerHome.resources.steel + plunder.steel);
        attackerHome.resources.aluminum = Math.min(attackerHome.storageCap.aluminum, attackerHome.resources.aluminum + plunder.aluminum);
        attackerHome.resources.fuel = Math.min(attackerHome.storageCap.fuel, attackerHome.resources.fuel + plunder.fuel);
      }

      // 2. Apply collateral damage to building levels & restore turrets
      let buildingsDamaged = 0;
      for (const bld of base.buildings) {
        if (bld.type !== 'command_center' && bld.level > 1) {
          bld.level -= 1;
          buildingsDamaged += 1;
        }
        bld.health = Math.round(bld.maxHealth * 0.5);
      }

      // Record capture in player history and store
      gameStore.recordPlayerBaseCapture(capturingUnit.ownerId, base.id, mapId, now);

      const capturerProfile = data.users[capturingUnit.ownerId]?.profile;
      if (capturerProfile) {
        capturerProfile.totalBasesCaptured += 1;
        capturerProfile.score += 500;
        gameStore.recalculatePlayerProgression(capturerProfile);
      }

      // Authoritatively resolve capturing commander identity and alliance
      const capturerDisplayName = capturerProfile?.username || capturingUnit.ownerName;
      const capturerAllianceId = capturerProfile?.allianceId || capturingUnit.allianceId || null;
      const capturerAlliance = capturerAllianceId ? data.alliances.find((a) => a.id === capturerAllianceId) : null;
      const allianceDisplay = capturerAlliance ? `${capturerAlliance.name} [${capturerAlliance.tag}]` : 'Independent';

      // Transfer territory ownership
      base.previousOwnerId = oldOwnerId !== 'neutral' ? oldOwnerId : base.previousOwnerId || null;
      base.previousOwnerName = oldOwnerName !== 'Neutral Territory' ? oldOwnerName : base.previousOwnerName || null;
      base.ownerId = capturingUnit.ownerId;
      base.ownerName = capturerDisplayName;
      base.allianceId = capturerAlliance?.id || null;
      base.allianceName = capturerAlliance?.name || null;
      base.allianceTag = capturerAlliance?.tag || null;

      // Maintain authoritative historical capture attribution
      base.capturedByUserId = capturingUnit.ownerId;
      base.capturedByName = capturerDisplayName;
      base.capturedAt = now;
      base.capturedAllianceId = capturerAlliance?.id || null;
      base.capturedAllianceName = capturerAlliance?.name || null;
      base.capturedAllianceTag = capturerAlliance?.tag || null;

      const captureRecord = {
        id: `cap_${now}_${Math.random().toString(36).substring(2, 6)}`,
        baseId: base.id,
        previousOwnerId: base.previousOwnerId,
        previousOwnerName: base.previousOwnerName,
        newOwnerId: base.ownerId,
        newOwnerName: base.ownerName,
        capturedByUserId: base.capturedByUserId,
        capturedByName: base.capturedByName,
        allianceId: base.allianceId,
        allianceName: base.allianceName,
        allianceTag: base.allianceTag,
        capturedAt: now,
      };
      base.captureHistory = base.captureHistory || [];
      base.captureHistory.unshift(captureRecord);
      if (base.captureHistory.length > 20) {
        base.captureHistory = base.captureHistory.slice(0, 20);
      }

      base.lifecycleState = 'active';
      base.neutralizedAt = null;
      base.neutralizedByPlayerId = null;
      base.captureBlockedReason = undefined;
      base.captureProgress = 0;
      base.capturingPlayerId = null;
      base.captureContested = false;
      base.health = Math.round(base.maxHealth * 0.5);
      base.defenseShield = Math.round(base.maxShield * 0.25);
      base.constructionQueue = [];
      base.productionQueue = [];

      // Clear targeting for capturing unit
      if (capturingUnit.targetBaseId === base.id) {
        capturingUnit.targetBaseId = null;
        if (capturingUnit.command === 'attack') {
          capturingUnit.command = 'idle';
        }
      }

      console.log(
        `[BaseConquest] Capture completed: baseId=${base.id}, name='${base.name}', mapId=${mapId}, newOwner=${capturerDisplayName} (${capturingUnit.ownerId}), alliance=${allianceDisplay}`
      );

      const report = gameStore.recordBattleReport({
        mapId,
        mapName: mapCfg.name,
        type: 'base_captured',
        attackerId: capturingUnit.ownerId,
        attackerName: capturerDisplayName,
        defenderId: oldOwnerId,
        defenderName: oldOwnerName,
        baseId: base.id,
        baseName: base.name,
        coords: { x: base.x, y: base.y },
        plunderedResources: plunder,
        buildingsDamaged,
        summary: `${capturerDisplayName} conquered and claimed '${base.name}' in ${mapCfg.name}! Alliance: ${allianceDisplay}`,
      });

      this.io?.to('authenticated_commanders').emit('battle:report', report);

      const notif: GameNotification = {
        id: `notif_cap_${now}`,
        userId: 'all',
        mapId,
        type: 'capture',
        title: 'BASE CAPTURED',
        message: `${capturerDisplayName} captured ${base.name}.\nAlliance: ${allianceDisplay}`,
        coords: { x: base.x, y: base.y },
        timestamp: now,
        read: false,
      };
      data.notifications.unshift(notif);

      data.chat.push({
        id: `chat_cap_${now}`,
        mapId,
        senderId: 'system',
        senderName: 'HQ War Net',
        channel: 'system',
        content: `BASE CAPTURED: ${capturerDisplayName} captured ${base.name}. Alliance: ${allianceDisplay}`,
        coords: { x: base.x, y: base.y },
        timestamp: now,
      });

      gameStore.persistBaseAndUnits(base, []);
      gameStore.saveData();
      this.io?.to('authenticated_commanders').emit('notification:new', notif);
      this.io?.to('authenticated_commanders').emit('base:captured', {
        baseId: base.id,
        baseName: base.name,
        mapId,
        newOwnerId: base.ownerId,
        newOwnerName: base.ownerName,
        allianceId: base.allianceId,
        allianceName: base.allianceName,
        allianceTag: base.allianceTag,
        capturedByUserId: base.capturedByUserId,
        capturedByName: base.capturedByName,
        capturedAt: base.capturedAt,
      });
      this.broadcastWorldSync(now);
      return true;
    });
    return lockRes.result;
  }

  // ==========================================================================
  // PHASE 2: MULTI-MAP HIGHWAY TRAVEL & INTER-SECTOR UNIT TRANSFER
  // ==========================================================================

  public transferUnitsAcrossHighway(
    userId: string,
    unitIds: string[],
    targetMapId: string
  ): {
    success: boolean;
    message?: string;
    transferredCount?: number;
    fuelCost?: number;
    targetMapId?: string;
    entryCoords?: { x: number; y: number };
  } {
    if (!Array.isArray(unitIds) || unitIds.length === 0) {
      return { success: false, message: 'Select at least one combat unit to transfer' };
    }

    const lockRes = gameStore.withLock(`transfer_${userId}`, () => {
      const data = gameStore.getData();
      const econ = gameStore.getEconomyConfig();

      const maxGroup = econ.maxSelectionGroupSize || 24;
      if (unitIds.length > maxGroup) {
        return { success: false, message: `Convoy size exceeds maximum group limit (${maxGroup} units)` };
      }

      const destMap = data.maps.find((m) => m.id === targetMapId && m.enabled);
      if (!destMap) {
        return { success: false, message: 'Destination sector is offline or invalid' };
      }

      const ownedUnits = data.units.filter((u) => unitIds.includes(u.id) && u.ownerId === userId);
      if (ownedUnits.length === 0 || ownedUnits.length !== unitIds.length) {
        return { success: false, message: 'One or more selected units are invalid or already in transit' };
      }

      const sourceMapId = ownedUnits[0].mapId || 'map_riverfront_assault';
      if (sourceMapId === targetMapId) {
        return { success: false, message: 'Units are already deployed in that sector' };
      }
      if (ownedUnits.some((u) => (u.mapId || 'map_riverfront_assault') !== sourceMapId)) {
        return { success: false, message: 'All units in a highway convoy must originate from the same sector' };
      }

      const sourceMap = gameStore.getMapConfig(sourceMapId);
      const exit = (sourceMap.highwayExits || []).find((ex) => ex.targetMapId === targetMapId);
      if (!exit) {
        return { success: false, message: `No direct Highway Corridor connects ${sourceMap.name} to ${destMap.name}` };
      }

      // Validate unit categories and proximity to Highway Exit or friendly Logistics Center
      const checkpointRadius = Math.max(10, (exit.radius || 5) + 5);
      const friendlyLogisticsBases = data.bases.filter(
        (b) =>
          b.ownerId === userId &&
          (b.mapId || 'map_riverfront_assault') === sourceMapId &&
          b.buildings.some((bld) => bld.type === 'logistics_center' && !bld.isConstructing && bld.health > 0)
      );

      for (const u of ownedUnits) {
        const uDef = gameStore.getEffectiveUnitDef(u.type);
        const cat = uDef?.category || 'ground';
        if (!exit.allowedCategories.includes(cat)) {
          return {
            success: false,
            message: `${uDef?.name || u.type} (${cat.toUpperCase()}) cannot traverse ${exit.name}`,
          };
        }

        const distToExit = Math.hypot(u.x - exit.x, u.y - exit.y);
        const nearLogisticsBase = friendlyLogisticsBases.some(
          (b) => Math.hypot(u.x - b.x, u.y - b.y) <= b.radius + 8
        );
        if (distToExit > checkpointRadius && !nearLogisticsBase) {
          return {
            success: false,
            message: `Move selected units to ${exit.name} (X:${exit.x}, Y:${exit.y}) to initiate inter-sector highway transit`,
          };
        }
      }

      // Check destination map capacity
      const destMapUnits = data.units.filter((u) => (u.mapId || 'map_riverfront_assault') === targetMapId);
      const maxOnDestMap = destMap.maxUnitsOnMap || econ.maxUnitsPerMap || 160;
      if (destMapUnits.length + ownedUnits.length > maxOnDestMap) {
        return {
          success: false,
          message: `Destination sector unit capacity reached (${destMapUnits.length}/${maxOnDestMap})`,
        };
      }

      // Calculate fuel cost & deduct from player's logistics base on source map (or home base)
      const fuelMult = econ.fuelTravelCostMultiplier || 1.0;
      const totalFuelCost = Math.round(ownedUnits.length * exit.fuelCostPerUnit * fuelMult);

      const logisticsBase =
        data.bases.find((b) => b.ownerId === userId && (b.mapId || 'map_riverfront_assault') === sourceMapId && b.resources.fuel >= totalFuelCost) ||
        data.bases.find((b) => b.ownerId === userId && b.resources.fuel >= totalFuelCost);

      if (!logisticsBase) {
        return {
          success: false,
          message: `Insufficient Fuel for Highway Convoy (${totalFuelCost} Fuel required)`,
        };
      }

      logisticsBase.resources.fuel -= totalFuelCost;

      // Move units to destination map entry zone with passable formation offsets
      const destTerrain = this.getTerrain(targetMapId);
      const cols = Math.ceil(Math.sqrt(ownedUnits.length));

      ownedUnits.forEach((u, idx) => {
        const uDef = gameStore.getEffectiveUnitDef(u.type);
        const cat = uDef?.category || 'ground';
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const baseTx = Math.round(exit.entryX + (col - (cols - 1) / 2) * 1.5);
        const baseTy = Math.round(exit.entryY + (row - (cols - 1) / 2) * 1.5);

        let finalX = Math.max(2, Math.min(97, baseTx));
        let finalY = Math.max(2, Math.min(72, baseTy));

        if (!isCellPassable(destTerrain, finalX, finalY, cat)) {
          let found = false;
          for (let r = 1; r <= 10 && !found; r++) {
            for (let a = 0; a < 16 && !found; a++) {
              const ang = (a / 16) * Math.PI * 2;
              const tx = Math.max(2, Math.min(97, Math.round(exit.entryX + Math.cos(ang) * r)));
              const ty = Math.max(2, Math.min(72, Math.round(exit.entryY + Math.sin(ang) * r)));
              if (isCellPassable(destTerrain, tx, ty, cat)) {
                finalX = tx;
                finalY = ty;
                found = true;
              }
            }
          }
        }

        u.mapId = targetMapId;
        u.x = finalX;
        u.y = finalY;
        u.path = [];
        u.command = 'idle';
        u.targetUnitId = null;
        u.targetBaseId = null;
      });

      const userProfile = data.users[userId]?.profile;
      if (userProfile) {
        userProfile.highwayTransfersCompleted = (userProfile.highwayTransfersCompleted || 0) + 1;
        userProfile.score += ownedUnits.length * 10;
        userProfile.currentMapId = targetMapId;
        gameStore.recalculatePlayerProgression(userProfile);
        gameStore.persistUser(userId);
      }

      gameStore.recordBattleReport({
        mapId: targetMapId,
        mapName: destMap.name,
        type: 'highway_transfer',
        attackerId: userId,
        attackerName: userProfile?.username || 'Commander',
        defenderId: 'neutral',
        defenderName: destMap.name,
        coords: { x: exit.entryX, y: exit.entryY },
        unitsTransferred: ownedUnits.length,
        fuelSpent: totalFuelCost,
        summary: `Redeployed ${ownedUnits.length} unit(s) via ${exit.name} into ${destMap.name} (-${totalFuelCost} Fuel).`,
      });

      gameStore.persistBaseAndUnits(logisticsBase, ownedUnits);
      gameStore.saveData();
      this.broadcastWorldSync();

      return {
        success: true,
        transferredCount: ownedUnits.length,
        fuelCost: totalFuelCost,
        targetMapId,
        entryCoords: { x: exit.entryX, y: exit.entryY },
      };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Highway transfer already in progress for your command' };
    }
    return lockRes.result!;
  }

  // Real RTS AI Commander for Kodiak PMC ('enemy_insurgent') across maps
  private updateAICommander(_now: number): boolean {
    const data = gameStore.getData();
    const aiOwnerId = 'enemy_insurgent';
    gameStore.recordBotActivity(aiOwnerId, this.aiDifficulty, _now);
    const aiBases = data.bases.filter((b) => b.ownerId === aiOwnerId);
    if (aiBases.length === 0) return false;

    let changed = false;
    const maxAiUnitsPerMap = this.aiDifficulty === 'hard' ? 16 : this.aiDifficulty === 'medium' ? 10 : 6;

    for (const base of aiBases) {
      const baseMapId = base.mapId || 'map_riverfront_assault';
      const mapAiUnits = data.units.filter(
        (u) => u.ownerId === aiOwnerId && (u.mapId || 'map_riverfront_assault') === baseMapId
      );

      if (this.aiDifficulty === 'hard') {
        base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + 25);
        base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + 25);
        base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + 18);
        base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + 20);
      }

      if (base.constructionQueue.length === 0) {
        const desiredBuildings: BuildingType[] = [
          'vehicle_factory',
          'aviation_hangar',
          'helicopter_hangar',
          'naval_dockyard',
          'rail_depot',
          'concrete_works',
          'steel_foundry',
          'fuel_refinery',
          'vulcan_turret',
          'sam_launcher',
          'repair_depot',
        ];
        for (const bType of desiredBuildings) {
          const bDef = gameStore.getEffectiveBuildingDef(bType);
          if (!bDef || bDef.enabled === false || !bDef.baseTypesAllowed.includes(base.type)) continue;
          const existing = base.buildings.find((b) => b.type === bType);
          if (!existing || (this.aiDifficulty !== 'easy' && existing.level < 2)) {
            const res = this.buildOrUpgrade(aiOwnerId, base.id, bType);
            if (res.success) {
              changed = true;
              break;
            }
          }
        }
      }

      if (base.productionQueue.length < 2 && mapAiUnits.length < maxAiUnitsPerMap) {
        const candidateUnits: UnitType[] = [
          'vanguard_scout',
          'ironclad_apc',
          'titan_mbt',
          'goliath_howitzer',
          'skyguard_aa',
          'hawk_scout_heli',
          'cobra_gunship',
          'stormbringer_jet',
          'thunderbolt_bomber',
          'wavecutter_corvette',
          'trident_destroyer',
          'iron_dreadnought',
          'dominator_conquest',
        ];
        const validUnits = candidateUnits.filter((uType) => {
          const uDef = gameStore.getEffectiveUnitDef(uType);
          return (
            uDef &&
            uDef.enabled !== false &&
            base.buildings.some((b) => b.type === uDef.requiredBuilding && !b.isConstructing && b.health > 0)
          );
        });
        if (validUnits.length > 0) {
          const chosen = validUnits[Math.floor(Math.random() * validUnits.length)];
          const res = this.produceUnit(aiOwnerId, base.id, chosen);
          if (res.success) changed = true;
        }
      }
    }

    // Tactical unit decisions per map
    for (const mapCfg of data.maps) {
      if (!mapCfg.enabled) continue;
      const mapId = mapCfg.id;
      const terrain = this.getTerrain(mapId);
      const mapAiBases = aiBases.filter((b) => (b.mapId || 'map_riverfront_assault') === mapId);
      if (mapAiBases.length === 0) continue;

      const primaryAiBase = mapAiBases[0];
      const mapAiUnits = data.units.filter(
        (u) => u.ownerId === aiOwnerId && (u.mapId || 'map_riverfront_assault') === mapId
      );

      let threatenedBase: Base | null = null;
      let threatUnit: Unit | null = null;
      for (const base of mapAiBases) {
        const attacker = data.units.find(
          (u) =>
            (u.mapId || 'map_riverfront_assault') === mapId &&
            u.ownerId !== aiOwnerId &&
            Math.hypot(u.x - base.x, u.y - base.y) <= base.radius + 10
        );
        if (attacker) {
          threatenedBase = base;
          threatUnit = attacker;
          break;
        }
      }

      for (const unit of mapAiUnits) {
        const uDef = gameStore.getEffectiveUnitDef(unit.type);
        if (!uDef) continue;

        if (unit.health < unit.maxHealth * 0.25 && unit.command !== 'retreat') {
          const distToHome = Math.hypot(unit.x - primaryAiBase.x, unit.y - primaryAiBase.y);
          if (distToHome > primaryAiBase.radius + 2) {
            unit.command = 'retreat';
            unit.targetUnitId = null;
            unit.path = findPath(terrain, unit.x, unit.y, primaryAiBase.x, primaryAiBase.y, uDef.category);
            changed = true;
            continue;
          }
        }

        if (threatenedBase && threatUnit && unit.command === 'idle') {
          unit.command = 'attack';
          unit.targetUnitId = threatUnit.id;
          unit.path = findPath(terrain, unit.x, unit.y, threatUnit.x, threatUnit.y, uDef.category);
          changed = true;
          continue;
        }
      }

      const idleAiUnits = mapAiUnits.filter((u) => u.command === 'idle' && u.health > u.maxHealth * 0.6);
      const waveSize = this.aiDifficulty === 'hard' ? 4 : this.aiDifficulty === 'medium' ? 3 : 2;

      if (idleAiUnits.length >= waveSize) {
        const nonAiBases = data.bases.filter(
          (b) =>
            (b.mapId || 'map_riverfront_assault') === mapId &&
            b.ownerId !== aiOwnerId &&
            !this.isBaseProtectedNow(b)
        );
        if (nonAiBases.length > 0) {
          nonAiBases.sort(
            (a, b) =>
              Math.hypot(a.x - primaryAiBase.x, a.y - primaryAiBase.y) -
              Math.hypot(b.x - primaryAiBase.x, b.y - primaryAiBase.y)
          );
          const targetBase =
            this.aiDifficulty === 'hard'
              ? nonAiBases.find((b) => b.ownerId !== 'neutral') || nonAiBases[0]
              : nonAiBases[0];

          const waveUnits = idleAiUnits.slice(0, waveSize);
          this.commandUnits(
            aiOwnerId,
            waveUnits.map((u) => u.id),
            'attack',
            targetBase.x,
            targetBase.y,
            undefined,
            targetBase.id
          );
          changed = true;
        }
      } else {
        const idleScout = idleAiUnits.find((u) => u.type === 'vanguard_scout' || u.type === 'hawk_scout_heli');
        if (idleScout && Math.random() < 0.35) {
          const patrolX = Math.round(30 + Math.random() * 40);
          const patrolY = Math.round(20 + Math.random() * 35);
          this.commandUnits(aiOwnerId, [idleScout.id], 'patrol', patrolX, patrolY);
          changed = true;
        }
      }
    }

    return changed;
  }

  // Issue command to units with tactical formation spacing, terrain validation, and group size enforcement
  public commandUnits(
    userId: string,
    unitIds: string[],
    command: 'move' | 'attack' | 'attack_move' | 'hold' | 'patrol' | 'retreat' | 'stop',
    targetX?: number,
    targetY?: number,
    targetUnitId?: string,
    targetBaseId?: string
  ): { success: boolean; commandedCount: number; message?: string } {
    const data = gameStore.getData();
    const econ = gameStore.getEconomyConfig();
    const maxSelection = econ.maxSelectionGroupSize || 24;
    const cappedIds = Array.isArray(unitIds) ? unitIds.slice(0, maxSelection) : [];

    const authorizedUnits = data.units.filter((u) => cappedIds.includes(u.id) && u.ownerId === userId);
    if (authorizedUnits.length === 0) {
      return { success: false, commandedCount: 0, message: 'No owned units selected for command' };
    }

    if (
      !targetUnitId &&
      !targetBaseId &&
      (command === 'move' || command === 'attack' || command === 'attack_move' || command === 'patrol') &&
      targetX !== undefined &&
      targetY !== undefined
    ) {
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || targetX < 0 || targetX >= 100 || targetY < 0 || targetY >= 75) {
        return { success: false, commandedCount: 0, message: 'Target coordinates are outside sector boundaries' };
      }
    }

    const primaryMapId = authorizedUnits[0].mapId || 'map_riverfront_assault';
    if (targetBaseId) {
      const targetBaseOnMap = data.bases.find(
        (b) => b.id === targetBaseId && (b.mapId || 'map_riverfront_assault') === primaryMapId
      );
      if (!targetBaseOnMap) {
        return { success: false, commandedCount: 0, message: 'Target base not found in current sector' };
      }
      if (command === 'attack') {
        if (
          targetBaseOnMap.ownerId === userId ||
          (authorizedUnits[0].allianceId &&
            targetBaseOnMap.allianceId &&
            authorizedUnits[0].allianceId === targetBaseOnMap.allianceId)
        ) {
          return { success: false, commandedCount: 0, message: 'Cannot attack a friendly or allied base' };
        }
        if (this.isBaseProtectedNow(targetBaseOnMap)) {
          return {
            success: false,
            commandedCount: 0,
            message: 'Target base is shielded by active command protection',
          };
        }
      }
    }

    if (targetUnitId && command === 'attack') {
      const targetUnitOnMap = data.units.find(
        (u) => u.id === targetUnitId && (u.mapId || 'map_riverfront_assault') === primaryMapId
      );
      if (!targetUnitOnMap) {
        return { success: false, commandedCount: 0, message: 'Target unit not found in current sector' };
      }
      if (
        targetUnitOnMap.ownerId === userId ||
        (authorizedUnits[0].allianceId &&
          targetUnitOnMap.allianceId &&
          authorizedUnits[0].allianceId === targetUnitOnMap.allianceId)
      ) {
        return { success: false, commandedCount: 0, message: 'Cannot attack a friendly or allied unit' };
      }
    }

    gameStore.recordMeaningfulPlayerActivity(userId);

    // If issuing an offensive attack against another player's or garrison's assets, forfeit beginner protection
    if (command === 'attack' && (targetUnitId || targetBaseId)) {
      const attackerProfile = data.users[userId]?.profile;
      if (attackerProfile && attackerProfile.beginnerProtectionUntil > Date.now()) {
        attackerProfile.beginnerProtectionUntil = 0;
      }
    }

    const total = authorizedUnits.length;
    const cols = Math.ceil(Math.sqrt(total));
    let commandedCount = 0;
    let lastRejectionReason = '';

    authorizedUnits.forEach((unit, idx) => {
      const unitMapId = unit.mapId || 'map_riverfront_assault';
      const terrain = this.getTerrain(unitMapId);
      const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
      const category = def?.category || 'ground';

      if (command !== 'patrol') {
        unit.patrolStartX = undefined;
        unit.patrolStartY = undefined;
        unit.patrolTargetX = undefined;
        unit.patrolTargetY = undefined;
      }

      if (command === 'hold' || command === 'stop') {
        unit.command = command;
        unit.targetUnitId = null;
        unit.targetBaseId = null;
        unit.path = [];
        commandedCount++;
        return;
      }

      if (command === 'retreat') {
        const homeBase =
          data.bases.find((b) => b.id === unit.homeBaseId && (b.mapId || 'map_riverfront_assault') === unitMapId) ||
          data.bases.find((b) => b.ownerId === userId && (b.mapId || 'map_riverfront_assault') === unitMapId);
        if (homeBase) {
          unit.command = 'retreat';
          unit.targetUnitId = null;
          unit.targetBaseId = null;
          unit.path = findPath(terrain, unit.x, unit.y, homeBase.x, homeBase.y, category);
          commandedCount++;
        } else {
          lastRejectionReason = 'No friendly base available in this sector for retreat';
        }
        return;
      }

      if (command === 'move' || command === 'attack' || command === 'attack_move' || command === 'patrol') {
        let effectiveCommand: Unit['command'] = command;
        let effectiveTargetUnitId = targetUnitId || null;
        let effectiveTargetBaseId = targetBaseId || null;

        let rawDestX = targetX ?? unit.x;
        let rawDestY = targetY ?? unit.y;

        if (effectiveTargetBaseId) {
          const tBase = data.bases.find(
            (b) => b.id === effectiveTargetBaseId && (b.mapId || 'map_riverfront_assault') === unitMapId
          );
          if (!tBase) {
            lastRejectionReason = 'Target base not found in current sector';
            return;
          }
          if (this.isBaseNeutralizedOrDestroyed(tBase)) {
            if (def?.canCaptureBase) {
              effectiveTargetBaseId = null;
              effectiveCommand = 'move';
              rawDestX = tBase.x;
              rawDestY = tBase.y;
            } else if (command === 'attack') {
              lastRejectionReason = 'Base is already neutralized — deploy a Dominator Command Vehicle to capture it';
              return;
            } else {
              effectiveTargetBaseId = null;
              effectiveCommand = 'move';
              rawDestX = tBase.x;
              rawDestY = tBase.y;
            }
          } else {
            if (command === 'attack' && !def?.targets.includes('ground')) {
              lastRejectionReason = `${def?.name || unit.type} weapons cannot target surface installations`;
              return;
            }
            const approach = this.findApproachPointForBase(
              terrain,
              unit.x,
              unit.y,
              tBase,
              category,
              def?.attackRange || 5
            );
            rawDestX = approach.x;
            rawDestY = approach.y;
          }
        } else if (effectiveTargetUnitId) {
          const tUnit = data.units.find(
            (u) => u.id === effectiveTargetUnitId && (u.mapId || 'map_riverfront_assault') === unitMapId
          );
          if (!tUnit) {
            lastRejectionReason = 'Target unit not found in current sector';
            return;
          }
          const tDef = gameStore.getEffectiveUnitDef(tUnit.type as UnitType);
          if (command === 'attack' && tDef && !def?.targets.includes(tDef.category)) {
            lastRejectionReason = `${def?.name || unit.type} weapons cannot engage ${tDef.category.toUpperCase()} targets`;
            return;
          }
          rawDestX = tUnit.x;
          rawDestY = tUnit.y;
        }

        // Validate direct terrain destination passability for non-AI coordinate orders
        if (!effectiveTargetUnitId && !effectiveTargetBaseId && userId !== 'enemy_insurgent') {
          const checkX = Math.round(rawDestX);
          const checkY = Math.round(rawDestY);
          if (!isCellPassable(terrain, checkX, checkY, category)) {
            if (category === 'rail') {
              lastRejectionReason = 'Rail units can only move along connected railway tracks.';
            } else if (category === 'naval') {
              lastRejectionReason = 'Naval vessels can only navigate passable water sectors.';
            } else if (category === 'ground') {
              lastRejectionReason = 'Ground units cannot traverse deep water or impassable mountain terrain.';
            } else {
              lastRejectionReason = 'Destination terrain is impassable for this unit.';
            }
            return;
          }
        }

        let destX = rawDestX;
        let destY = rawDestY;

        if (category === 'rail') {
          let path: Array<{ x: number; y: number }> = [];
          if (effectiveTargetBaseId) {
            const tBase = data.bases.find((b) => b.id === effectiveTargetBaseId);
            const inRange =
              tBase && Math.hypot(tBase.x - unit.x, tBase.y - unit.y) <= (def?.attackRange || 10) + (tBase.radius || 4);
            if (!inRange) {
              path = findPath(terrain, unit.x, unit.y, destX, destY, 'rail');
              if (path.length === 0 && Math.hypot(destX - unit.x, destY - unit.y) >= 0.5) {
                lastRejectionReason = 'Target base is out of range of connected railway tracks.';
                return;
              }
            }
          } else {
            path = findPath(terrain, unit.x, unit.y, destX, destY, 'rail');
            if (path.length === 0 && Math.hypot(destX - unit.x, destY - unit.y) >= 0.5) {
              lastRejectionReason = 'Destination is not on a connected railway track network.';
              return;
            }
          }
          unit.command = effectiveCommand;
          unit.targetUnitId = effectiveTargetUnitId;
          unit.targetBaseId = effectiveTargetBaseId;
          unit.path = path;
          if (effectiveCommand === 'patrol') {
            unit.patrolStartX = unit.x;
            unit.patrolStartY = unit.y;
            unit.patrolTargetX = destX;
            unit.patrolTargetY = destY;
          }
          commandedCount++;
        } else {
          if (total > 1 && !effectiveTargetUnitId && !effectiveTargetBaseId) {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            const spacing = 1.35;
            const offsetX = (col - (cols - 1) / 2) * spacing;
            const offsetY = (row - (Math.ceil(total / cols) - 1) / 2) * spacing;
            const candidateX = Math.max(1, Math.min(98, destX + offsetX));
            const candidateY = Math.max(1, Math.min(73, destY + offsetY));
            if (isCellPassable(terrain, Math.round(candidateX), Math.round(candidateY), category)) {
              destX = candidateX;
              destY = candidateY;
            }
          }
          let path: Array<{ x: number; y: number }> = [];
          if (effectiveTargetBaseId) {
            const tBase = data.bases.find((b) => b.id === effectiveTargetBaseId);
            const inRange =
              tBase &&
              Math.hypot(tBase.x - unit.x, tBase.y - unit.y) <= (def?.attackRange || 5) + (tBase.radius || 4) - 0.25;
            if (!inRange) {
              path = findPath(terrain, unit.x, unit.y, destX, destY, category);
            }
          } else {
            path = findPath(terrain, unit.x, unit.y, destX, destY, category);
            if (path.length === 0 && Math.hypot(destX - unit.x, destY - unit.y) >= 1.0 && !effectiveTargetUnitId) {
              lastRejectionReason = 'No passable route to target coordinates.';
              return;
            }
          }
          unit.command = effectiveCommand;
          unit.targetUnitId = effectiveTargetUnitId;
          unit.targetBaseId = effectiveTargetBaseId;
          unit.path = path;
          if (effectiveCommand === 'patrol') {
            unit.patrolStartX = unit.x;
            unit.patrolStartY = unit.y;
            unit.patrolTargetX = destX;
            unit.patrolTargetY = destY;
          }
          commandedCount++;
        }
      }
    });

    if (commandedCount === 0) {
      return {
        success: false,
        commandedCount: 0,
        message: lastRejectionReason || 'Unable to execute command on selected terrain',
      };
    }

    this.broadcastWorldSync();
    return { success: true, commandedCount };
  }

  // Enqueue building construction or upgrade with atomic lock & building cap checks
  public buildOrUpgrade(
    userId: string,
    baseId: string,
    buildingType: BuildingType,
    offsetX?: number,
    offsetY?: number
  ) {
    const lockRes = gameStore.withLock(`base_econ_${baseId}`, () => {
      const data = gameStore.getData();
      const econ = gameStore.getEconomyConfig();
      const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
      if (!base) return { success: false, message: 'Base not found or unauthorized' };
      if (this.isBaseNeutralizedOrDestroyed(base)) {
        return { success: false, message: 'Base is neutralized and cannot construct facilities' };
      }

      const bDef = gameStore.getEffectiveBuildingDef(buildingType);
      if (!bDef) return { success: false, message: 'Invalid building type' };
      if (bDef.enabled === false) return { success: false, message: 'This facility is currently disabled by Command' };
      if (!bDef.baseTypesAllowed.includes(base.type)) {
        return {
          success: false,
          message: `${bDef.name} cannot be constructed at a ${base.type.toUpperCase()} installation`,
        };
      }

      if (base.constructionQueue.some((o) => o.buildingType === buildingType)) {
        return { success: false, message: `${bDef.name} is already queued in the construction bay` };
      }

      const existing = base.buildings.find((b: BuildingInstance) => b.type === buildingType);
      const maxBuildings = econ.maxBuildingsPerBase || 16;
      if (!existing && base.buildings.length + base.constructionQueue.length >= maxBuildings) {
        return { success: false, message: `Base facility slot limit reached (${maxBuildings} buildings max)` };
      }

      if (offsetX !== undefined && offsetY !== undefined) {
        const maxPerimeterRadius = (base.radius || 5) + 0.5;
        if (Math.hypot(offsetX, offsetY) > maxPerimeterRadius) {
          const reason = `Placement coordinates (${offsetX}, ${offsetY}) exceed base perimeter radius (${maxPerimeterRadius})`;
          const userProf = data.users[userId]?.profile;
          if (userProf) {
            userProf.placementFailures = userProf.placementFailures || [];
            userProf.placementFailures.unshift({
              id: `pf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              mapId: base.mapId || 'map_riverfront_assault',
              attemptedCoords: { x: Math.round(base.x + offsetX), y: Math.round(base.y + offsetY) },
              reason,
              timestamp: Date.now(),
            });
            userProf.placementFailures = userProf.placementFailures.slice(0, 20);
          }
          return { success: false, message: reason };
        }

        const hasOverlap =
          base.buildings.some(
            (b) =>
              b.type !== buildingType &&
              b.offsetX !== undefined &&
              b.offsetY !== undefined &&
              Math.hypot(b.offsetX - offsetX, b.offsetY - offsetY) < 1.1
          ) ||
          base.constructionQueue.some(
            (o) =>
              o.offsetX !== undefined &&
              o.offsetY !== undefined &&
              Math.hypot(o.offsetX - offsetX, o.offsetY - offsetY) < 1.1
          );
        if (hasOverlap) {
          const reason = 'Placement conflicts with an existing or queued compound structure';
          const userProf = data.users[userId]?.profile;
          if (userProf) {
            userProf.placementFailures = userProf.placementFailures || [];
            userProf.placementFailures.unshift({
              id: `pf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              mapId: base.mapId || 'map_riverfront_assault',
              attemptedCoords: { x: Math.round(base.x + offsetX), y: Math.round(base.y + offsetY) },
              reason,
              timestamp: Date.now(),
            });
            userProf.placementFailures = userProf.placementFailures.slice(0, 20);
          }
          return { success: false, message: reason };
        }
      }

      const targetLevel = existing ? existing.level + 1 : 1;
      if (targetLevel > bDef.maxLevel) return { success: false, message: 'Max level already reached' };

      const levelMult = targetLevel === 1 ? 1 : 1 + (targetLevel - 1) * 0.5;
      const costMult = levelMult * (econ.buildingCostMultiplier || 1.0);
      const requiredConcrete = Math.round(bDef.cost.concrete * costMult);
      const requiredSteel = Math.round(bDef.cost.steel * costMult);
      const requiredAluminum = Math.round(bDef.cost.aluminum * costMult);
      const requiredFuel = Math.round(bDef.cost.fuel * costMult);

      if (
        base.resources.concrete < requiredConcrete ||
        base.resources.steel < requiredSteel ||
        base.resources.aluminum < requiredAluminum ||
        base.resources.fuel < requiredFuel
      ) {
        return { success: false, message: 'Insufficient resources' };
      }

      base.resources.concrete -= requiredConcrete;
      base.resources.steel -= requiredSteel;
      base.resources.aluminum -= requiredAluminum;
      base.resources.fuel -= requiredFuel;

      const speedMult = Math.max(0.2, econ.buildingBuildSpeedMultiplier || 1.0);
      const durationSec = Math.max(1, Math.round((bDef.buildTimeSec * levelMult) / speedMult));
      const now = Date.now();
      const orderId = `order_${now}_${Math.random().toString(36).substring(2, 6)}`;

      base.constructionQueue.push({
        id: orderId,
        baseId,
        buildingType,
        targetLevel,
        startTime: now,
        finishTime: now + durationSec * 1000,
        cost: {
          concrete: requiredConcrete,
          steel: requiredSteel,
          aluminum: requiredAluminum,
          fuel: requiredFuel,
        },
        offsetX,
        offsetY,
      });

      gameStore.recordMeaningfulPlayerActivity(userId, now);
      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return { success: true, orderId };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Another construction or production operation is currently processing' };
    }
    return lockRes.result!;
  }

  public cancelConstruction(userId: string, baseId: string, orderId: string) {
    const lockRes = gameStore.withLock(`base_econ_${baseId}`, () => {
      const data = gameStore.getData();
      const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
      if (!base) return { success: false, message: 'Base not found or unauthorized' };

      const idx = base.constructionQueue.findIndex((o) => o.id === orderId);
      if (idx === -1) {
        return { success: false, message: 'Construction order not found or already completed' };
      }

      const [removed] = base.constructionQueue.splice(idx, 1);
      const refunded: Resources = {
        concrete: removed.cost?.concrete || 0,
        steel: removed.cost?.steel || 0,
        aluminum: removed.cost?.aluminum || 0,
        fuel: removed.cost?.fuel || 0,
      };

      base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + refunded.concrete);
      base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + refunded.steel);
      base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + refunded.aluminum);
      base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + refunded.fuel);

      const now = Date.now();
      gameStore.recordMeaningfulPlayerActivity(userId, now);
      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return { success: true, refunded, message: 'Construction cancelled and resources refunded' };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Concurrent base operation in progress' };
    }
    return lockRes.result!;
  }

  // Enqueue unit production with atomic lock & per-map capacity checks
  public produceUnit(userId: string, baseId: string, unitType: UnitType) {
    const lockRes = gameStore.withLock(`base_econ_${baseId}`, () => {
      const data = gameStore.getData();
      const econ = gameStore.getEconomyConfig();
      const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
      if (!base) return { success: false, message: 'Base not found or unauthorized' };
      if (this.isBaseNeutralizedOrDestroyed(base)) {
        return { success: false, message: 'Base is neutralized and cannot produce units' };
      }

      const baseMapId = base.mapId || 'map_riverfront_assault';
      const mapCfg = gameStore.getMapConfig(baseMapId);

      const uDef = gameStore.getEffectiveUnitDef(unitType);
      if (!uDef) return { success: false, message: 'Invalid unit type' };
      if (uDef.enabled === false) return { success: false, message: 'This unit type is currently disabled by Command' };

      // Home Base ground-vehicle & infantry production specialization rule
      if (base.type === 'home' && uDef.category !== 'ground') {
        return {
          success: false,
          message: `Home Base Motor Pool is restricted to ground infantry and armored vehicles. Capture a specialized ${uDef.category.toUpperCase()} base to deploy ${uDef.name}.`,
        };
      }

      // Global, per-map, and per-player population cap checks
      if (data.units.length >= (econ.maxGlobalUnits || 450)) {
        return { success: false, message: 'Global theater unit cap reached' };
      }
      const mapUnitsCount = data.units.filter((u) => (u.mapId || 'map_riverfront_assault') === baseMapId).length;
      const maxMapUnits = mapCfg.maxUnitsOnMap || econ.maxUnitsPerMap || 160;
      if (mapUnitsCount >= maxMapUnits) {
        return { success: false, message: `Sector unit capacity reached (${mapUnitsCount}/${maxMapUnits})` };
      }

      const ownerBasesOnMapCount = Math.max(
        1,
        data.bases.filter((b) => b.ownerId === userId && (b.mapId || 'map_riverfront_assault') === baseMapId).length
      );
      const maxOwnerPop = Math.min(
        mapCfg.maxPopPerPlayer || 120,
        Math.max(40, ownerBasesOnMapCount * (econ.populationCapPerBase || 30))
      );
      const currentOwnerPop = data.units
        .filter((u) => u.ownerId === userId && (u.mapId || 'map_riverfront_assault') === baseMapId)
        .reduce((sum, u) => sum + (gameStore.getEffectiveUnitDef(u.type)?.populationCost || 1), 0);

      if (userId !== 'enemy_insurgent' && currentOwnerPop + uDef.populationCost > maxOwnerPop) {
        return { success: false, message: `Sector population capacity reached (${currentOwnerPop}/${maxOwnerPop})` };
      }

      const terrain = this.getTerrain(baseMapId);

      // Specialized Base Type & Infrastructure Validation
      if (unitType === 'stormbringer_jet' || unitType === 'thunderbolt_bomber') {
        if (base.type !== 'air') {
          return {
            success: false,
            message: 'Fixed-wing aircraft (Stormbringer / Thunderbolt) can only be produced at a specialized Air Base.',
          };
        }
        if (!this.hasValidRunwaySpace(terrain, base)) {
          return {
            success: false,
            message: 'Air Base runway deployment corridor is obstructed or lacks sufficient runway clearance.',
          };
        }
      } else if (unitType === 'hawk_scout_heli' || unitType === 'cobra_gunship') {
        if (base.type !== 'helicopter') {
          return {
            success: false,
            message: 'Rotorcraft (Hawk Scout / Cobra Gunship) can only be produced at a specialized Helicopter Base.',
          };
        }
        if (!this.hasValidHelipadSpace(terrain, base)) {
          return {
            success: false,
            message: 'Helicopter Base helipad deployment apron is obstructed.',
          };
        }
      } else if (uDef.category === 'naval') {
        if (base.type !== 'harbor') {
          return {
            success: false,
            message: 'Naval vessels can only be produced at a coastal Harbor Base.',
          };
        }
        if (!this.hasNavigableWaterAccess(terrain, base)) {
          return {
            success: false,
            message: 'Harbor Base has no navigable coastal water access for launching vessels.',
          };
        }
      } else if (uDef.category === 'rail') {
        if (base.type !== 'train' && base.type !== 'rail') {
          return {
            success: false,
            message: 'Armored rail units can only be produced at a Train Station Base or Armored Rail Base.',
          };
        }
        const connected = getConnectedRailwayCellsForBase(terrain, base);
        if (connected.size === 0) {
          return {
            success: false,
            message: 'Station has no connected railway track network for deploying armored trains.',
          };
        }
      } else if (uDef.requiredBuilding === 'vehicle_factory') {
        if (base.type !== 'tank' && base.type !== 'home') {
          return {
            success: false,
            message: 'Armored ground vehicles can only be produced at a Tank Base or Home Base Motor Pool.',
          };
        }
      }

      const reqBuilding = base.buildings.find(
        (b: BuildingInstance) => b.type === uDef.requiredBuilding && !b.isConstructing && b.health > 0 && b.level > 0
      );
      if (!reqBuilding) {
        return {
          success: false,
          message: `Requires operational ${gameStore.getEffectiveBuildingDef(uDef.requiredBuilding)?.name || 'facility'}`,
        };
      }

      const costMult = econ.unitCostMultiplier || 1.0;
      const reqConcrete = Math.round(uDef.cost.concrete * costMult);
      const reqSteel = Math.round(uDef.cost.steel * costMult);
      const reqAluminum = Math.round(uDef.cost.aluminum * costMult);
      const reqFuel = Math.round(uDef.cost.fuel * costMult);

      if (
        base.resources.concrete < reqConcrete ||
        base.resources.steel < reqSteel ||
        base.resources.aluminum < reqAluminum ||
        base.resources.fuel < reqFuel
      ) {
        return { success: false, message: 'Insufficient resources' };
      }

      base.resources.concrete -= reqConcrete;
      base.resources.steel -= reqSteel;
      base.resources.aluminum -= reqAluminum;
      base.resources.fuel -= reqFuel;

      const speedMult = Math.max(0.2, econ.unitProductionSpeedMultiplier || 1.0);
      const trainDurationSec = Math.max(1, Math.round(uDef.trainTimeSec / speedMult));
      const now = Date.now();
      const orderId = `prod_${now}_${Math.random().toString(36).substring(2, 6)}`;
      base.productionQueue.push({
        id: orderId,
        baseId,
        unitType,
        startTime: now,
        finishTime: now + trainDurationSec * 1000,
        cost: {
          concrete: reqConcrete,
          steel: reqSteel,
          aluminum: reqAluminum,
          fuel: reqFuel,
        },
      });

      gameStore.recordMeaningfulPlayerActivity(userId, now);
      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return { success: true, orderId };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Concurrent production request in progress' };
    }
    return lockRes.result!;
  }

  public cancelUnitProduction(userId: string, baseId: string, orderId: string) {
    const lockRes = gameStore.withLock(`base_econ_${baseId}`, () => {
      const data = gameStore.getData();
      const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
      if (!base) return { success: false, message: 'Base not found or unauthorized' };

      const idx = base.productionQueue.findIndex((p) => p.id === orderId);
      if (idx === -1) {
        return { success: false, message: 'Production order not found or already deployed' };
      }

      const [removed] = base.productionQueue.splice(idx, 1);
      const refunded: Resources = {
        concrete: removed.cost?.concrete || 0,
        steel: removed.cost?.steel || 0,
        aluminum: removed.cost?.aluminum || 0,
        fuel: removed.cost?.fuel || 0,
      };

      base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + refunded.concrete);
      base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + refunded.steel);
      base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + refunded.aluminum);
      base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + refunded.fuel);

      const now = Date.now();
      gameStore.recordMeaningfulPlayerActivity(userId, now);
      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return { success: true, refunded, message: 'Unit production order cancelled and resources refunded' };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Concurrent base operation in progress' };
    }
    return lockRes.result!;
  }

  public repairBuilding(userId: string, baseId: string, buildingId?: string) {
    const lockRes = gameStore.withLock(`base_econ_${baseId}`, () => {
      const data = gameStore.getData();
      const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
      if (!base) return { success: false, message: 'Base not found or unauthorized' };

      const targets =
        buildingId && buildingId !== 'all'
          ? base.buildings.filter((b) => b.id === buildingId && b.health < b.maxHealth)
          : base.buildings.filter((b) => b.health < b.maxHealth);

      const baseHullDamaged = (!buildingId || buildingId === 'all') && base.health < base.maxHealth;

      if (targets.length === 0 && !baseHullDamaged) {
        return { success: false, message: 'Selected structure is already at 100% structural integrity' };
      }

      let missingHp = targets.reduce((sum, b) => sum + (b.maxHealth - b.health), 0);
      if (baseHullDamaged) {
        missingHp += base.maxHealth - base.health;
      }

      const concreteCost = Math.max(15, Math.round(missingHp * 0.12));
      const steelCost = Math.max(10, Math.round(missingHp * 0.1));

      if (base.resources.concrete < concreteCost || base.resources.steel < steelCost) {
        return {
          success: false,
          message: `Insufficient repair materials (${concreteCost} Concrete, ${steelCost} Steel required)`,
        };
      }

      base.resources.concrete -= concreteCost;
      base.resources.steel -= steelCost;

      for (const bld of targets) {
        bld.health = bld.maxHealth;
      }
      if (baseHullDamaged) {
        base.health = base.maxHealth;
      }

      const now = Date.now();
      gameStore.recordMeaningfulPlayerActivity(userId, now);
      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return {
        success: true,
        repairedCount: targets.length + (baseHullDamaged ? 1 : 0),
        cost: { concrete: concreteCost, steel: steelCost },
        message: 'Engineering teams completed structural repairs',
      };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Concurrent base operation in progress' };
    }
    return lockRes.result!;
  }
}

export const gameSimulation = new GameSimulation();
