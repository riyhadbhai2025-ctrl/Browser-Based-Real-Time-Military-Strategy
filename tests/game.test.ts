import assert from 'node:assert';
import test from 'node:test';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath, isCellPassable } from '../src/game/pathfinder';
import { TerrainType } from '../src/types/game';

test('1. World Generator is deterministic with seeds', () => {
  const worldA = generateWorld({ width: 50, height: 40, tileSize: 40, seed: 998877 });
  const worldB = generateWorld({ width: 50, height: 40, tileSize: 40, seed: 998877 });

  assert.strictEqual(worldA.bases.length, worldB.bases.length);
  assert.strictEqual(worldA.terrain[10][10], worldB.terrain[10][10]);
  assert.strictEqual(worldA.terrain[25][20], worldB.terrain[25][20]);
});

test('2. Pathfinding respects unit categories', () => {
  // Test map: 5x5 grid with mountain in middle at (2, 2) and water at (2, 3)
  const map: TerrainType[][] = [
    ['plains', 'plains', 'plains', 'plains', 'plains'],
    ['plains', 'plains', 'plains', 'plains', 'plains'],
    ['plains', 'plains', 'mountain', 'water', 'plains'],
    ['plains', 'plains', 'plains', 'plains', 'plains'],
    ['plains', 'plains', 'plains', 'plains', 'plains'],
  ];

  // Ground units cannot walk through mountains
  assert.strictEqual(isCellPassable(map, 2, 2, 'ground'), false);
  // Ground units cannot walk through water
  assert.strictEqual(isCellPassable(map, 3, 2, 'ground'), false);
  // Air units can cross both mountains and water
  assert.strictEqual(isCellPassable(map, 2, 2, 'air'), true);
  assert.strictEqual(isCellPassable(map, 3, 2, 'air'), true);

  // Path for ground from (1, 2) to (3, 2) must route around the mountain
  const path = findPath(map, 1, 2, 4, 2, 'ground');
  assert.ok(path.length > 0);
  for (const step of path) {
    assert.ok(map[step.y][step.x] !== 'mountain', `Step at (${step.x}, ${step.y}) should not be a mountain`);
  }
});

test('3. Combat Unit Catalog and Counter balance', () => {
  const aa = UNIT_CATALOG.skyguard_aa;
  const heli = UNIT_CATALOG.cobra_gunship;
  const mbt = UNIT_CATALOG.titan_mbt;

  assert.ok(aa.targets.includes('air'), 'Anti-aircraft unit must target airborne enemies');
  assert.ok(aa.attackDamage > 0, 'AA unit has positive attack damage');
  assert.ok(mbt.armor > heli.armor, 'Main battle tank has higher armor than gunship');
  assert.ok(mbt.attackRange > 5, 'MBT has realistic gun range');
});

test('4. Building Catalog costs and production bonuses', () => {
  const foundry = BUILDING_CATALOG.steel_foundry;
  assert.strictEqual(foundry.category, 'economy');
  assert.ok(foundry.productionBonus?.steel && foundry.productionBonus.steel > 0, 'Steel foundry generates steel');

  const cc = BUILDING_CATALOG.command_center;
  assert.ok(cc.storageBonus?.steel && cc.storageBonus.steel > 0, 'Command center gives storage bonus');
});

test('5. Base Conquest unit validation', () => {
  const dominator = UNIT_CATALOG.dominator_conquest;
  assert.strictEqual(dominator.canCaptureBase, true, 'Dominator Enforcer must be able to capture bases');
  assert.strictEqual(UNIT_CATALOG.vanguard_scout.canCaptureBase, undefined, 'Scout buggy cannot capture bases');
});

test('6. All 3D Unit and Building Catalog definitions have valid stats and categories', () => {
  const unitKeys = Object.keys(UNIT_CATALOG);
  assert.strictEqual(unitKeys.length, 13, 'All 13 military unit types are defined');
  for (const key of unitKeys) {
    const u = UNIT_CATALOG[key as keyof typeof UNIT_CATALOG];
    assert.ok(u.maxHealth > 0 && u.speed > 0 && u.attackRange > 0, `Unit ${key} has valid 3D combat metrics`);
  }

  const buildingKeys = Object.keys(BUILDING_CATALOG);
  assert.ok(buildingKeys.length >= 24, 'All 24+ military facility types are defined');
});

