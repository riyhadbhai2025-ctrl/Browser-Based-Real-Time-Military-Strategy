import { Server, Socket } from 'socket.io';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath, isCellPassable } from '../src/game/pathfinder';
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

  private initAllMapTerrains() {
    const data = gameStore.getData();
    for (const m of data.maps || []) {
      const gen = generateWorld({
        width: m.width || 100,
        height: m.height || 75,
        tileSize: m.tileSize || 40,
        seed: m.seed || 202610,
      });
      this.terrainsByMap[m.id] = gen.terrain;
    }
    if (!this.terrainsByMap['map_riverfront_assault']) {
      const gen = generateWorld(this.worldConfig);
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

  public isBaseProtectedNow(base: Base, now = Date.now()): boolean {
    if (base.rebuildProtectionUntil && base.rebuildProtectionUntil > now) {
      return true;
    }
    const data = gameStore.getData();
    const owner = data.users[base.ownerId]?.profile;
    if (owner && owner.beginnerProtectionUntil && owner.beginnerProtectionUntil > now) {
      return true;
    }
    return false;
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
          return {
            ...b,
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

    // Sanitize enemy bases so private queues aren't leaked
    const sanitizedBases = mapBases.map((b) => {
      const friendly = isFriendly(b.ownerId, b.allianceId);
      const power = this.computeBasePower(b);
      return {
        ...b,
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

  private hasActiveDefensiveTurrets(base: Base): boolean {
    return (base.buildings || []).some(
      (b) => DEFENSIVE_TURRET_TYPES.includes(b.type) && !b.isConstructing && b.health > 0
    );
  }

  // Authoritative tick across all active sector maps
  private tick() {
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

    // 1. Move Units + Local Separation Avoidance (per map)
    for (const unit of data.units) {
      if (unit.path && unit.path.length > 0) {
        hasStateChange = true;
        const target = unit.path[0];
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.hypot(dx, dy);

        const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
        const speed = def?.speed || 3.0;
        const step = speed * dt;

        if (dist <= step) {
          unit.x = target.x;
          unit.y = target.y;
          unit.path.shift();
          if (unit.path.length === 0 && (unit.command === 'move' || unit.command === 'retreat')) {
            unit.command = 'idle';
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

      if (!targetUnit && unit.command !== 'retreat') {
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
      if (!targetUnit && unit.command !== 'retreat') {
        for (const base of data.bases) {
          if ((base.mapId || 'map_riverfront_assault') !== unitMapId) continue;
          if (base.ownerId === unit.ownerId) continue;
          if (unit.allianceId && base.allianceId && unit.allianceId === base.allianceId) continue;
          if (this.isBaseProtectedNow(base, now)) continue;

          const dist = Math.hypot(base.x - unit.x, base.y - unit.y);
          if (dist <= def.attackRange + base.radius) {
            unit.rotation = Math.atan2(base.y - unit.y, base.x - unit.x);
            unit.lastAttackTime = now;
            hasStateChange = true;

            // Attacking an enemy base forfeits attacker's beginner protection
            const attackerProfile = data.users[unit.ownerId]?.profile;
            if (attackerProfile && attackerProfile.beginnerProtectionUntil > now) {
              attackerProfile.beginnerProtectionUntil = 0;
            }

            const damage = Math.round(def.attackDamage * (unit.type === 'goliath_howitzer' ? 2.0 : 0.8));
            if (base.defenseShield > 0) {
              base.defenseShield = Math.max(0, base.defenseShield - damage);
            } else {
              // Damage active defensive turrets first so the base can be besieged and captured
              const activeTurret = base.buildings.find(
                (b) => DEFENSIVE_TURRET_TYPES.includes(b.type) && !b.isConstructing && b.health > 0
              );
              if (activeTurret) {
                activeTurret.health = Math.max(0, activeTurret.health - damage);
              }
              base.health = Math.max(100, base.health - damage);
            }

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
              timestamp: now,
            });
            break;
          }
        }
      }
    }

    // 3. Base Turrets Auto-Firing at Hostile Units on the same map
    for (const base of data.bases) {
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

        if (bestTarget && Math.random() < 0.22) {
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
      base.isProtected = this.isBaseProtectedNow(base, now);

      if (base.isProtected) {
        if (base.captureProgress > 0) {
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          base.captureContested = false;
          hasStateChange = true;
        }
        continue;
      }

      const conquestUnits = data.units.filter((u) => {
        if ((u.mapId || 'map_riverfront_assault') !== baseMapId) return false;
        if (u.type !== 'dominator_conquest' && u.type !== 'rifle_infantry') return false;
        const uDef = gameStore.getEffectiveUnitDef(u.type);
        if (!uDef?.canCaptureBase) return false;
        if (u.ownerId === base.ownerId) return false;
        if (base.allianceId && u.allianceId && base.allianceId === u.allianceId) return false;
        const dist = Math.hypot(u.x - base.x, u.y - base.y);
        return dist <= base.radius + 1.8;
      });

      // Group conquest units by faction (allianceId or ownerId) to detect contested captures
      const factionKeys = new Set(conquestUnits.map((u) => u.allianceId || `owner_${u.ownerId}`));
      const isContested = factionKeys.size > 1;
      base.captureContested = isContested;

      const defensesIntact = base.defenseShield > 0 || this.hasActiveDefensiveTurrets(base);

      if (conquestUnits.length > 0 && !defensesIntact) {
        if (isContested) {
          // Contested by multiple hostile factions: pause capture progress
          hasStateChange = true;
          continue;
        }

        const capturingUnit = conquestUnits[0];
        base.capturingPlayerId = capturingUnit.ownerId;
        base.captureProgress = Math.min(100, base.captureProgress + captureStep);
        hasStateChange = true;

        if (base.captureProgress >= 100) {
          this.resolveBaseCapture(base, capturingUnit, now);
        }
      } else if (base.captureProgress > 0) {
        base.captureProgress = Math.max(0, base.captureProgress - 2);
        if (base.captureProgress === 0) base.capturingPlayerId = null;
        hasStateChange = true;
      }
    }

    // 5. Economy, Power, Repair Depots, and Queue processing (Every 1 second)
    if (now - this.lastEconomyTickMs >= 1000) {
      const elapsedSec = (now - this.lastEconomyTickMs) / 1000;
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

        base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + concRate * elapsedSec);
        base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + steelRate * elapsedSec);
        base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + alumRate * elapsedSec);
        base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + fuelRate * elapsedSec);
        base.lastResourceUpdate = now;

        const ownerProfile = data.users[base.ownerId]?.profile;
        if (ownerProfile) {
          ownerProfile.totalResourcesHarvested += Math.round((concRate + steelRate + alumRate + fuelRate) * elapsedSec);
        }

        // Auto-heal friendly units near bases with a repair_depot on the same map
        const hasRepairDepot = base.buildings.some((b) => b.type === 'repair_depot' && !b.isConstructing && b.health > 0);
        if (hasRepairDepot) {
          for (const u of data.units) {
            if ((u.mapId || 'map_riverfront_assault') !== baseMapId) continue;
            if (u.ownerId === base.ownerId && u.health < u.maxHealth) {
              const d = Math.hypot(u.x - base.x, u.y - base.y);
              if (d <= base.radius + 2.5) {
                u.health = Math.min(u.maxHealth, Math.round(u.health + u.maxHealth * 0.04));
                hasStateChange = true;
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
  // PHASE 4: RESOLVE BASE CAPTURE, PLUNDER, COLLATERAL DAMAGE & HQ CAPITULATION
  // ==========================================================================

  private resolveBaseCapture(base: Base, capturingUnit: Unit, now: number) {
    const data = gameStore.getData();
    const econ = gameStore.getEconomyConfig();
    const mapId = base.mapId || 'map_riverfront_assault';
    const mapCfg = gameStore.getMapConfig(mapId);
    const oldOwnerId = base.ownerId;
    const oldOwnerName = base.ownerName;

    // 1. Plunder 35% of stored resources to attacker's home base
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

    // 2. Apply siege collateral damage to non-HQ building levels & restore turret health at level 1
    let buildingsDamaged = 0;
    for (const bld of base.buildings) {
      if (bld.type !== 'command_center' && bld.level > 1) {
        bld.level -= 1;
        buildingsDamaged += 1;
      }
      bld.health = Math.round(bld.maxHealth * 0.5);
    }

    const defenderProfile = data.users[oldOwnerId]?.profile;
    const isDefenderPrimaryHq = Boolean(defenderProfile && defenderProfile.homeBaseId === base.id);

    // Check per-map base cap for the capturing player
    const maxBasesOnMap = mapCfg.maxBasesPerPlayer || econ.maxBasesPerPlayerOnMap || 6;
    const attackerBasesOnMap = data.bases.filter(
      (b) => (b.mapId || 'map_riverfront_assault') === mapId && b.ownerId === capturingUnit.ownerId
    ).length;

    const capturerProfile = data.users[capturingUnit.ownerId]?.profile;
    if (capturerProfile) {
      capturerProfile.totalBasesCaptured += 1;
      capturerProfile.score += 500;
      gameStore.recalculatePlayerProgression(capturerProfile);
    }

    if (isDefenderPrimaryHq || (capturingUnit.ownerId !== 'enemy_insurgent' && attackerBasesOnMap >= maxBasesOnMap)) {
      // HQ Capitulation / Raid: Defender keeps primary Home Base with a 10-minute Emergency Reconstruction Shield
      base.captureProgress = 0;
      base.capturingPlayerId = null;
      base.captureContested = false;
      base.health = Math.round(base.maxHealth * 0.75);
      base.defenseShield = Math.round(base.maxShield * 0.8);
      base.rebuildProtectionUntil = now + 600000; // 10 minutes
      base.isProtected = true;

      const report = gameStore.recordBattleReport({
        mapId,
        mapName: mapCfg.name,
        type: 'hq_siege',
        attackerId: capturingUnit.ownerId,
        attackerName: capturingUnit.ownerName,
        defenderId: oldOwnerId,
        defenderName: oldOwnerName,
        baseId: base.id,
        baseName: base.name,
        coords: { x: base.x, y: base.y },
        plunderedResources: plunder,
        buildingsDamaged,
        summary: `${capturingUnit.ownerName} forced ${base.name} into capitulation and plundered its reserves! Emergency Reconstruction Shield activated.`,
      });

      this.io?.to('authenticated_commanders').emit('battle:report', report);
    } else {
      // Full territory ownership transfer
      base.ownerId = capturingUnit.ownerId;
      base.ownerName = capturingUnit.ownerName;
      base.allianceId = capturingUnit.allianceId;
      base.captureProgress = 0;
      base.capturingPlayerId = null;
      base.captureContested = false;
      base.health = Math.round(base.maxHealth * 0.6);
      base.defenseShield = Math.round(base.maxShield * 0.5);
      base.constructionQueue = [];
      base.productionQueue = [];

      const report = gameStore.recordBattleReport({
        mapId,
        mapName: mapCfg.name,
        type: 'base_captured',
        attackerId: capturingUnit.ownerId,
        attackerName: capturingUnit.ownerName,
        defenderId: oldOwnerId,
        defenderName: oldOwnerName,
        baseId: base.id,
        baseName: base.name,
        coords: { x: base.x, y: base.y },
        plunderedResources: plunder,
        buildingsDamaged,
        summary: `${capturingUnit.ownerName} seized '${base.name}' from ${oldOwnerName} in ${mapCfg.name}!`,
      });

      this.io?.to('authenticated_commanders').emit('battle:report', report);
    }

    const activeMatch = data.matches?.find((m) => m.status === 'active' && m.mapId === mapId);
    if (activeMatch) {
      activeMatch.totalBasesCaptured += 1;
    }

    const notif: GameNotification = {
      id: `notif_cap_${now}`,
      userId: capturingUnit.ownerId,
      mapId,
      type: 'capture',
      title: 'Territory Operation Complete!',
      message: `Base '${base.name}' overwhelmed (${plunder.steel} Steel, ${plunder.fuel} Fuel plundered)!`,
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
      content: `CRITICAL ALERT: Base '${base.name}' (${mapCfg.name}) has been overwhelmed by ${capturingUnit.ownerName}!`,
      coords: { x: base.x, y: base.y },
      timestamp: now,
    });

    gameStore.persistBaseAndUnits(base, []);
    this.io?.to('authenticated_commanders').emit('notification:new', notif);
    this.io
      ?.to('authenticated_commanders')
      .emit('base:captured', { baseId: base.id, mapId, newOwnerId: base.ownerId, newOwnerName: base.ownerName });
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
          'dominator_conquest',
        ];
        const validUnits = candidateUnits.filter((uType) => {
          const uDef = gameStore.getEffectiveUnitDef(uType);
          return (
            uDef &&
            uDef.enabled !== false &&
            base.buildings.some((b) => b.type === uDef.requiredBuilding && !b.isConstructing)
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

  // Issue command to units with tactical formation spacing and group size enforcement
  public commandUnits(
    userId: string,
    unitIds: string[],
    command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop',
    targetX?: number,
    targetY?: number,
    targetUnitId?: string,
    targetBaseId?: string
  ) {
    const data = gameStore.getData();
    const econ = gameStore.getEconomyConfig();
    const maxSelection = econ.maxSelectionGroupSize || 24;
    const cappedIds = unitIds.slice(0, maxSelection);

    const authorizedUnits = data.units.filter((u) => cappedIds.includes(u.id) && u.ownerId === userId);
    if (authorizedUnits.length === 0) return;

    // If issuing an offensive attack against another player's assets, forfeit beginner protection
    if (command === 'attack' && (targetUnitId || targetBaseId)) {
      const attackerProfile = data.users[userId]?.profile;
      if (attackerProfile && attackerProfile.beginnerProtectionUntil > Date.now()) {
        attackerProfile.beginnerProtectionUntil = 0;
      }
    }

    const total = authorizedUnits.length;
    const cols = Math.ceil(Math.sqrt(total));

    authorizedUnits.forEach((unit, idx) => {
      const unitMapId = unit.mapId || 'map_riverfront_assault';
      const terrain = this.getTerrain(unitMapId);

      unit.command = command;
      unit.targetUnitId = targetUnitId || null;
      unit.targetBaseId = targetBaseId || null;

      if (command === 'hold' || command === 'stop') {
        unit.path = [];
      } else if (command === 'move' || command === 'attack' || command === 'patrol') {
        let destX = targetX ?? unit.x;
        let destY = targetY ?? unit.y;

        if (targetUnitId) {
          const tUnit = data.units.find(
            (u) => u.id === targetUnitId && (u.mapId || 'map_riverfront_assault') === unitMapId
          );
          if (tUnit) {
            destX = tUnit.x;
            destY = tUnit.y;
          }
        } else if (targetBaseId) {
          const tBase = data.bases.find(
            (b) => b.id === targetBaseId && (b.mapId || 'map_riverfront_assault') === unitMapId
          );
          if (tBase) {
            destX = tBase.x;
            destY = tBase.y;
          }
        }

        if (total > 1 && !targetUnitId) {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const spacing = 1.35;
          const offsetX = (col - (cols - 1) / 2) * spacing;
          const offsetY = (row - (Math.ceil(total / cols) - 1) / 2) * spacing;
          destX = Math.max(1, Math.min(98, destX + offsetX));
          destY = Math.max(1, Math.min(73, destY + offsetY));
        }

        const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
        const category = def?.category || 'ground';
        const path = findPath(terrain, unit.x, unit.y, destX, destY, category);
        unit.path = path;
      } else if (command === 'retreat') {
        const homeBase =
          data.bases.find((b) => b.id === unit.homeBaseId && (b.mapId || 'map_riverfront_assault') === unitMapId) ||
          data.bases.find((b) => b.ownerId === userId && (b.mapId || 'map_riverfront_assault') === unitMapId);
        if (homeBase) {
          const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
          const category = def?.category || 'ground';
          unit.path = findPath(terrain, unit.x, unit.y, homeBase.x, homeBase.y, category);
        }
      }
    });

    this.broadcastWorldSync();
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

      const bDef = gameStore.getEffectiveBuildingDef(buildingType);
      if (!bDef) return { success: false, message: 'Invalid building type' };
      if (bDef.enabled === false) return { success: false, message: 'This facility is currently disabled by Command' };

      const existing = base.buildings.find((b: BuildingInstance) => b.type === buildingType);
      const maxBuildings = econ.maxBuildingsPerBase || 16;
      if (!existing && base.buildings.length + base.constructionQueue.length >= maxBuildings) {
        return { success: false, message: `Base facility slot limit reached (${maxBuildings} buildings max)` };
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

      base.constructionQueue.push({
        id: `order_${now}_${Math.random().toString(36).substring(2, 6)}`,
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

      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return { success: true };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Another construction or production operation is currently processing' };
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

      const baseMapId = base.mapId || 'map_riverfront_assault';
      const mapCfg = gameStore.getMapConfig(baseMapId);

      const uDef = gameStore.getEffectiveUnitDef(unitType);
      if (!uDef) return { success: false, message: 'Invalid unit type' };
      if (uDef.enabled === false) return { success: false, message: 'This unit type is currently disabled by Command' };

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

      const reqBuilding = base.buildings.find((b: BuildingInstance) => b.type === uDef.requiredBuilding && b.level > 0);
      if (!reqBuilding) {
        return {
          success: false,
          message: `Requires ${gameStore.getEffectiveBuildingDef(uDef.requiredBuilding)?.name || 'appropriate facility'}`,
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
      base.productionQueue.push({
        id: `prod_${now}_${Math.random().toString(36).substring(2, 6)}`,
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

      gameStore.persistBaseAndUnits(base, []);
      this.broadcastWorldSync(now);
      return { success: true };
    });

    if (!lockRes.locked) {
      return { success: false, message: 'Concurrent production request in progress' };
    }
    return lockRes.result!;
  }
}

export const gameSimulation = new GameSimulation();
