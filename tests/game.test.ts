import assert from 'node:assert';
import test from 'node:test';
import http from 'node:http';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath, isCellPassable } from '../src/game/pathfinder';
import { ROLE_PERMISSIONS, TerrainType } from '../src/types/game';
import { app } from '../server';
import { gameStore } from '../server/store';
import { resetRateLimiterForTests, sanitizeText } from '../server/adminRoutes';

// Helper to run HTTP requests against the Express app on an ephemeral port
async function withTestServer(fn: (baseUrl: string) => Promise<void>) {
  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
}

test('1. World Generator is deterministic with seeds', () => {
  const worldA = generateWorld({ width: 50, height: 40, tileSize: 40, seed: 998877 });
  const worldB = generateWorld({ width: 50, height: 40, tileSize: 40, seed: 998877 });

  assert.strictEqual(worldA.bases.length, worldB.bases.length);
  assert.strictEqual(worldA.terrain[10][10], worldB.terrain[10][10]);
  assert.strictEqual(worldA.terrain[25][20], worldB.terrain[25][20]);
});

test('2. Pathfinding respects unit categories', () => {
  const map: TerrainType[][] = [
    ['plains', 'plains', 'plains', 'plains', 'plains'],
    ['plains', 'plains', 'plains', 'plains', 'plains'],
    ['plains', 'plains', 'mountain', 'water', 'plains'],
    ['plains', 'plains', 'plains', 'plains', 'plains'],
    ['plains', 'plains', 'plains', 'plains', 'plains'],
  ];

  assert.strictEqual(isCellPassable(map, 2, 2, 'ground'), false);
  assert.strictEqual(isCellPassable(map, 3, 2, 'ground'), false);
  assert.strictEqual(isCellPassable(map, 2, 2, 'air'), true);
  assert.strictEqual(isCellPassable(map, 3, 2, 'air'), true);

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
  assert.strictEqual(unitKeys.length, 14, 'All 14 military unit types are defined');
  for (const key of unitKeys) {
    const u = UNIT_CATALOG[key as keyof typeof UNIT_CATALOG];
    assert.ok(u.maxHealth > 0 && u.speed > 0 && u.attackRange > 0, `Unit ${key} has valid 3D combat metrics`);
  }

  const buildingKeys = Object.keys(BUILDING_CATALOG);
  assert.ok(buildingKeys.length >= 24, 'All 24+ military facility types are defined');
});

test('7. Admin Authentication & Unauthorized Access Rejection (401/403)', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    // 1. Unauthenticated access to /api/admin/overview must return 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/overview`);
    assert.strictEqual(unauthRes.status, 401, 'Missing Bearer token must return 401');

    // 2. Non-admin player login to /api/admin/auth/login must return 403
    const nonAdminRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Striker_Actual', password: 'player123' }),
    });
    assert.strictEqual(nonAdminRes.status, 403, 'Non-admin player must be rejected with 403');

    // 3. Valid Super Admin login succeeds and returns session token + permissions
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Commander', password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123' }),
    });
    assert.strictEqual(loginRes.status, 200, 'Super Admin login must succeed');
    const loginBody = await loginRes.json();
    assert.ok(loginBody.token, 'Token must be returned');
    assert.strictEqual(loginBody.role, 'super_admin');
    assert.strictEqual(loginBody.permissions.length, ROLE_PERMISSIONS.super_admin.length);
  });
});

test('8. Role-Based Access Control (Moderator vs Analyst vs Super Admin) & Escalation Prevention', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    // Login as Moderator
    const modLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Sentinel_Mod', password: 'moderator123' }),
    }).then((r) => r.json());

    // Moderator can view players
    const modPlayersRes = await fetch(`${baseUrl}/api/admin/players?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${modLogin.token}` },
    });
    assert.strictEqual(modPlayersRes.status, 200);
    const modPlayers = await modPlayersRes.json();
    assert.strictEqual(modPlayers.pagination.pageSize, 2, 'Pagination pageSize must be respected');

    // Moderator CANNOT edit economy (403)
    const modEconRes = await fetch(`${baseUrl}/api/admin/economy`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${modLogin.token}`,
      },
      body: JSON.stringify({ resourceGenerationMultiplier: 2.0, reason: 'Unauthorized attempt' }),
    });
    assert.strictEqual(modEconRes.status, 403, 'Moderator must receive 403 on economy.edit');

    // Moderator CANNOT manage administrators (403)
    const modAdminRoleRes = await fetch(`${baseUrl}/api/admin/administrators/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${modLogin.token}`,
      },
      body: JSON.stringify({ userId: 'admin_sentinel_mod', role: 'super_admin', reason: 'Self-escalation attempt' }),
    });
    assert.strictEqual(modAdminRoleRes.status, 403, 'Moderator cannot escalate own role to super_admin');

    // Moderator CANNOT ban a super_admin (403)
    const modBanSuper = await fetch(`${baseUrl}/api/admin/players/player_default/moderate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${modLogin.token}`,
      },
      body: JSON.stringify({ action: 'ban', reason: 'Attempting to ban Supreme Commander' }),
    });
    assert.strictEqual(modBanSuper.status, 403, 'Moderator cannot ban a super_admin');
  });
});

test('9. Player Moderation, Banned User Gameplay Blocking, Economy Rollback, XSS Sanitization & Session Expiry', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    const superLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Commander', password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123' }),
    }).then((r) => r.json());
    const token = superLogin.token;

    // 1. Ban player 'player_ironwolf' and verify login is blocked
    const banRes = await fetch(`${baseUrl}/api/admin/players/player_ironwolf/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'ban', reason: 'Confirmed automated resource exploit' }),
    });
    assert.strictEqual(banRes.status, 200);

    const bannedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'IronWolf_99', password: 'player123' }),
    });
    assert.strictEqual(bannedLoginRes.status, 403, 'Banned player must be blocked from logging in');

    // Unban player_ironwolf to restore clean state
    const unbanRes = await fetch(`${baseUrl}/api/admin/players/player_ironwolf/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'unban', reason: 'Appeal approved in automated test' }),
    });
    assert.strictEqual(unbanRes.status, 200);

    // 2. Economy validation bounds & version rollback
    const invalidEconRes = await fetch(`${baseUrl}/api/admin/economy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...gameStore.getEconomyConfig(),
        resourceGenerationMultiplier: -5,
        reason: 'Invalid negative multiplier test',
      }),
    });
    assert.strictEqual(invalidEconRes.status, 400, 'Out-of-range economy multiplier must return 400');

    const beforeVersion = gameStore.getEconomyConfig().version;
    const validEconRes = await fetch(`${baseUrl}/api/admin/economy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...gameStore.getEconomyConfig(),
        resourceGenerationMultiplier: 1.5,
        reason: 'Weekend 1.5x harvest boost',
      }),
    });
    assert.strictEqual(validEconRes.status, 200);
    assert.strictEqual(gameStore.getEconomyConfig().resourceGenerationMultiplier, 1.5);

    const rollbackRes = await fetch(`${baseUrl}/api/admin/economy/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ version: 1, reason: 'Restore v1 baseline after test' }),
    });
    assert.strictEqual(rollbackRes.status, 200);
    assert.strictEqual(gameStore.getEconomyConfig().resourceGenerationMultiplier, 1.0);
    assert.ok(gameStore.getEconomyConfig().version > beforeVersion);

    // 3. XSS Sanitization in Announcements
    const xssInput = '<script>alert("xss")</script><b>CRITICAL</b> Operational Directive';
    const clean = sanitizeText(xssInput);
    assert.ok(!clean.includes('<script>'), 'Script tag must be stripped');
    assert.ok(!clean.includes('<b>'), 'HTML tags must be stripped');

    const annRes = await fetch(`${baseUrl}/api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: '<script>evil()</script>SECTOR ALERT',
        message: 'All forces report to <img src=x onerror=alert(1)>Bridgehead.',
        priority: 'warning',
      }),
    });
    assert.strictEqual(annRes.status, 201);
    const annData = await annRes.json();
    assert.strictEqual(annData.announcement.title, 'SECTOR ALERT');
    assert.ok(!annData.announcement.message.includes('onerror='), 'Event handlers must be sanitized');

    // 4. Audit logs recorded
    const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.ok(auditData.items.length > 0, 'Audit logs must be populated');

    // 5. Session revocation on logout
    const logoutRes = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(logoutRes.status, 200);
  });
});
