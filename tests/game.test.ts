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

test('10. GET /api/auth/me rejects missing/invalid tokens (401), blocks banned accounts (403), and never falls back to Commander', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    // 1. Missing Authorization header -> 401
    const noTokenRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(noTokenRes.status, 401, 'Unauthenticated GET /api/auth/me must return 401');

    // 2. Malformed Authorization header -> 401
    const malformedRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Basic abc123' },
    });
    assert.strictEqual(malformedRes.status, 401, 'Malformed Authorization header must return 401');

    // 3. Invalid or legacy default_commander_token -> 401
    const legacyTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer default_commander_token' },
    });
    assert.strictEqual(legacyTokenRes.status, 401, 'Legacy static token must be rejected with 401');

    // 4. Valid login returns token that resolves ONLY to that user
    const strikerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Striker_Actual', password: 'player123' }),
    });
    assert.strictEqual(strikerLogin.status, 200);
    const strikerData = await strikerLogin.json();
    assert.strictEqual(strikerData.profile.username, 'Striker_Actual');
    assert.strictEqual(strikerData.profile.isAdmin, false);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${strikerData.token}` },
    });
    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.profile.id, 'player_striker');
    assert.strictEqual(meBody.profile.username, 'Striker_Actual');
    assert.notStrictEqual(meBody.profile.id, 'player_default', 'Must never return Commander for another user token');

    // 5. Logout revokes token so subsequent /api/auth/me returns 401
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${strikerData.token}` },
    });
    assert.strictEqual(logoutRes.status, 200);

    const afterLogoutMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${strikerData.token}` },
    });
    assert.strictEqual(afterLogoutMe.status, 401, 'Revoked token must return 401');
  });
});

test('11. New Player Registration & Guest Quick Play create non-privileged accounts with individual home bases and cannot access Admin APIs', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    const uniqueCallsign = `Vanguard_${Date.now().toString().slice(-5)}`;

    // 1. Register new player
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: uniqueCallsign,
        password: 'securePass99',
        email: `${uniqueCallsign.toLowerCase()}@frontline.mil`,
      }),
    });
    assert.strictEqual(regRes.status, 200, 'New player registration must succeed');
    const regData = await regRes.json();
    assert.ok(regData.token, 'Registration must return a session token');
    assert.strictEqual(regData.profile.username, uniqueCallsign);
    assert.strictEqual(regData.profile.isAdmin, false, 'Registered player must have isAdmin: false');
    assert.strictEqual(regData.profile.adminRole, null, 'Registered player must have adminRole: null');
    assert.strictEqual(regData.profile.status, 'active', 'Registered player must have status: active');
    assert.ok(regData.profile.beginnerProtectionUntil > Date.now(), 'Beginner protection must be active');

    // Verify individual home base and starter units were created in persistent store
    const state = gameStore.getData();
    const playerBase = state.bases.find((b) => b.id === regData.profile.homeBaseId);
    assert.ok(playerBase, 'Registered player must have an individual home base');
    assert.strictEqual(playerBase?.ownerId, regData.profile.id);
    assert.ok(playerBase!.buildings.length >= 6, 'Home base must include starter buildings');
    assert.ok(playerBase!.resources.concrete > 0 && playerBase!.resources.steel > 0, 'Home base has starting resources');

    const playerUnits = state.units.filter((u) => u.ownerId === regData.profile.id);
    assert.ok(playerUnits.length >= 1, 'Registered player must receive starter units');

    // 2. Duplicate username registration is rejected
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: uniqueCallsign.toUpperCase(),
        password: 'anotherPassword',
      }),
    });
    assert.strictEqual(dupRes.status, 400, 'Case-insensitive duplicate username must return 400');

    // 3. Guest Quick Play creates a non-privileged recruit account (never Commander)
    const guestRes = await fetch(`${baseUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(guestRes.status, 200, 'Guest quick deploy must succeed');
    const guestData = await guestRes.json();
    assert.notStrictEqual(guestData.profile.id, 'player_default', 'Guest quick play must never use Commander account');
    assert.strictEqual(guestData.profile.isAdmin, false, 'Guest account must have isAdmin: false');
    assert.strictEqual(guestData.profile.adminRole, null, 'Guest account must have adminRole: null');

    // 4. Normal registered player and guest player cannot access /api/admin/*
    const adminAttemptReg = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    assert.ok(
      adminAttemptReg.status === 401 || adminAttemptReg.status === 403,
      'Normal registered player token must be rejected by /api/admin/overview'
    );

    const adminAttemptGuest = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${guestData.token}` },
    });
    assert.ok(
      adminAttemptGuest.status === 401 || adminAttemptGuest.status === 403,
      'Guest player token must be rejected by /api/admin/overview'
    );
  });
});

test('12. Persistent player progress across logins and cross-player base/unit manipulation prevention', async () => {
  const { gameSimulation } = await import('../server/simulation');
  await withTestServer(async (baseUrl) => {
    const callsignA = `AlphaCmdr_${Date.now().toString().slice(-4)}`;
    const callsignB = `BravoCmdr_${Date.now().toString().slice(-4)}`;

    const regA = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsignA, password: 'passAlpha123' }),
    }).then((r) => r.json());

    const regB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsignB, password: 'passBravo123' }),
    }).then((r) => r.json());

    const userIdA = regA.profile.id;
    const userIdB = regB.profile.id;
    const baseIdA = regA.profile.homeBaseId;
    const baseIdB = regB.profile.homeBaseId;

    // 1. Player A can build on their own base
    const ownBuild = gameSimulation.buildOrUpgrade(userIdA, baseIdA, 'concrete_works');
    assert.strictEqual(ownBuild.success, true, 'Player A can upgrade their own base facility');

    // 2. Player B CANNOT build on or produce units from Player A's base or Commander's base
    const crossBuild = gameSimulation.buildOrUpgrade(userIdB, baseIdA, 'steel_foundry');
    assert.strictEqual(crossBuild.success, false, 'Player B must not be able to build on Player A base');

    const crossProduce = gameSimulation.produceUnit(userIdB, baseIdA, 'vanguard_scout');
    assert.strictEqual(crossProduce.success, false, 'Player B must not be able to produce units at Player A base');

    const commanderBaseBuild = gameSimulation.buildOrUpgrade(userIdB, 'base_0', 'steel_foundry');
    assert.strictEqual(commanderBaseBuild.success, false, 'Normal player cannot build on Commander HQ');

    // 3. Player B CANNOT issue move/attack commands to Player A's units
    const state = gameStore.getData();
    const unitA = state.units.find((u) => u.ownerId === userIdA)!;
    assert.ok(unitA, 'Player A has a starter unit');
    const origX = unitA.x;
    const origY = unitA.y;

    gameSimulation.commandUnits(userIdB, [unitA.id], 'move', 50, 50);
    assert.strictEqual(unitA.path.length, 0, 'Player B cannot move Player A unit');
    assert.strictEqual(unitA.x, origX);
    assert.strictEqual(unitA.y, origY);

    // 4. Player A retains persistent progress across logins
    state.users[userIdA].profile.score = 777;
    gameStore.saveData();

    const reloginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsignA, password: 'passAlpha123' }),
    });
    assert.strictEqual(reloginRes.status, 200);
    const reloginData = await reloginRes.json();
    assert.strictEqual(reloginData.profile.id, userIdA);
    assert.strictEqual(reloginData.profile.homeBaseId, baseIdA);
    assert.strictEqual(reloginData.profile.score, 777, 'Persistent score and progress must be preserved across logins');
  });
});

test('13. Login Screen 3D Preview Isolation & Complete Gameplay Transition Journey (Scenarios A-G)', async () => {
  const { server } = await import('../server');
  const { io: ClientIO } = await import('socket.io-client');

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Scenario A: Unauthenticated visitor can load public 3D terrain for preview, but cannot access /api/auth/me or join multiplayer Socket.IO
    const terrainRes = await fetch(`${baseUrl}/api/world/terrain`);
    assert.strictEqual(terrainRes.status, 200, 'Public 3D terrain endpoint must be accessible for 3D login preview');
    const terrainData = await terrainRes.json();
    assert.ok(Array.isArray(terrainData.terrain) && terrainData.terrain.length === 75, '3D terrain grid is returned');
    assert.ok(Array.isArray(terrainData.envObjects) && terrainData.envObjects.length > 0, '3D environmental props are returned');

    const unauthMe = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(unauthMe.status, 401, 'Unauthenticated visitor must receive 401 on /api/auth/me');

    const unauthSocket = ClientIO(baseUrl, { transports: ['websocket'], reconnection: false });
    const unauthError = await new Promise<{ status: number; message: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Expected auth:error on unauthenticated world:join')), 3000);
      unauthSocket.on('connect', () => {
        unauthSocket.emit('world:join', {});
      });
      unauthSocket.on('auth:error', (err) => {
        clearTimeout(timer);
        resolve(err);
      });
      unauthSocket.on('world:state', () => {
        clearTimeout(timer);
        reject(new Error('Unauthenticated socket must NEVER receive world:state'));
      });
    });
    assert.strictEqual(unauthError.status, 401, 'Unauthenticated socket must be rejected with 401');
    unauthSocket.disconnect();

    // Scenario B & E: New player registers, transitions into authenticated Socket.IO gameplay, receives own home base & starter units, and restores session via /api/auth/me
    const newCallsign = `Horizon_${Date.now().toString().slice(-4)}`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newCallsign, password: 'horizonPass123' }),
    });
    assert.strictEqual(regRes.status, 200);
    const { token: regToken, profile: regProfile } = await regRes.json();
    assert.strictEqual(regProfile.isAdmin, false);
    assert.strictEqual(regProfile.adminRole, null);

    // Session restore check (Scenario E)
    const restoreRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${regToken}` },
    });
    assert.strictEqual(restoreRes.status, 200);
    const restored = await restoreRes.json();
    assert.strictEqual(restored.profile.id, regProfile.id);
    assert.strictEqual(restored.profile.homeBaseId, regProfile.homeBaseId);

    // Connect authenticated Socket.IO and verify world:state includes player's home base and starter units
    const authSocket = ClientIO(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: regToken },
    });
    const worldState = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for world:state')), 3000);
      authSocket.on('connect', () => {
        authSocket.emit('world:join', { token: regToken });
      });
      authSocket.on('world:state', (state) => {
        clearTimeout(timer);
        resolve(state);
      });
    });

    const myHomeBase = worldState.bases.find((b: any) => b.id === regProfile.homeBaseId);
    assert.ok(myHomeBase, 'World state must contain the newly registered player home base for camera focus');
    assert.strictEqual(myHomeBase.ownerId, regProfile.id);
    const myUnits = worldState.units.filter((u: any) => u.ownerId === regProfile.id);
    assert.ok(myUnits.length >= 2, 'World state must contain the player starter units');
    authSocket.disconnect();

    // Scenario D: Guest Quick Deploy transitions into gameplay with non-privileged recruit account
    const guestRes = await fetch(`${baseUrl}/api/auth/guest`, { method: 'POST' });
    assert.strictEqual(guestRes.status, 200);
    const { token: guestToken, profile: guestProfile } = await guestRes.json();
    assert.strictEqual(guestProfile.isAdmin, false);
    assert.notStrictEqual(guestProfile.id, 'player_default');

    // Scenario F & G: Logout revokes token, subsequent /api/auth/me and Socket.IO world:join fail with 401
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestToken}` },
    });
    assert.strictEqual(logoutRes.status, 200);

    const expiredMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${guestToken}` },
    });
    assert.strictEqual(expiredMeRes.status, 401, 'Logged-out token must return 401 on refresh');

    const expiredSocket = ClientIO(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: guestToken },
    });
    const expiredSocketErr = await new Promise<{ status: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Expected auth:error on revoked token')), 3000);
      expiredSocket.on('connect', () => {
        expiredSocket.emit('world:join', { token: guestToken });
      });
      expiredSocket.on('auth:error', (err) => {
        clearTimeout(timer);
        resolve(err);
      });
    });
    assert.strictEqual(expiredSocketErr.status, 401, 'Revoked token must be rejected by Socket.IO world:join');
    expiredSocket.disconnect();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


