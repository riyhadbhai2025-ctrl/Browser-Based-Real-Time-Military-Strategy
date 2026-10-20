import { Server } from 'socket.io';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath } from '../src/game/pathfinder';
import {
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

  constructor() {
    const generated = generateWorld(this.worldConfig);
    this.terrain = generated.terrain;
  }

  public setSocketServer(io: Server) {
    this.io = io;
  }

  public getTerrain() {
    return this.terrain;
  }

  public start() {
    if (this.intervalId) return;

    // Fast simulation tick: 5 times per second (200ms) for movement and combat
    this.intervalId = setInterval(() => {
      this.tick();
    }, 200);

    console.log('[Simulation] Game simulation engine running at 5Hz.');
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Authoritative tick
  private tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickMs) / 1000, 0.5);
    this.lastTickMs = now;

    const data = gameStore.getData();
    let hasStateChange = false;

    // 1. Move Units
    for (const unit of data.units) {
      if (unit.path && unit.path.length > 0) {
        hasStateChange = true;
        const target = unit.path[0];
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.hypot(dx, dy);

        const def = UNIT_CATALOG[unit.type as UnitType];
        const speed = def?.speed || 3.0;
        const step = speed * dt;

        if (dist <= step) {
          // Arrived at waypoint
          unit.x = target.x;
          unit.y = target.y;
          unit.path.shift();
          if (unit.path.length === 0 && unit.command === 'move') {
            unit.command = 'idle';
          }
        } else {
          // Move toward waypoint
          unit.x += (dx / dist) * step;
          unit.y += (dy / dist) * step;
          unit.rotation = Math.atan2(dy, dx);
        }
      }
    }

    // 2. Unit Combat & Targeting
    const destroyedUnitIds = new Set<string>();
    const combatEvents: CombatEvent[] = [];

    for (const unit of data.units) {
      if (destroyedUnitIds.has(unit.id)) continue;

      const def = UNIT_CATALOG[unit.type as UnitType];
      if (!def) continue;

      const canAttack = now - unit.lastAttackTime >= def.cooldownSec * 1000;
      if (!canAttack) continue;

      // Check if unit has a target unit
      let targetUnit: Unit | undefined;
      if (unit.targetUnitId) {
        targetUnit = data.units.find((u) => u.id === unit.targetUnitId && !destroyedUnitIds.has(u.id));
      }

      // If no manual target, auto-acquire closest hostile unit or base in range
      if (!targetUnit && unit.command !== 'hold') {
        let closestDist = def.attackRange;
        for (const other of data.units) {
          if (other.id === unit.id || other.ownerId === unit.ownerId || destroyedUnitIds.has(other.id)) continue;
          // Check alliance
          if (unit.allianceId && other.allianceId && unit.allianceId === other.allianceId) continue;

          const otherDef = UNIT_CATALOG[other.type as UnitType];
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

          // Damage calculation with armor and type counters
          const targetDef = UNIT_CATALOG[targetUnit.type as UnitType];
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

            // Update user stats
            const ownerProfile = data.users[unit.ownerId]?.profile;
            if (ownerProfile) {
              ownerProfile.totalUnitsDestroyed += 1;
              ownerProfile.score += Math.round(targetDef.maxHealth / 10);
            }
          }
        }
      }

      // Base attacking
      if (!targetUnit) {
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
        (b: BuildingInstance) => (b.type === 'vulcan_turret' || b.type === 'sam_launcher' || b.type === 'coastal_battery') && b.health > 0
      );

      for (const t of turrets) {
        const bDef = BUILDING_CATALOG[t.type as BuildingType];
        if (!bDef || !bDef.defenseStats) continue;

        const range = bDef.defenseStats.range;
        const targetsAllowed = bDef.defenseStats.targets;

        // Find nearest hostile unit in range
        let bestTarget: Unit | null = null;
        let bestDist = range;

        for (const u of data.units) {
          if (u.ownerId === base.ownerId || destroyedUnitIds.has(u.id)) continue;
          if (base.allianceId && u.allianceId && base.allianceId === u.allianceId) continue;

          const uDef = UNIT_CATALOG[u.type as UnitType];
          if (!uDef || !targetsAllowed.includes(uDef.category)) continue;

          const d = Math.hypot(u.x - base.x, u.y - base.y);
          if (d <= bestDist) {
            bestDist = d;
            bestTarget = u;
          }
        }

        if (bestTarget && Math.random() < 0.4) {
          // Turret fires
          const damage = Math.round(bDef.defenseStats.damage * (1 + (t.level - 1) * 0.25));
          bestTarget.health -= damage;
          hasStateChange = true;

          combatEvents.push({
            id: `cb_turret_${now}_${Math.random().toString(36).substring(2, 7)}`,
            attackerId: `${base.id}_${t.id}`,
            attackerType: t.type,
            attackerOwnerId: base.ownerId,
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
    for (const base of data.bases) {
      // Find Dominator Conquest vehicles near this base
      const conquestUnits = data.units.filter((u) => {
        if (u.type !== 'dominator_conquest') return false;
        if (u.ownerId === base.ownerId) return false;
        if (base.allianceId && u.allianceId && base.allianceId === u.allianceId) return false;
        const dist = Math.hypot(u.x - base.x, u.y - base.y);
        return dist <= base.radius + 1.5;
      });

      if (conquestUnits.length > 0 && base.defenseShield <= 100) {
        const capturingUnit = conquestUnits[0];
        base.capturingPlayerId = capturingUnit.ownerId;
        base.captureProgress = Math.min(100, base.captureProgress + 10);
        hasStateChange = true;

        if (base.captureProgress >= 100) {
          // Transfer ownership!
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

          // Broadcast notification & chat
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

          this.io?.emit('notification:new', notif);
          this.io?.emit('base:captured', { baseId: base.id, newOwnerId: base.ownerId, newOwnerName: base.ownerName });
        }
      } else if (base.captureProgress > 0) {
        base.captureProgress = Math.max(0, base.captureProgress - 4);
        if (base.captureProgress === 0) base.capturingPlayerId = null;
        hasStateChange = true;
      }
    }

    // 5. Economy and Queue processing (Every 1 second)
    if (now - this.lastEconomyTickMs >= 1000) {
      const elapsedSec = (now - this.lastEconomyTickMs) / 1000;
      this.lastEconomyTickMs = now;

      for (const base of data.bases) {
        // Calculate production rates from buildings
        let concRate = 2;
        let steelRate = 2;
        let alumRate = 1;
        let fuelRate = 1.5;

        for (const b of base.buildings) {
          const bDef = BUILDING_CATALOG[b.type as BuildingType];
          if (bDef?.productionBonus) {
            const mult = 1 + (b.level - 1) * 0.4;
            if (bDef.productionBonus.concrete) concRate += bDef.productionBonus.concrete * mult;
            if (bDef.productionBonus.steel) steelRate += bDef.productionBonus.steel * mult;
            if (bDef.productionBonus.aluminum) alumRate += bDef.productionBonus.aluminum * mult;
            if (bDef.productionBonus.fuel) fuelRate += bDef.productionBonus.fuel * mult;
          }
        }

        base.productionRates = {
          concrete: Math.round(concRate * 10) / 10,
          steel: Math.round(steelRate * 10) / 10,
          aluminum: Math.round(alumRate * 10) / 10,
          fuel: Math.round(fuelRate * 10) / 10,
        };

        // Accrue resources
        base.resources.concrete = Math.min(base.storageCap.concrete, base.resources.concrete + concRate * elapsedSec);
        base.resources.steel = Math.min(base.storageCap.steel, base.resources.steel + steelRate * elapsedSec);
        base.resources.aluminum = Math.min(base.storageCap.aluminum, base.resources.aluminum + alumRate * elapsedSec);
        base.resources.fuel = Math.min(base.storageCap.fuel, base.resources.fuel + fuelRate * elapsedSec);
        base.lastResourceUpdate = now;

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
            } else {
              base.buildings.push({
                id: `bld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                type: order.buildingType,
                level: order.targetLevel,
                health: 500,
                maxHealth: 500,
              });
            }

            // Recalculate storage caps
            const bDef = BUILDING_CATALOG[order.buildingType as BuildingType];
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
            const uDef = UNIT_CATALOG[prod.unitType as UnitType];
            if (uDef) {
              // Spawn unit outside base perimeter
              const angle = Math.random() * Math.PI * 2;
              const spawnDist = base.radius + 1.2;
              const spawnX = Math.round(base.x + Math.cos(angle) * spawnDist);
              const spawnY = Math.round(base.y + Math.sin(angle) * spawnDist);

              const newUnit: Unit = {
                id: `unit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                type: prod.unitType,
                ownerId: base.ownerId,
                ownerName: base.ownerName,
                allianceId: base.allianceId,
                x: spawnX,
                y: spawnY,
                rotation: angle,
                health: uDef.maxHealth,
                maxHealth: uDef.maxHealth,
                command: 'idle',
                path: [],
                lastAttackTime: 0,
                kills: 0,
                homeBaseId: base.id,
              };

              data.units.push(newUnit);

              const ownerProfile = data.users[base.ownerId]?.profile;
              if (ownerProfile) {
                ownerProfile.totalUnitsProduced += 1;
              }

              this.io?.emit('unit:spawn', newUnit);
              hasStateChange = true;
            }
          }
        }
      }
    }

    // Broadcast combat events to clients
    if (combatEvents.length > 0) {
      for (const evt of combatEvents) {
        this.io?.emit('combat:event', evt);
      }
    }

    // Broadcast state updates to all clients periodically
    if (hasStateChange) {
      this.io?.emit('world:sync', {
        units: data.units,
        bases: data.bases,
        timestamp: now,
      });
    }

    // Persist to disk periodically (every 10 seconds)
    if (now % 10000 < 250) {
      gameStore.saveData();
    }
  }

  // Issue command to units
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

    for (const unit of authorizedUnits) {
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

        const def = UNIT_CATALOG[unit.type as UnitType];
        const category = def?.category || 'ground';
        const path = findPath(this.terrain, unit.x, unit.y, destX, destY, category);
        unit.path = path;
      } else if (command === 'retreat') {
        const homeBase = data.bases.find((b) => b.id === unit.homeBaseId);
        if (homeBase) {
          const def = UNIT_CATALOG[unit.type as UnitType];
          const category = def?.category || 'ground';
          unit.path = findPath(this.terrain, unit.x, unit.y, homeBase.x, homeBase.y, category);
        }
      }
    }

    this.io?.emit('world:sync', {
      units: data.units,
      bases: data.bases,
      timestamp: Date.now(),
    });
  }

  // Enqueue building construction or upgrade
  public buildOrUpgrade(userId: string, baseId: string, buildingType: BuildingType) {
    const data = gameStore.getData();
    const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
    if (!base) return { success: false, message: 'Base not found or unauthorized' };

    const bDef = BUILDING_CATALOG[buildingType];
    if (!bDef) return { success: false, message: 'Invalid building type' };

    const existing = base.buildings.find((b: BuildingInstance) => b.type === buildingType);
    const targetLevel = existing ? existing.level + 1 : 1;
    if (targetLevel > bDef.maxLevel) return { success: false, message: 'Max level already reached' };

    // Check resources
    const costMult = targetLevel === 1 ? 1 : 1 + (targetLevel - 1) * 0.5;
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

    // Deduct
    base.resources.concrete -= requiredConcrete;
    base.resources.steel -= requiredSteel;
    base.resources.aluminum -= requiredAluminum;
    base.resources.fuel -= requiredFuel;

    const durationSec = Math.round(bDef.buildTimeSec * costMult);
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
    });

    this.io?.emit('world:sync', { units: data.units, bases: data.bases, timestamp: now });
    return { success: true };
  }

  // Enqueue unit production
  public produceUnit(userId: string, baseId: string, unitType: UnitType) {
    const data = gameStore.getData();
    const base = data.bases.find((b) => b.id === baseId && b.ownerId === userId);
    if (!base) return { success: false, message: 'Base not found or unauthorized' };

    const uDef = UNIT_CATALOG[unitType];
    if (!uDef) return { success: false, message: 'Invalid unit type' };

    // Check required building
    const reqBuilding = base.buildings.find((b: BuildingInstance) => b.type === uDef.requiredBuilding && b.level > 0);
    if (!reqBuilding) {
      return { success: false, message: `Requires ${BUILDING_CATALOG[uDef.requiredBuilding]?.name || 'appropriate facility'}` };
    }

    // Check resources
    if (
      base.resources.concrete < uDef.cost.concrete ||
      base.resources.steel < uDef.cost.steel ||
      base.resources.aluminum < uDef.cost.aluminum ||
      base.resources.fuel < uDef.cost.fuel
    ) {
      return { success: false, message: 'Insufficient resources' };
    }

    base.resources.concrete -= uDef.cost.concrete;
    base.resources.steel -= uDef.cost.steel;
    base.resources.aluminum -= uDef.cost.aluminum;
    base.resources.fuel -= uDef.cost.fuel;

    const now = Date.now();
    base.productionQueue.push({
      id: `prod_${now}_${Math.random().toString(36).substring(2, 6)}`,
      baseId,
      unitType,
      startTime: now,
      finishTime: now + uDef.trainTimeSec * 1000,
      cost: uDef.cost,
    });

    this.io?.emit('world:sync', { units: data.units, bases: data.bases, timestamp: now });
    return { success: true };
  }
}

export const gameSimulation = new GameSimulation();
