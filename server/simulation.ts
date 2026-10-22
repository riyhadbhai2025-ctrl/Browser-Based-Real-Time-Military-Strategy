import { Server } from 'socket.io';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath, isCellPassable } from '../src/game/pathfinder';
import {
  AIDifficulty,
  Base,
  BuildingInstance,
  BuildingType,
  CombatEvent,
  ConstructionOrder,
  GameNotification,
  TerrainType,
  Unit,
  UnitProductionOrder,
  UnitType,
} from '../src/types/game';
import { gameStore } from './store';

export class GameSimulation {
  private io: Server | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private terrain: TerrainType[][];
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
    const generated = generateWorld(this.worldConfig);
    this.terrain = generated.terrain;
  }

  public setSocketServer(io: Server) {
    this.io = io;
  }

  public getTerrain() {
    return this.terrain;
  }

  public getWorldConfig() {
    return this.worldConfig;
  }

  public setAiDifficulty(diff: AIDifficulty) {
    this.aiDifficulty = diff;
    const data = gameStore.getData();
    const activeMatch = data.matches?.find((m) => m.status === 'active');
    if (activeMatch) {
      activeMatch.aiDifficulty = diff;
    }
  }

  public updateCellTerrain(x: number, y: number, type: TerrainType) {
    if (y >= 0 && y < this.terrain.length && x >= 0 && x < (this.terrain[0]?.length || 0)) {
      this.terrain[y][x] = type;
      return true;
    }
    return false;
  }

  public regenerateWorldWithSeed(seed: number, width = 100, height = 75) {
    this.worldConfig = { width, height, tileSize: 40, seed };
    const data = gameStore.getData();
    data.worldConfig = { ...this.worldConfig };
    const generated = generateWorld(this.worldConfig);
    this.terrain = generated.terrain;
    data.envObjects = generated.envObjects;
    return generated;
  }

  public start() {
    if (this.intervalId) return;

    // Fast simulation tick: 10 times per second (100ms) for smooth movement and combat
    this.intervalId = setInterval(() => {
      this.tick();
    }, 100);

    console.log('[Simulation] Game simulation engine running at 10Hz.');
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Authoritative tick
  private tick() {
    const tickStart = performance.now();
    const now = Date.now();
    const dt = Math.min((now - this.lastTickMs) / 1000, 0.5);
    this.lastTickMs = now;
    this.totalTicks += 1;

    const data = gameStore.getData();
    const settings = gameStore.getSystemSettings();
    const econ = gameStore.getEconomyConfig();

    // Pause active simulation movement/combat if server is in maintenance mode
    if (settings.maintenanceMode) {
      this.lastTickDurationMs = Math.round((performance.now() - tickStart) * 100) / 100;
      return;
    }

    let hasStateChange = false;

    // 1. Move Units + Local Separation Avoidance
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

    // Apply gentle unit separation so same-category units don't stack identically
    for (let i = 0; i < data.units.length; i++) {
      const uA = data.units[i];
      const defA = gameStore.getEffectiveUnitDef(uA.type as UnitType);
      if (!defA || defA.category === 'rail') continue;

      for (let j = i + 1; j < data.units.length; j++) {
        const uB = data.units[j];
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
          const aPass = isCellPassable(this.terrain, Math.round(uA.x - nx), Math.round(uA.y - ny), defA.category);
          const bPass = isCellPassable(this.terrain, Math.round(uB.x + nx), Math.round(uB.y + ny), defB.category);
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

    // 2. Unit Combat & Targeting
    const destroyedUnitIds = new Set<string>();
    const combatEvents: CombatEvent[] = [];

    for (const unit of data.units) {
      if (destroyedUnitIds.has(unit.id)) continue;

      const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
      if (!def) continue;

      const canAttack = now - unit.lastAttackTime >= def.cooldownSec * 1000;
      if (!canAttack) continue;

      let targetUnit: Unit | undefined;
      if (unit.targetUnitId) {
        targetUnit = data.units.find((u) => u.id === unit.targetUnitId && !destroyedUnitIds.has(u.id));
        if (!targetUnit) unit.targetUnitId = null;
      }

      if (!targetUnit && unit.command !== 'retreat') {
        let closestDist = def.attackRange;
        for (const other of data.units) {
          if (other.id === unit.id || other.ownerId === unit.ownerId || destroyedUnitIds.has(other.id)) continue;
          if (unit.allianceId && other.allianceId && unit.allianceId === other.allianceId) continue;

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
            }
          }
        }
      }

      // Base attacking
      if (!targetUnit && unit.command !== 'retreat') {
        for (const base of data.bases) {
          if (base.ownerId === unit.ownerId) continue;
          if (unit.allianceId && base.allianceId && unit.allianceId === base.allianceId) continue;

          const dist = Math.hypot(base.x - unit.x, base.y - unit.y);
          if (dist <= def.attackRange + base.radius) {
            unit.rotation = Math.atan2(base.y - unit.y, base.x - unit.x);
            unit.lastAttackTime = now;
            hasStateChange = true;

            const damage = Math.round(def.attackDamage * (unit.type === 'goliath_howitzer' ? 2.0 : 0.8));
            if (base.defenseShield > 0) {
              base.defenseShield = Math.max(0, base.defenseShield - damage);
            } else {
              base.health = Math.max(100, base.health - damage);
            }

            combatEvents.push({
              id: `cb_base_${now}_${Math.random().toString(36).substring(2, 7)}`,
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

    // 3. Base Turrets Auto-Firing at Hostile Units
    for (const base of data.bases) {
      const turrets = base.buildings.filter(
        (b: BuildingInstance) =>
          (b.type === 'vulcan_turret' ||
            b.type === 'sam_launcher' ||
            b.type === 'coastal_battery' ||
            b.type === 'mg_turret' ||
            b.type === 'artillery_post' ||
            b.type === 'guard_tower') &&
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

    // Remove destroyed units
    if (destroyedUnitIds.size > 0) {
      data.units = data.units.filter((u) => !destroyedUnitIds.has(u.id));
      hasStateChange = true;
    }

    // 4. Base Capture Mechanics
    const captureStep = econ.captureSpeedPerTick || 5;
    for (const base of data.bases) {
      const conquestUnits = data.units.filter((u) => {
        if (u.type !== 'dominator_conquest' && u.type !== 'rifle_infantry') return false;
        const uDef = gameStore.getEffectiveUnitDef(u.type);
        if (!uDef?.canCaptureBase) return false;
        if (u.ownerId === base.ownerId) return false;
        if (base.allianceId && u.allianceId && base.allianceId === u.allianceId) return false;
        const dist = Math.hypot(u.x - base.x, u.y - base.y);
        return dist <= base.radius + 1.8;
      });

      if (conquestUnits.length > 0 && base.defenseShield <= 100) {
        const capturingUnit = conquestUnits[0];
        base.capturingPlayerId = capturingUnit.ownerId;
        base.captureProgress = Math.min(100, base.captureProgress + captureStep);
        hasStateChange = true;

        if (base.captureProgress >= 100) {
          const oldOwnerName = base.ownerName;
          base.ownerId = capturingUnit.ownerId;
          base.ownerName = capturingUnit.ownerName;
          base.allianceId = capturingUnit.allianceId;
          base.captureProgress = 0;
          base.capturingPlayerId = null;
          base.health = Math.round(base.maxHealth * 0.6);
          base.defenseShield = Math.round(base.maxShield * 0.5);

          const capturerProfile = data.users[capturingUnit.ownerId]?.profile;
          if (capturerProfile) {
            capturerProfile.totalBasesCaptured += 1;
            capturerProfile.score += 500;
          }

          const activeMatch = data.matches?.find((m) => m.status === 'active');
          if (activeMatch) {
            activeMatch.totalBasesCaptured += 1;
          }

          const notif: GameNotification = {
            id: `notif_cap_${now}`,
            userId: capturingUnit.ownerId,
            type: 'capture',
            title: 'Territory Captured!',
            message: `Base '${base.name}' successfully captured from ${oldOwnerName}!`,
            coords: { x: base.x, y: base.y },
            timestamp: now,
            read: false,
          };
          data.notifications.unshift(notif);

          data.chat.push({
            id: `chat_cap_${now}`,
            senderId: 'system',
            senderName: 'HQ War Net',
            channel: 'system',
            content: `CRITICAL ALERT: Base '${base.name}' has been seized by ${capturingUnit.ownerName}!`,
            coords: { x: base.x, y: base.y },
            timestamp: now,
          });

          this.io?.to('authenticated_commanders').emit('notification:new', notif);
          this.io
            ?.to('authenticated_commanders')
            .emit('base:captured', { baseId: base.id, newOwnerId: base.ownerId, newOwnerName: base.ownerName });
        }
      } else if (base.captureProgress > 0) {
        base.captureProgress = Math.max(0, base.captureProgress - 2);
        if (base.captureProgress === 0) base.capturingPlayerId = null;
        hasStateChange = true;
      }
    }

    // 5. Economy, Repair Depots, and Queue processing (Every 1 second)
    if (now - this.lastEconomyTickMs >= 1000) {
      const elapsedSec = (now - this.lastEconomyTickMs) / 1000;
      this.lastEconomyTickMs = now;
      const globalMult = econ.resourceGenerationMultiplier || 1.0;

      for (const base of data.bases) {
        let concRate = econ.baseGenerationRates?.concrete ?? 2.5;
        let steelRate = econ.baseGenerationRates?.steel ?? 2.5;
        let alumRate = econ.baseGenerationRates?.aluminum ?? 1.5;
        let fuelRate = econ.baseGenerationRates?.fuel ?? 2.0;

        for (const b of base.buildings) {
          const bDef = gameStore.getEffectiveBuildingDef(b.type as BuildingType);
          if (bDef?.productionBonus && !b.isConstructing && bDef.enabled !== false) {
            const mult = 1 + (b.level - 1) * 0.4;
            if (bDef.productionBonus.concrete) concRate += bDef.productionBonus.concrete * mult;
            if (bDef.productionBonus.steel) steelRate += bDef.productionBonus.steel * mult;
            if (bDef.productionBonus.aluminum) alumRate += bDef.productionBonus.aluminum * mult;
            if (bDef.productionBonus.fuel) fuelRate += bDef.productionBonus.fuel * mult;
          }
        }

        concRate *= globalMult;
        steelRate *= globalMult;
        alumRate *= globalMult;
        fuelRate *= globalMult;

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

        // Track harvested resources on owner profile
        const ownerProfile = data.users[base.ownerId]?.profile;
        if (ownerProfile) {
          ownerProfile.totalResourcesHarvested += Math.round((concRate + steelRate + alumRate + fuelRate) * elapsedSec);
        }

        // Auto-heal friendly units near bases with a repair_depot
        const hasRepairDepot = base.buildings.some((b) => b.type === 'repair_depot' && !b.isConstructing);
        if (hasRepairDepot) {
          for (const u of data.units) {
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
                  if (isCellPassable(this.terrain, tx, ty, uDef.category)) {
                    spawnX = tx;
                    spawnY = ty;
                    foundSpot = true;
                  }
                }
              }

              const newUnit: Unit = {
                id: `unit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
              }
              const activeMatch = data.matches?.find((m) => m.status === 'active');
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

    // 6. Autonomous AI Commander Logic (Kodiak PMC) - Runs every 3.5 seconds if enabled
    if (settings.aiAggressionEnabled) {
      const aiInterval = this.aiDifficulty === 'hard' ? 2200 : this.aiDifficulty === 'medium' ? 3500 : 5500;
      if (now - this.lastAiTickMs >= aiInterval) {
        this.lastAiTickMs = now;
        if (this.updateAICommander(now)) {
          hasStateChange = true;
        }
      }
    }

    // Broadcast combat events to authenticated clients and store recent ones for admin telemetry
    if (combatEvents.length > 0) {
      this.recentCombatEvents.unshift(...combatEvents);
      if (this.recentCombatEvents.length > 100) {
        this.recentCombatEvents = this.recentCombatEvents.slice(0, 100);
      }
      for (const evt of combatEvents) {
        this.io?.to('authenticated_commanders').emit('combat:event', evt);
      }
    }

    // Broadcast state updates to authenticated clients periodically
    if (hasStateChange) {
      this.io?.to('authenticated_commanders').emit('world:sync', {
        units: data.units,
        bases: data.bases,
        timestamp: now,
      });
    }

    // Persist to disk periodically (every 10 seconds)
    if (now % 10000 < 150) {
      gameStore.saveData();
    }

    this.lastTickDurationMs = Math.round((performance.now() - tickStart) * 100) / 100;
  }

  // Real RTS AI Commander for Kodiak PMC ('enemy_insurgent')
  private updateAICommander(_now: number): boolean {
    const data = gameStore.getData();
    const aiOwnerId = 'enemy_insurgent';
    const aiBases = data.bases.filter((b) => b.ownerId === aiOwnerId);
    if (aiBases.length === 0) return false;

    let changed = false;
    const aiUnits = data.units.filter((u) => u.ownerId === aiOwnerId);
    const maxAiUnits = this.aiDifficulty === 'hard' ? 22 : this.aiDifficulty === 'medium' ? 14 : 8;

    // A. AI Economy & Base Construction / Production
    for (const base of aiBases) {
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

      if (base.productionQueue.length < 2 && aiUnits.length < maxAiUnits) {
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

    // B. Tactical Unit Decisions
    const primaryAiBase = aiBases[0];

    let threatenedBase: Base | null = null;
    let threatUnit: Unit | null = null;
    for (const base of aiBases) {
      const attacker = data.units.find(
        (u) => u.ownerId !== aiOwnerId && Math.hypot(u.x - base.x, u.y - base.y) <= base.radius + 10
      );
      if (attacker) {
        threatenedBase = base;
        threatUnit = attacker;
        break;
      }
    }

    for (const unit of aiUnits) {
      const uDef = gameStore.getEffectiveUnitDef(unit.type);
      if (!uDef) continue;

      if (unit.health < unit.maxHealth * 0.25 && unit.command !== 'retreat') {
        const distToHome = Math.hypot(unit.x - primaryAiBase.x, unit.y - primaryAiBase.y);
        if (distToHome > primaryAiBase.radius + 2) {
          unit.command = 'retreat';
          unit.targetUnitId = null;
          unit.path = findPath(this.terrain, unit.x, unit.y, primaryAiBase.x, primaryAiBase.y, uDef.category);
          changed = true;
          continue;
        }
      }

      if (threatenedBase && threatUnit && unit.command === 'idle') {
        unit.command = 'attack';
        unit.targetUnitId = threatUnit.id;
        unit.path = findPath(this.terrain, unit.x, unit.y, threatUnit.x, threatUnit.y, uDef.category);
        changed = true;
        continue;
      }
    }

    const idleAiUnits = aiUnits.filter((u) => u.command === 'idle' && u.health > u.maxHealth * 0.6);
    const waveSize = this.aiDifficulty === 'hard' ? 4 : this.aiDifficulty === 'medium' ? 3 : 2;

    if (idleAiUnits.length >= waveSize) {
      const nonAiBases = data.bases.filter((b) => b.ownerId !== aiOwnerId);
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

    return changed;
  }

  // Issue command to units with tactical formation spacing
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
    const authorizedUnits = data.units.filter((u) => unitIds.includes(u.id) && u.ownerId === userId);

    if (authorizedUnits.length === 0) return;

    const total = authorizedUnits.length;
    const cols = Math.ceil(Math.sqrt(total));

    authorizedUnits.forEach((unit, idx) => {
      unit.command = command;
      unit.targetUnitId = targetUnitId || null;
      unit.targetBaseId = targetBaseId || null;

      if (command === 'hold' || command === 'stop') {
        unit.path = [];
      } else if (command === 'move' || command === 'attack' || command === 'patrol') {
        let destX = targetX ?? unit.x;
        let destY = targetY ?? unit.y;

        if (targetUnitId) {
          const tUnit = data.units.find((u) => u.id === targetUnitId);
          if (tUnit) {
            destX = tUnit.x;
            destY = tUnit.y;
          }
        } else if (targetBaseId) {
          const tBase = data.bases.find((b) => b.id === targetBaseId);
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
        const path = findPath(this.terrain, unit.x, unit.y, destX, destY, category);
        unit.path = path;
      } else if (command === 'retreat') {
        const homeBase = data.bases.find((b) => b.id === unit.homeBaseId);
        if (homeBase) {
          const def = gameStore.getEffectiveUnitDef(unit.type as UnitType);
          const category = def?.category || 'ground';
          unit.path = findPath(this.terrain, unit.x, unit.y, homeBase.x, homeBase.y, category);
        }
      }
    });

    this.io?.to('authenticated_commanders').emit('world:sync', {
      units: data.units,
      bases: data.bases,
      timestamp: Date.now(),
    });
  }

  // Enqueue building construction or upgrade (supports optional 3D world offset)
  public buildOrUpgrade(
    userId: string,
    baseId: string,
    buildingType: BuildingType,
    offsetX?: number,
    offsetY?: number
  ) {
    const data = gameStore.getData();
    const econ = gameStore.getEconomyConfig();
    const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
    if (!base) return { success: false, message: 'Base not found or unauthorized' };

    const bDef = gameStore.getEffectiveBuildingDef(buildingType);
    if (!bDef) return { success: false, message: 'Invalid building type' };
    if (bDef.enabled === false) return { success: false, message: 'This facility is currently disabled by Command' };

    const existing = base.buildings.find((b: BuildingInstance) => b.type === buildingType);
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

    this.io?.to('authenticated_commanders').emit('world:sync', { units: data.units, bases: data.bases, timestamp: now });
    return { success: true };
  }

  // Enqueue unit production
  public produceUnit(userId: string, baseId: string, unitType: UnitType) {
    const data = gameStore.getData();
    const econ = gameStore.getEconomyConfig();
    const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
    if (!base) return { success: false, message: 'Base not found or unauthorized' };

    const uDef = gameStore.getEffectiveUnitDef(unitType);
    if (!uDef) return { success: false, message: 'Invalid unit type' };
    if (uDef.enabled === false) return { success: false, message: 'This unit type is currently disabled by Command' };

    // Global and per-player population cap checks
    if (data.units.length >= (econ.maxGlobalUnits || 250)) {
      return { success: false, message: 'Global theater unit cap reached' };
    }
    const ownerBasesCount = Math.max(1, data.bases.filter((b) => b.ownerId === userId).length);
    const maxOwnerPop = Math.max(40, ownerBasesCount * (econ.populationCapPerBase || 30));
    const currentOwnerPop = data.units
      .filter((u) => u.ownerId === userId)
      .reduce((sum, u) => sum + (gameStore.getEffectiveUnitDef(u.type)?.populationCost || 1), 0);
    if (userId !== 'enemy_insurgent' && currentOwnerPop + uDef.populationCost > maxOwnerPop) {
      return { success: false, message: `Population capacity reached (${currentOwnerPop}/${maxOwnerPop})` };
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

    this.io?.to('authenticated_commanders').emit('world:sync', { units: data.units, bases: data.bases, timestamp: now });
    return { success: true };
  }
}

export const gameSimulation = new GameSimulation();
