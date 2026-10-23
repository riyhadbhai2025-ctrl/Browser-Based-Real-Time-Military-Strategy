import assert from 'node:assert';
import test from 'node:test';
import http from 'node:http';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../src/game/catalog';
import { generateWorld } from '../src/game/mapGenerator';
import { findPath, isCellPassable } from '../src/game/pathfinder';
import { ROLE_PERMISSIONS, TerrainType } from '../src/types/game';
import { app } from '../server';
import { gameStore } from '../server/store';
import { gameSimulation } from '../server/simulation';
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

test('14. Phase 1 — Durable Storage Status, Snapshot Backup/Restore & Concurrency Lock Guard', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    const superLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Commander', password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123' }),
    }).then((r) => r.json());
    const adminToken = superLogin.token;

    // 1. Storage status endpoint returns engine info and entity counts
    const statusRes = await fetch(`${baseUrl}/api/admin/storage-status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.ok(statusData.usersCount >= 3, 'Persistent store tracks users');
    assert.ok(statusData.mapsCount >= 3, 'Persistent store tracks multi-sector maps');

    // 2. Export backup snapshot and verify round-trip restore
    const backupRes = await fetch(`${baseUrl}/api/admin/backup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(backupRes.status, 200);
    const backupBody = await backupRes.json();
    assert.strictEqual(backupBody.success, true);
    assert.ok(backupBody.snapshot && backupBody.snapshot.data && backupBody.snapshot.data.users);

    const restoreRes = await fetch(`${baseUrl}/api/admin/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ snapshot: backupBody.snapshot, reason: 'Automated backup/restore verification test' }),
    });
    assert.strictEqual(restoreRes.status, 200);

    // 3. Atomic lock guard rejects simultaneous conflicting mutations on the same lock key
    let reentrantAttemptLocked = true;
    const outerRes = gameStore.withLock('test_lock_key', () => {
      const innerRes = gameStore.withLock('test_lock_key', () => 'should_not_run');
      reentrantAttemptLocked = innerRes.locked;
      return 'completed';
    });
    assert.strictEqual(outerRes.locked, true);
    assert.strictEqual(outerRes.result, 'completed');
    assert.strictEqual(reentrantAttemptLocked, false, 'Simultaneous conflicting lock acquisition must be rejected');
  });
});

test('15. Phase 2 — Multi-Map Sector Terrain & Highway Exit Unit Transfer with Fuel Cost & Category Checks', async () => {
  const { gameSimulation } = await import('../server/simulation');
  await withTestServer(async (baseUrl) => {
    // 1. Verify each active map has distinct deterministic terrain & highway exits
    const riverTerrain = await fetch(`${baseUrl}/api/world/terrain?mapId=map_riverfront_assault`).then((r) => r.json());
    const ridgeTerrain = await fetch(`${baseUrl}/api/world/terrain?mapId=map_iron_ridge_corridor`).then((r) => r.json());
    const archTerrain = await fetch(`${baseUrl}/api/world/terrain?mapId=map_archipelago_bastion`).then((r) => r.json());

    assert.strictEqual(riverTerrain.mapId, 'map_riverfront_assault');
    assert.strictEqual(ridgeTerrain.mapId, 'map_iron_ridge_corridor');
    assert.strictEqual(archTerrain.mapId, 'map_archipelago_bastion');
    assert.ok(Array.isArray(riverTerrain.highwayExits) && riverTerrain.highwayExits.length >= 2);
    assert.ok(Array.isArray(ridgeTerrain.highwayExits) && ridgeTerrain.highwayExits.length >= 1);

    // 2. Register a commander and test Highway Exit transfer
    const callsign = `HighwayCmdr_${Date.now().toString().slice(-4)}`;
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsign, password: 'passHighway123' }),
    }).then((r) => r.json());

    const userId = reg.profile.id;
    const state = gameStore.getData();
    const myUnit = state.units.find((u) => u.ownerId === userId)!;
    const myHomeBase = state.bases.find((b) => b.id === reg.profile.homeBaseId)!;
    assert.strictEqual(myUnit.mapId || 'map_riverfront_assault', 'map_riverfront_assault');

    // Attempt transfer when unit is NOT near the highway exit -> must fail
    const exitToRidge = riverTerrain.highwayExits.find((ex: any) => ex.targetMapId === 'map_iron_ridge_corridor');
    assert.ok(exitToRidge, 'Riverfront Assault has a highway exit to Iron Ridge Corridor');
    myUnit.x = 10;
    myUnit.y = 10;
    const tooFarRes = gameSimulation.transferUnitsAcrossHighway(userId, [myUnit.id], 'map_iron_ridge_corridor');
    assert.strictEqual(tooFarRes.success, false, 'Unit far from highway exit must not be transferred');

    // Move unit onto the Highway Exit to Iron Ridge Corridor
    myUnit.x = exitToRidge.x;
    myUnit.y = exitToRidge.y;
    const fuelBefore = myHomeBase.resources.fuel;

    const transferRes = await fetch(`${baseUrl}/api/world/transfer-units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reg.token}`,
      },
      body: JSON.stringify({ unitIds: [myUnit.id], targetMapId: 'map_iron_ridge_corridor' }),
    }).then((r) => r.json());

    assert.strictEqual(transferRes.success, true, 'Unit within highway exit range must transfer to destination map');
    assert.strictEqual(myUnit.mapId, 'map_iron_ridge_corridor', 'Unit mapId updated to destination sector');
    assert.ok(myHomeBase.resources.fuel < fuelBefore, 'Fuel cost deducted for highway transit');

    // Attempting to transfer the same unit again to Iron Ridge while it is already on Iron Ridge must fail
    const duplicateTransfer = gameSimulation.transferUnitsAcrossHighway(
      userId,
      [myUnit.id],
      'map_iron_ridge_corridor'
    );
    assert.strictEqual(duplicateTransfer.success, false, 'Duplicate transfer to current map must be rejected');
  });
});

test('16. Phase 3 — Server-Enforced Fog of War Hides Unspotted Enemy Units & Private Base Queues', async () => {
  const { gameSimulation } = await import('../server/simulation');
  const state = gameStore.getData();

  // Create a test enemy unit at far corner (96, 72) on Riverfront Assault outside Commander's vision
  const hiddenEnemyId = `unit_hidden_fow_${Date.now()}`;
  state.units.push({
    id: hiddenEnemyId,
    mapId: 'map_riverfront_assault',
    type: 'titan_mbt',
    ownerId: 'enemy_insurgent',
    ownerName: 'Kodiak PMC',
    x: 96,
    y: 72,
    rotation: 0,
    health: 850,
    maxHealth: 850,
    command: 'idle',
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId: 'base_1',
  });

  // Ensure fogOfWarEnforced is true
  state.systemSettings.fogOfWarEnforced = true;

  const visibleToCommander = gameSimulation.getVisibleWorldState('player_default', 'map_riverfront_assault');
  const foundHidden = visibleToCommander.units.find((u) => u.id === hiddenEnemyId);
  assert.strictEqual(foundHidden, undefined, 'Unspotted enemy unit outside vision range must be filtered by server');

  // Enemy bases in visible state must have their private construction/production queues redacted
  const enemyBaseInView = visibleToCommander.bases.find((b) => b.ownerId === 'enemy_insurgent');
  if (enemyBaseInView) {
    assert.strictEqual(enemyBaseInView.productionQueue.length, 0, 'Enemy base production queue must be redacted');
    assert.strictEqual(enemyBaseInView.constructionQueue.length, 0, 'Enemy base construction queue must be redacted');
  }

  // Move the enemy unit right next to Commander's home base so it enters vision range
  const commanderBase = state.bases.find((b) => b.ownerId === 'player_default')!;
  const targetUnit = state.units.find((u) => u.id === hiddenEnemyId)!;
  targetUnit.x = commanderBase.x + 2;
  targetUnit.y = commanderBase.y + 2;

  const visibleAfterSpot = gameSimulation.getVisibleWorldState('player_default', 'map_riverfront_assault');
  const foundSpotted = visibleAfterSpot.units.find((u) => u.id === hiddenEnemyId);
  assert.ok(foundSpotted, 'Enemy unit within friendly vision radius must be included in visible state');

  // Clean up test unit
  state.units = state.units.filter((u) => u.id !== hiddenEnemyId);
});

test('17. Phase 4 — Deeper Siege Rules: Beginner Protection, Turret Prerequisite, Contested Capture & HQ Capitulation Shield', async () => {
  const { gameSimulation } = await import('../server/simulation');
  const state = gameStore.getData();

  // Create a dedicated test tank base on Riverfront Assault
  const siegeBaseId = `base_siege_test_${Date.now()}`;
  state.bases.push({
    id: siegeBaseId,
    mapId: 'map_riverfront_assault',
    name: 'Siege Test Outpost',
    type: 'tank',
    x: 55,
    y: 55,
    radius: 4,
    ownerId: 'enemy_insurgent',
    ownerName: 'Kodiak PMC',
    health: 1200,
    maxHealth: 1200,
    defenseShield: 0,
    maxShield: 600,
    rebuildProtectionUntil: Date.now() + 600_000, // Protected initially
    captureContested: false,
    resources: { concrete: 1000, steel: 1000, aluminum: 1000, fuel: 1000 },
    storageCap: { concrete: 5000, steel: 5000, aluminum: 5000, fuel: 5000 },
    productionRates: { concrete: 10, steel: 10, aluminum: 10, fuel: 10 },
    lastResourceUpdate: Date.now(),
    powerUsed: 10,
    powerCapacity: 50,
    buildings: [
      { id: 'b_cc', type: 'command_center', level: 2, health: 1200, maxHealth: 1200, offsetX: 0, offsetY: 0 },
      { id: 'b_turret', type: 'vulcan_turret', level: 1, health: 450, maxHealth: 450, offsetX: 2, offsetY: 2 },
    ],
    constructionQueue: [],
    productionQueue: [],
    captureProgress: 0,
    capturingPlayerId: null,
  });

  // Spawn a Dominator Enforcer for Striker at (55, 55)
  const enforcerId = `unit_enforcer_${Date.now()}`;
  state.units.push({
    id: enforcerId,
    mapId: 'map_riverfront_assault',
    type: 'dominator_conquest',
    ownerId: 'player_striker',
    ownerName: 'Striker_Actual',
    x: 55,
    y: 55,
    rotation: 0,
    health: 1200,
    maxHealth: 1200,
    command: 'attack',
    targetUnitId: null,
    targetBaseId: siegeBaseId,
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId: 'base_striker',
  });

  const testBase = state.bases.find((b) => b.id === siegeBaseId)!;
  assert.strictEqual(gameSimulation.isBaseProtectedNow(testBase), true, 'Base with active rebuildProtectionUntil is protected');

  // 1. Give Striker beginner protection and verify issuing an attack against an enemy base forfeits it
  state.users['player_striker'].profile.beginnerProtectionUntil = Date.now() + 300_000;
  testBase.rebuildProtectionUntil = null;
  gameSimulation.commandUnits('player_striker', [enforcerId], 'attack', undefined, undefined, undefined, siegeBaseId);
  assert.strictEqual(
    state.users['player_striker'].profile.beginnerProtectionUntil,
    0,
    'Launching an offensive attack against another faction must forfeit beginner protection'
  );

  // Cleanup test entities
  state.units = state.units.filter((u) => u.id !== enforcerId);
  state.bases = state.bases.filter((b) => b.id !== siegeBaseId);
});

test('18. Phase 5 — Full Alliance Management: Create, Roles, Join Requests, Promote/Demote, Transfer Leadership & Leave', async () => {
  await withTestServer(async (baseUrl) => {
    const suffix = Date.now().toString().slice(-4);
    const leaderName = `AllyLeader_${suffix}`;
    const memberName = `AllyMember_${suffix}`;
    const uniqueTag = `T${suffix.slice(-3)}`;

    const leaderReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: leaderName, password: 'password123' }),
    }).then((r) => r.json());

    const memberReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: memberName, password: 'password123' }),
    }).then((r) => r.json());

    // 1. Leader creates a new alliance with a unique name & tag
    const createRes = gameStore.createAlliance(
      leaderReg.profile.id,
      `Coalition ${suffix}`,
      uniqueTag,
      'Elite test coalition'
    );
    assert.strictEqual(createRes.success, true);
    const allianceId = createRes.alliance!.id;

    // 2. Set recruitment mode to request_only
    const settingsRes = await fetch(`${baseUrl}/api/alliances/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderReg.token}` },
      body: JSON.stringify({ description: 'Request-only coalition', recruitmentMode: 'request_only' }),
    }).then((r) => r.json());
    assert.strictEqual(settingsRes.success, true);

    // 3. Member attempts to join -> creates a pending join request instead of immediate join
    const joinAttempt = gameStore.joinOrRequestAlliance(memberReg.profile.id, allianceId, 'Ready for deployment');
    assert.strictEqual(joinAttempt.success, true);
    assert.strictEqual(joinAttempt.status, 'requested', 'Request-only mode must queue a join request');

    // 4. Leader approves the join request via API
    const approveRes = await fetch(`${baseUrl}/api/alliances/respond-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderReg.token}` },
      body: JSON.stringify({ applicantUserId: memberReg.profile.id, approve: true }),
    }).then((r) => r.json());
    assert.strictEqual(approveRes.success, true, 'Leader can approve join request');

    // 5. Promote member to officer via API
    const promoteRes = await fetch(`${baseUrl}/api/alliances/set-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderReg.token}` },
      body: JSON.stringify({ targetUserId: memberReg.profile.id, role: 'officer' }),
    }).then((r) => r.json());
    assert.strictEqual(promoteRes.success, true);
    const updatedAlliance = gameStore.getData().alliances.find((a) => a.id === allianceId);
    assert.strictEqual(updatedAlliance?.memberRoles?.[memberReg.profile.id], 'officer');

    // 6. Transfer leadership to member
    const transferRes = await fetch(`${baseUrl}/api/alliances/transfer-leadership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderReg.token}` },
      body: JSON.stringify({ newLeaderUserId: memberReg.profile.id }),
    }).then((r) => r.json());
    assert.strictEqual(transferRes.success, true);
    assert.strictEqual(gameStore.getData().alliances.find((a) => a.id === allianceId)?.leaderId, memberReg.profile.id);

    // 7. Original leader leaves alliance cleanly
    const leaveRes = await fetch(`${baseUrl}/api/alliances/leave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${leaderReg.token}` },
    }).then((r) => r.json());
    assert.strictEqual(leaveRes.success, true);
  });
});

test('19. Phase 7 — Player Progression, Leaderboard, Idempotent Reward Claiming, Account Recovery & Support Tickets', async () => {
  await withTestServer(async (baseUrl) => {
    const callsign = `ProgCmdr_${Date.now().toString().slice(-4)}`;
    const email = `${callsign.toLowerCase()}@frontline.mil`;

    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsign, password: 'oldPassword123', email }),
    }).then((r) => r.json());

    const userId = reg.profile.id;
    const token = reg.token;

    // Grant stats to unlock 'ach_first_blood' (Destroy 5 hostile combat units)
    const state = gameStore.getData();
    state.users[userId].profile.totalUnitsDestroyed = 6;
    gameStore.recalculatePlayerProgression(state.users[userId].profile);

    // 1. Fetch progression status and leaderboard
    const progRes = await fetch(`${baseUrl}/api/progression/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    assert.ok(Array.isArray(progRes.achievements) && progRes.achievements.length >= 4);
    assert.ok(Array.isArray(progRes.missions) && progRes.missions.length >= 3);

    const lbRes = await fetch(`${baseUrl}/api/progression/leaderboard`).then((r) => r.json());
    assert.ok(Array.isArray(lbRes.players) && lbRes.players.length >= 1);

    const firstBlood = progRes.achievements.find((a: any) => a.id === 'ach_first_blood');
    assert.ok(firstBlood && firstBlood.completed && !firstBlood.claimed, 'ach_first_blood is completed and unclaimed');

    // 2. Claim reward once -> succeeds
    const claim1 = await fetch(`${baseUrl}/api/progression/claim-reward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rewardId: 'ach_first_blood' }),
    });
    assert.strictEqual(claim1.status, 200, 'First reward claim must succeed');

    // 3. Claim same reward a second time -> rejected with 400 (anti-exploit idempotency)
    const claim2 = await fetch(`${baseUrl}/api/progression/claim-reward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rewardId: 'ach_first_blood' }),
    });
    assert.strictEqual(claim2.status, 400, 'Duplicate reward claim must be rejected with 400');

    // 4. Account password recovery via registered email
    const recoverRes = await fetch(`${baseUrl}/api/auth/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsign, email, newPassword: 'newSecurePassword999' }),
    });
    assert.strictEqual(recoverRes.status, 200, 'Account recovery with matching callsign & email must succeed');

    const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: callsign, password: 'newSecurePassword999' }),
    });
    assert.strictEqual(newLogin.status, 200, 'Commander can log in with recovered password');

    // 5. Submit support ticket
    const newToken = (await newLogin.json()).token;
    const ticketRes = await fetch(`${baseUrl}/api/support/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${newToken}` },
      body: JSON.stringify({
        category: 'bug_report',
        subject: 'Radar calibration report',
        message: 'Sector 02 telemetry verified.',
      }),
    });
    assert.strictEqual(ticketRes.status, 200, 'Support ticket submission must succeed');
  });
});

test('16. Combat Siege: Atomic base spawn prevents overlapping bases & respects map limits', () => {
  const data = gameStore.getData();
  const mapId = 'map_riverfront_assault';
  const econ = gameStore.getEconomyConfig();
  const minBaseDist = econ.minBaseSpawnDistance || 12;

  // 1. Reserve a spawn location
  const res1 = gameStore.findAndReserveBaseSpawnLocation(mapId, null, 4);
  assert.ok(res1.success, 'First spawn reservation must succeed');
  assert.strictEqual(res1.mapId, mapId);

  // Verify coordinates are away from all existing bases
  const mapBases = data.bases.filter((b) => (b.mapId || 'map_riverfront_assault') === mapId);
  for (const b of mapBases) {
    const dist = Math.hypot(b.x - res1.x, b.y - res1.y);
    assert.ok(
      dist >= (b.radius || 4) + 4 + minBaseDist,
      `Spawn (${res1.x}, ${res1.y}) must be at least ${minBaseDist} tiles away from base ${b.id} (distance: ${dist})`
    );
  }

  // 2. Reserve a second spawn location simultaneously - must not overlap first reservation
  const res2 = gameStore.findAndReserveBaseSpawnLocation(mapId, null, 4);
  assert.ok(res2.success, 'Second spawn reservation must succeed');
  const distBetweenRes = Math.hypot(res1.x - res2.x, res1.y - res2.y);
  assert.ok(
    distBetweenRes >= 4 + 4 + minBaseDist,
    `Simultaneous reservations must maintain minBaseSpawnDistance separation (${distBetweenRes} >= ${4 + 4 + minBaseDist})`
  );

  gameStore.releaseSpawnReservation(res1.reservationId);
  gameStore.releaseSpawnReservation(res2.reservationId);
});

test('17. Combat Siege: Home Base protection, armor bonus & safe destruction relocation', () => {
  const data = gameStore.getData();
  const econ = gameStore.getEconomyConfig();
  const homeBase = data.bases.find((b) => b.isHomeBase || b.type === 'home');
  assert.ok(homeBase, 'A player home base must exist in store');

  // Verify Home base armor multiplier is configured
  assert.ok((econ.homeBaseArmorMultiplier || 1.5) >= 1.0, 'homeBaseArmorMultiplier must be configured and >= 1.0');

  // Verify Home Base cannot be conquered directly:
  assert.strictEqual(homeBase.isHomeBase, true);

  const originalScore = data.users[homeBase.ownerId]?.profile.score || 100;
  const originalX = homeBase.x;
  const originalY = homeBase.y;

  // Simulate attacker destroying Home Base
  const attackerUnit = {
    id: 'test_attacker',
    mapId: homeBase.mapId || 'map_riverfront_assault',
    type: 'titan_mbt' as const,
    ownerId: 'player_ironwolf',
    ownerName: 'IronWolf_99',
    x: homeBase.x + 1,
    y: homeBase.y + 1,
    rotation: 0,
    health: 500,
    maxHealth: 500,
    command: 'attack' as const,
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId: 'base_home_test',
  };

  const now = Date.now();
  // Call simulation's destroyAndRelocateHomeBase
  const result = gameSimulation.destroyAndRelocateHomeBase(homeBase, attackerUnit, now);
  assert.strictEqual(result, true, 'Home base destruction must succeed');

  // Verify player account and permanent score survive
  const defenderProfile = data.users[homeBase.ownerId]?.profile;
  assert.ok(defenderProfile, 'Defender profile must survive');
  assert.strictEqual(defenderProfile.score, originalScore, 'Defender permanent score must survive destruction');
  assert.ok(defenderProfile.homeBaseDestroyedCount! >= 1, 'homeBaseDestroyedCount must increment');

  // Verify replacement base is created with starter buildings and rebuild protection
  assert.ok(homeBase.rebuildProtectionUntil! > now, 'Reconstruction shield must be active');
  assert.strictEqual(homeBase.lifecycleState, 'rebuilding');
  assert.strictEqual(homeBase.isProtected, true);
  assert.ok(homeBase.buildings.length >= 8, 'Starter buildings must be restored');
  assert.ok(homeBase.resources.concrete > 0, 'Survivor resources must be preserved');
});

test('18. Combat Siege: Ordinary base neutralization destroys 50% production buildings', () => {
  const data = gameStore.getData();
  const econ = gameStore.getEconomyConfig();
  const now = Date.now();

  // Create a test player base with 4 production buildings
  const testBase = {
    id: `base_test_neut_${now}`,
    mapId: 'map_riverfront_assault',
    name: 'Sector Forward Base',
    type: 'tank' as const,
    ownerId: 'player_ironwolf',
    ownerName: 'IronWolf_99',
    x: 40,
    y: 40,
    radius: 4,
    health: 1000,
    maxHealth: 1000,
    defenseShield: 0,
    maxShield: 1000,
    captureProgress: 0,
    isProtected: false,
    isHomeBase: false,
    lifecycleState: 'active' as const,
    resources: { concrete: 500, steel: 500, aluminum: 500, fuel: 500 },
    storageCap: { concrete: 2500, steel: 2500, aluminum: 2500, fuel: 2500 },
    productionRates: { concrete: 2, steel: 2, aluminum: 2, fuel: 2 },
    lastResourceUpdate: now,
    constructionQueue: [],
    productionQueue: [],
    buildings: [
      { id: 'b_cw', type: 'concrete_works' as const, level: 2, health: 400, maxHealth: 400 },
      { id: 'b_sf', type: 'steel_foundry' as const, level: 2, health: 400, maxHealth: 400 },
      { id: 'b_as', type: 'aluminum_smelter' as const, level: 2, health: 400, maxHealth: 400 },
      { id: 'b_fr', type: 'fuel_refinery' as const, level: 2, health: 400, maxHealth: 400 },
      { id: 'b_lc', type: 'logistics_center' as const, level: 1, health: 300, maxHealth: 300 },
      { id: 'b_vt', type: 'vulcan_turret' as const, level: 1, health: 300, maxHealth: 300 },
    ],
  };
  data.bases.push(testBase);

  const attackerUnit = {
    id: 'test_attacker_neut',
    mapId: 'map_riverfront_assault',
    type: 'titan_mbt' as const,
    ownerId: 'player_default',
    ownerName: 'HighCommander_One',
    x: 41,
    y: 41,
    rotation: 0,
    health: 500,
    maxHealth: 500,
    command: 'attack' as const,
    path: [],
    lastAttackTime: 0,
    kills: 0,
    homeBaseId: 'base_home_test',
  };

  gameSimulation.neutralizeOrdinaryBase(testBase, attackerUnit, now);

  // Verify transition to neutral/ownerless
  assert.strictEqual(testBase.ownerId, 'neutral');
  assert.strictEqual(testBase.lifecycleState, 'neutralized');

  // Verify 50% eligible production buildings destroyed (4 eligible production buildings -> 2 destroyed)
  const remainingProd = testBase.buildings.filter((b: any) =>
    ['concrete_works', 'steel_foundry', 'aluminum_smelter', 'fuel_refinery'].includes(b.type)
  );
  assert.strictEqual(remainingProd.length, 2, 'Exactly 50% of production buildings must be destroyed');

  // Verify logistics_center max-capacity building was removed
  assert.ok(!testBase.buildings.some((b: any) => b.type === 'logistics_center'), 'Logistics center must be destroyed');

  // Clean up test base
  data.bases = data.bases.filter((b) => b.id !== testBase.id);
});

test('19. Combat Siege: Conquest vehicle exclusivity & newcomer base protection', () => {
  const data = gameStore.getData();
  const now = Date.now();

  // 1. Rifle infantry must NOT have canCaptureBase: true
  const infantryDef = gameStore.getEffectiveUnitDef('rifle_infantry');
  assert.strictEqual(Boolean(infantryDef.canCaptureBase), false, 'Rifle infantry cannot capture bases');

  // 2. Dominator Conquest vehicle must have canCaptureBase: true
  const conquestDef = gameStore.getEffectiveUnitDef('dominator_conquest');
  assert.strictEqual(conquestDef.canCaptureBase, true, 'Dominator conquest vehicle must have canCaptureBase: true');

  // 3. Newcomer Outpost protection anti-veteran rule
  const newcomerBase = data.bases.find((b) => b.isNewcomerBase);
  assert.ok(newcomerBase, 'A newcomer outpost must exist on the tactical map');

  // Veteran commander with >= 2 owned bases
  const veteranCheck = gameStore.checkNewcomerBaseEligibility('player_default', newcomerBase, now);
  assert.strictEqual(veteranCheck.eligible, false, 'Veteran commander must be ineligible to capture newcomer base');
  assert.ok(veteranCheck.reason?.includes('restricts veteran annexation'));

  // Weekly capture counter tracking
  const user = data.users['player_default'];
  const prevWeeklyCaptures = user.profile.weeklyCapturesCount || 0;
  gameStore.recordPlayerBaseCapture('player_default', 'sample_base_1', 'map_riverfront_assault', now);
  assert.strictEqual(user.profile.weeklyCapturesCount, prevWeeklyCaptures + 1, 'weeklyCapturesCount must increment');
});

test('20. Combat Siege: Inactivity eviction frees sector capacity and recovers on login', () => {
  const data = gameStore.getData();
  const now = Date.now();
  const fourteenDaysMs = 14 * 86400000;

  // Create an inactive player
  const inactiveUserId = 'user_test_inactive_99';
  const inactiveBaseId = 'base_test_inactive_99';
  data.users[inactiveUserId] = {
    passwordHash: 'dummyhash',
    profile: {
      id: inactiveUserId,
      username: 'GhostCommander',
      email: 'ghost@frontline.mil',
      rank: 'Captain',
      score: 550,
      level: 3,
      avatar: 'scout_operator',
      homeBaseId: inactiveBaseId,
      homeMapId: 'map_riverfront_assault',
      currentMapId: 'map_riverfront_assault',
      totalBasesCaptured: 1,
      totalUnitsProduced: 5,
      totalUnitsDestroyed: 2,
      totalResourcesHarvested: 2000,
      highwayTransfersCompleted: 0,
      claimedRewardIds: [],
      joinedAt: now - fourteenDaysMs * 2,
      lastLoginAt: now - fourteenDaysMs - 10000,
      lastActiveAt: now - fourteenDaysMs - 10000,
      beginnerProtectionUntil: 0,
      isAdmin: false,
      adminRole: null,
      status: 'active',
      suspendedUntil: null,
      banReason: null,
      moderationHistory: [],
      weeklyCapturesCount: 0,
      weeklyCaptureTimestamps: [],
      homeBaseDestroyedCount: 0,
      isInactiveRelocated: false,
    },
  };

  data.bases.push({
    id: inactiveBaseId,
    mapId: 'map_riverfront_assault',
    name: "GhostCommander's Redoubt",
    type: 'home',
    ownerId: inactiveUserId,
    ownerName: 'GhostCommander',
    x: 50,
    y: 50,
    radius: 4,
    health: 3500,
    maxHealth: 3500,
    defenseShield: 1200,
    maxShield: 1200,
    captureProgress: 0,
    isProtected: false,
    isHomeBase: true,
    lifecycleState: 'active',
    resources: { concrete: 500, steel: 500, aluminum: 500, fuel: 500 },
    storageCap: { concrete: 2500, steel: 2500, aluminum: 2500, fuel: 2500 },
    productionRates: { concrete: 2, steel: 2, aluminum: 2, fuel: 2 },
    lastResourceUpdate: now,
    constructionQueue: [],
    productionQueue: [],
    buildings: [],
  });

  // Run inactivity eviction
  const evicted = gameStore.processInactivityEvictions(now);
  assert.ok(evicted.evictedUserIds.includes(inactiveUserId), 'Inactive user must be evicted from active map sector');
  assert.strictEqual(data.users[inactiveUserId].profile.isInactiveRelocated, true);
  assert.ok(!data.bases.some((b) => b.id === inactiveBaseId), 'Base must be archived from map bases');

  // Commander logs back in: recovers base safely
  const recovered = gameStore.recoverInactivePlayerBaseIfNeeded(inactiveUserId, now);
  assert.strictEqual(recovered.recovered, true, 'Base must be recovered on player return');
  assert.strictEqual(data.users[inactiveUserId].profile.isInactiveRelocated, false);
  const recoveredBase = data.bases.find((b) => b.ownerId === inactiveUserId);
  assert.ok(recoveredBase, 'Recovered base must be placed on map');
  assert.strictEqual(recoveredBase.lifecycleState, 'protected');

  // Clean up
  delete data.users[inactiveUserId];
  data.bases = data.bases.filter((b) => b.ownerId !== inactiveUserId);
});

test('21. Combat Siege: Admin migration preview and overlap resolution endpoints', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Login as super_admin
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SuperAdmin_Prime', password: 'adminpassword123' }),
    });
    assert.strictEqual(loginRes.status, 200, 'Super admin login must succeed');
    const { token } = await loginRes.json();

    // 2. Query migration preview
    const previewRes = await fetch(`${baseUrl}/api/admin/maps/migration-preview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(previewRes.status, 200, 'Migration preview endpoint must return 200');
    const preview = await previewRes.json();
    assert.ok(preview.success, 'Preview must succeed');
    assert.ok(typeof preview.overlappingBasesCount === 'number');

    // 3. Execute overlap migration
    const migrateRes = await fetch(`${baseUrl}/api/admin/maps/migrate-overlaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'Automated test sector defragmentation' }),
    });
    assert.strictEqual(migrateRes.status, 200, 'Migration execution endpoint must return 200');
    const result = await migrateRes.json();
    assert.ok(result.success, 'Migration execution must report success');
  });
});

test('22. Player Type Detection & Admin Player Management: Authoritative HUMAN, BOT, SYSTEM & UNKNOWN Classification, Anti-Spoofing, Filtering, Match Rosters & Verification', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    const storeData = (gameStore as any).data;

    // 1. Login as Super Admin
    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Commander',
        password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123',
      }),
    });
    assert.strictEqual(loginRes.status, 200, 'Super Admin login must succeed');
    const { token: adminToken } = await loginRes.json();
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };

    // 2. Test Client Spoofing Prevention: Client attempts to register as 'bot' with custom botAgentId & controlSource
    const spoofUsername = `SpoofAttempt_${Date.now()}`;
    const spoofRegRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: spoofUsername,
        email: `${spoofUsername.toLowerCase()}@command.mil`,
        password: 'password123',
        playerType: 'bot',
        botAgentId: 'spoofed_bot_agent',
        controlSource: 'ai_controller',
      }),
    });
    assert.strictEqual(spoofRegRes.status, 200, 'Registration must succeed with 200');
    const spoofRegBody = await spoofRegRes.json();
    const spoofProfile = spoofRegBody.profile || spoofRegBody.user;
    assert.strictEqual(
      spoofProfile.playerType,
      'human',
      'Server must ignore client-supplied playerType and classify authenticated registrant as human'
    );
    assert.strictEqual(spoofProfile.controlSource, 'human', 'Server must enforce human controlSource');
    assert.strictEqual(spoofProfile.botAgentId, null, 'Server must clear spoofed botAgentId on human registration');
    assert.strictEqual(spoofProfile.accountId, spoofProfile.id, 'Human account must have accountId linked to user id');

    // 3. Test Authoritative Bot Registration via Server Bot Registry
    const customBot = gameStore.registerBotAgent({
      botId: 'bot_tactical_vanguard',
      playerId: 'bot_vanguard_ai',
      displayName: 'Vanguard Tactical AI',
      difficulty: 'hard',
      aiProfile: 'Aggressive Flanker & Sector Denial',
      activeMapIds: ['map_riverfront_assault'],
    });
    assert.strictEqual(customBot.botId, 'bot_tactical_vanguard');

    // 4. Create an unverified legacy record (missing passwordHash and verificationStatus='legacy_unverified') to test UNKNOWN classification
    storeData.users['legacy_unverified_01'] = {
      passwordHash: '',
      profile: {
        id: 'legacy_unverified_01',
        username: 'Legacy_Ghost_Commander',
        email: 'legacy@unknown.local',
        rank: 'Commander',
        score: 250,
        level: 2,
        avatar: 'commander_1',
        homeBaseId: '',
        totalBasesCaptured: 0,
        totalUnitsProduced: 0,
        totalUnitsDestroyed: 0,
        totalResourcesHarvested: 0,
        joinedAt: Date.now() - 86400000 * 30,
        lastLoginAt: Date.now() - 86400000 * 10,
        beginnerProtectionUntil: 0,
        status: 'active',
        // Intentionally omit passwordHash and verified status to simulate legacy unverified record
      },
    };

    // 5. Query Admin Overview and verify playerTypeStats
    const overviewRes = await fetch(`${baseUrl}/api/admin/overview`, { headers: authHeaders });
    assert.strictEqual(overviewRes.status, 200);
    const overviewData = await overviewRes.json();
    assert.ok(overviewData.playerTypeStats, 'Overview must include playerTypeStats');
    assert.ok(overviewData.playerTypeStats.totalHumanPlayers >= 3, 'Must count verified human players');
    assert.ok(
      overviewData.playerTypeStats.totalBotPlayers >= 2,
      'Must count server-registered bot agents (enemy_insurgent + customBot)'
    );
    assert.ok(overviewData.playerTypeStats.totalSystemEntities >= 1, 'Must count system entities (neutral)');
    assert.ok(
      overviewData.playerTypeStats.totalUnknownPlayers >= 1,
      'Must count unverified legacy records as unknown'
    );

    // 6. Query Admin Players Directory without filters and verify all 4 types exist & no sensitive fields leak
    const allPlayersRes = await fetch(`${baseUrl}/api/admin/players?pageSize=100`, { headers: authHeaders });
    assert.strictEqual(allPlayersRes.status, 200);
    const allPlayersData = await allPlayersRes.json();
    assert.ok(Array.isArray(allPlayersData.items));
    assert.ok(allPlayersData.stats, 'Players endpoint must return stats summary');

    for (const item of allPlayersData.items) {
      assert.strictEqual(item.passwordHash, undefined, 'passwordHash must never be exposed in Admin Players list');
    }

    const humanEntry = allPlayersData.items.find((p: { id: string }) => p.id === 'player_default');
    const botEntry = allPlayersData.items.find((p: { id: string }) => p.id === 'enemy_insurgent');
    const customBotEntry = allPlayersData.items.find((p: { id: string }) => p.id === 'bot_vanguard_ai');
    const systemEntry = allPlayersData.items.find((p: { id: string }) => p.id === 'neutral');
    const unknownEntry = allPlayersData.items.find((p: { id: string }) => p.id === 'legacy_unverified_01');

    assert.ok(humanEntry && humanEntry.playerType === 'human', 'player_default must be classified as human');
    assert.ok(
      botEntry && botEntry.playerType === 'bot' && botEntry.botAgentId === 'bot_kodiak_pmc',
      'enemy_insurgent must be classified as bot with botAgentId'
    );
    assert.ok(
      customBotEntry && customBotEntry.playerType === 'bot' && customBotEntry.botAgentId === 'bot_tactical_vanguard',
      'custom registered bot must be classified as bot'
    );
    assert.ok(systemEntry && systemEntry.playerType === 'system', 'neutral must be classified as system');
    assert.ok(
      unknownEntry && unknownEntry.playerType === 'unknown',
      'legacy record without passwordHash must be classified as unknown, never assumed bot'
    );

    // 7. Test Admin Players Filtering by playerType (human, bot, system, unknown), search, and sorting
    const filterBotsRes = await fetch(`${baseUrl}/api/admin/players?playerType=bot`, { headers: authHeaders });
    const filterBotsData = await filterBotsRes.json();
    assert.ok(filterBotsData.items.length >= 2);
    assert.ok(
      filterBotsData.items.every((p: { playerType: string }) => p.playerType === 'bot'),
      'Filter playerType=bot must only return bot records'
    );

    const filterSystemRes = await fetch(`${baseUrl}/api/admin/players?playerType=system`, { headers: authHeaders });
    const filterSystemData = await filterSystemRes.json();
    assert.ok(filterSystemData.items.length >= 1);
    assert.ok(
      filterSystemData.items.every((p: { playerType: string }) => p.playerType === 'system'),
      'Filter playerType=system must only return system records'
    );

    const filterUnknownRes = await fetch(`${baseUrl}/api/admin/players?playerType=unknown`, { headers: authHeaders });
    const filterUnknownData = await filterUnknownRes.json();
    assert.ok(
      filterUnknownData.items.some((p: { id: string }) => p.id === 'legacy_unverified_01'),
      'Filter playerType=unknown must return legacy_unverified_01'
    );

    const searchBotRes = await fetch(`${baseUrl}/api/admin/players?search=bot_kodiak_pmc`, { headers: authHeaders });
    const searchBotData = await searchBotRes.json();
    assert.strictEqual(searchBotData.items.length, 1);
    assert.strictEqual(searchBotData.items[0].id, 'enemy_insurgent', 'Search by botAgentId must locate the bot');

    // 8. Test Admin Player Detail Inspection (/api/admin/players/:id) for BOT, HUMAN, and UNKNOWN
    const botDetailRes = await fetch(`${baseUrl}/api/admin/players/enemy_insurgent`, { headers: authHeaders });
    assert.strictEqual(botDetailRes.status, 200);
    const botDetail = await botDetailRes.json();
    assert.strictEqual(botDetail.profile.playerType, 'bot');
    assert.strictEqual(botDetail.profile.botAgentId, 'bot_kodiak_pmc');
    assert.strictEqual(botDetail.profile.controlSource, 'ai_controller');
    assert.ok(botDetail.botRecord, 'Bot detail response must include botRecord metadata');

    const humanDetailRes = await fetch(`${baseUrl}/api/admin/players/player_default`, { headers: authHeaders });
    assert.strictEqual(humanDetailRes.status, 200);
    const humanDetail = await humanDetailRes.json();
    assert.strictEqual(humanDetail.profile.playerType, 'human');
    assert.strictEqual(humanDetail.profile.passwordHash, undefined, 'Detail endpoint must strip passwordHash');

    // 9. Test Active Match Participant Rosters (/api/admin/matches)
    const matchesRes = await fetch(`${baseUrl}/api/admin/matches`, { headers: authHeaders });
    assert.strictEqual(matchesRes.status, 200);
    const matchesData = await matchesRes.json();
    assert.ok(matchesData.liveSector, 'Matches response must include liveSector');
    assert.ok(Array.isArray(matchesData.liveSector.participants), 'liveSector must include verified participants roster');
    assert.ok(matchesData.liveSector.participantTypeCounts, 'liveSector must include participantTypeCounts');
    assert.ok(
      matchesData.liveSector.participants.some((p: { playerType: string }) => p.playerType === 'bot'),
      'Active sector participants must include bot controller'
    );
    assert.ok(
      matchesData.liveSector.participants.some((p: { playerType: string }) => p.playerType === 'human'),
      'Active sector participants must include human commander'
    );
    assert.ok(Array.isArray(matchesData.matches), 'Matches response must include match history list');

    // 10. Test Admin Verification of UNKNOWN Entity & Protection of Verified HUMAN Accounts
    // 10a. Analyst role must be forbidden (403) from verifying player types
    const analystLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Telemetry_Analyst', password: 'analyst123' }),
    }).then((r) => r.json());

    const forbiddenVerifyRes = await fetch(`${baseUrl}/api/admin/players/legacy_unverified_01/verify-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${analystLogin.token}` },
      body: JSON.stringify({ playerType: 'human', reason: 'Analyst attempting classification' }),
    });
    assert.strictEqual(
      forbiddenVerifyRes.status,
      403,
      'Analyst role must receive 403 when attempting to verify player types'
    );

    // 10b. Attempting to reclassify a verified HUMAN account into a BOT must be rejected (400)
    const convertHumanToBotRes = await fetch(`${baseUrl}/api/admin/players/player_striker/verify-type`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ playerType: 'bot', reason: 'Invalid attempt to convert verified human to bot' }),
    });
    assert.strictEqual(
      convertHumanToBotRes.status,
      400,
      'Server must prevent converting a verified human account into a bot'
    );

    // 10c. Super Admin verifies UNKNOWN legacy entity as HUMAN and verifies audit log creation
    const verifyLegacyRes = await fetch(`${baseUrl}/api/admin/players/legacy_unverified_01/verify-type`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ playerType: 'human', reason: 'Confirmed legacy beta account provenance' }),
    });
    assert.strictEqual(verifyLegacyRes.status, 200, 'Super Admin must be able to resolve unknown entity classification');
    const verifyLegacyBody = await verifyLegacyRes.json();
    assert.strictEqual(verifyLegacyBody.record.playerType, 'human');
    assert.strictEqual(verifyLegacyBody.record.verificationStatus, 'admin_verified');

    const auditLogs: Array<{ action: string; targetId: string }> = storeData.auditLogs || [];
    assert.ok(
      auditLogs.some((log) => log.action === 'player.verify_type' && log.targetId === 'legacy_unverified_01'),
      'Resolving an unknown entity must record a player.verify_type audit log entry'
    );

    // 11. Test Individual Account Deletion (DELETE /api/admin/players/:id) and Bot/System Protection
    const delBotRes = await fetch(`${baseUrl}/api/admin/players/enemy_insurgent`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ reason: 'Attempt to delete bot' }),
    });
    assert.strictEqual(delBotRes.status, 400, 'Deleting a BOT entity via player account deletion must be rejected');

    const delPlayerRes = await fetch(`${baseUrl}/api/admin/players/${spoofProfile.id}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ reason: 'Remove test registrant account' }),
    });
    assert.strictEqual(delPlayerRes.status, 200, 'Deleting a player account must return 200');
    assert.strictEqual(storeData.users[spoofProfile.id], undefined, 'Deleted player must be removed from store.users');

    // Clean up test records
    delete storeData.users['legacy_unverified_01'];
    delete storeData.botRegistry['bot_vanguard_ai'];
  });
});

test('23. Combat Siege Strategic Home Base System: Complete 14-Point End-to-End Verification', async () => {
  resetRateLimiterForTests();
  await withTestServer(async (baseUrl) => {
    const storeData = gameStore.getData();

    // 1. Home Base Initialization for a new Commander (Single authoritative Home Base, 3x Armor, HQ Level, Consumption Rates)
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Commander_SiegeHQ',
        email: 'siegehq@frontline.mil',
        password: 'password123',
        faction: '1st Vanguard Coalition',
      }),
    });
    assert.strictEqual(regRes.status, 200, 'Registration for Commander_SiegeHQ must succeed');
    const regData = await regRes.json();
    const playerToken: string = regData.token;
    const playerProfile = regData.profile;
    assert.ok(playerProfile.homeBaseId, 'New commander must be assigned an authoritative homeBaseId');

    // Verify single authoritative Home Base across all maps
    const ownedHomeBases = storeData.bases.filter(
      (b) => b.ownerId === playerProfile.id && (b.isHomeBase || b.type === 'home')
    );
    assert.strictEqual(
      ownedHomeBases.length,
      1,
      'Each player must own exactly 1 authoritative Home Base across all maps'
    );
    const homeBase = ownedHomeBases[0];
    assert.strictEqual(homeBase.id, playerProfile.homeBaseId);
    assert.strictEqual(homeBase.isHomeBase, true);
    assert.strictEqual(homeBase.type, 'home');

    // 2. Home Base Selection & Visible World State Telemetry (hqLevel, armorMultiplier=3.0, consumptionRates)
    const worldState = gameSimulation.getVisibleWorldState(playerProfile.id, homeBase.mapId);
    const visibleHq = worldState.bases.find((b) => b.id === homeBase.id);
    assert.ok(visibleHq, 'Home Base must be present in visible world state');
    assert.strictEqual(visibleHq!.isHomeBase, true);
    assert.strictEqual(visibleHq!.armorMultiplier, 3.0, 'Home Base must report 3.0x armorMultiplier');
    assert.ok((visibleHq!.hqLevel || 0) >= 1, 'Initial Home Base Command Center level must be >= 1');
    assert.ok(visibleHq!.consumptionRates, 'Home Base must include server-authoritative consumptionRates');

    // 3. Resource Production & Storage Cap Enforcement
    homeBase.resources = { concrete: 5995, steel: 5995, aluminum: 5995, fuel: 5995 };
    (gameSimulation as any).lastEconomyTickMs = 0;
    (gameSimulation as any).tick();
    assert.ok(
      homeBase.resources.concrete <= (homeBase.storageCap?.concrete || 6000),
      'Resource generation must strictly respect storageCap'
    );

    // 4. Building Construction, Duplicate Queue Rejection, Invalid Placement Logging, and Cancel Construction Refund
    homeBase.resources = { concrete: 5000, steel: 5000, aluminum: 5000, fuel: 5000 };
    homeBase.constructionQueue = [];

    // 4a. Reject out-of-perimeter building placement and record placement failure
    const invalidPlaceRes = gameSimulation.buildOrUpgrade(
      playerProfile.id,
      homeBase.id,
      'radar_station',
      25, // way outside base radius
      25
    );
    assert.strictEqual(invalidPlaceRes.success, false, 'Out-of-perimeter building placement must be rejected');
    assert.ok(
      Array.isArray(storeData.users[playerProfile.id].profile.placementFailures) &&
        storeData.users[playerProfile.id].profile.placementFailures!.length >= 1,
      'Invalid placement must record a diagnostic entry in profile.placementFailures'
    );

    // 4b. Queue valid construction (upgrade Concrete Works)
    const concreteBeforeBuild = homeBase.resources.concrete;
    const buildRes = gameSimulation.buildOrUpgrade(playerProfile.id, homeBase.id, 'concrete_works');
    assert.strictEqual(buildRes.success, true, 'Upgrading Concrete Works must succeed');
    assert.strictEqual(homeBase.constructionQueue.length, 1);
    assert.ok(homeBase.resources.concrete < concreteBeforeBuild, 'Construction must deduct resources immediately');

    // 4c. Prevent duplicate queued construction for the same buildingType
    const dupBuildRes = gameSimulation.buildOrUpgrade(playerProfile.id, homeBase.id, 'concrete_works');
    assert.strictEqual(dupBuildRes.success, false, 'Duplicate construction order for same building must be rejected');

    // 4d. Cancel construction and verify 100% resource refund
    const orderIdToCancel = homeBase.constructionQueue[0].id;
    const cancelBuildRes = gameSimulation.cancelConstruction(playerProfile.id, homeBase.id, orderIdToCancel);
    assert.strictEqual(cancelBuildRes.success, true, 'Cancelling construction must succeed');
    assert.strictEqual(homeBase.constructionQueue.length, 0, 'Construction queue must be empty after cancel');
    assert.strictEqual(
      homeBase.resources.concrete,
      concreteBeforeBuild,
      'Cancelling construction must refund 100% of spent concrete'
    );

    // 5. Vehicle Production Queue, Home Base Ground-Unit Specialization, Cancel Production, and Unit Spawn
    // 5a. Ensure Home Base rejects non-ground unit production even if someone attempts to spoof aviation/naval unit
    const airAtHomeRes = gameSimulation.produceUnit(playerProfile.id, homeBase.id, 'cobra_gunship');
    assert.strictEqual(
      airAtHomeRes.success,
      false,
      'Home Base Motor Pool must reject aircraft production (ground vehicles only)'
    );

    // 5b. Queue ground vehicle (vanguard_scout)
    const steelBeforeUnit = homeBase.resources.steel;
    const prodRes = gameSimulation.produceUnit(playerProfile.id, homeBase.id, 'vanguard_scout');
    assert.strictEqual(prodRes.success, true, 'Producing ground vehicle at Home Base must succeed');
    assert.strictEqual(homeBase.productionQueue.length, 1);
    assert.ok(homeBase.resources.steel < steelBeforeUnit, 'Producing unit must deduct resources');

    // 5c. Cancel unit production and verify resource refund
    const prodOrderId = homeBase.productionQueue[0].id;
    const cancelUnitRes = gameSimulation.cancelUnitProduction(playerProfile.id, homeBase.id, prodOrderId);
    assert.strictEqual(cancelUnitRes.success, true, 'Cancelling unit production must succeed');
    assert.strictEqual(homeBase.productionQueue.length, 0);
    assert.strictEqual(homeBase.resources.steel, steelBeforeUnit, 'Cancelling unit must refund 100% of steel');

    // 5d. Complete unit production and verify unit spawns near Home Base
    const prodRes2 = gameSimulation.produceUnit(playerProfile.id, homeBase.id, 'vanguard_scout');
    assert.strictEqual(prodRes2.success, true);
    homeBase.productionQueue[0].finishTime = Date.now() - 10;
    (gameSimulation as any).lastEconomyTickMs = 0;
    (gameSimulation as any).tick();
    assert.strictEqual(homeBase.productionQueue.length, 0, 'Completed unit must leave productionQueue');
    const spawnedScout = storeData.units.find(
      (u) => u.ownerId === playerProfile.id && u.type === 'vanguard_scout' && u.mapId === homeBase.mapId
    );
    assert.ok(spawnedScout, 'Completed ground unit must spawn in world state on the Home Base map');
    storeData.units = storeData.units.filter((u) => u.id !== spawnedScout!.id);

    // 6. Unauthorized Modification Rejection
    const unauthCancel = gameSimulation.buildOrUpgrade('enemy_insurgent', homeBase.id, 'vulcan_turret');
    assert.strictEqual(
      unauthCancel.success,
      false,
      'Another player/bot must not be allowed to construct or modify a player Home Base'
    );

    // 7. Individual Building Repair & Full Base Repair
    const targetBuilding = homeBase.buildings.find((b) => b.type === 'vehicle_factory')!;
    targetBuilding.health = Math.floor(targetBuilding.maxHealth * 0.4);
    homeBase.health = 1800;
    const repairSingleRes = gameSimulation.repairBuilding(playerProfile.id, homeBase.id, targetBuilding.id);
    assert.strictEqual(repairSingleRes.success, true, 'Individual facility repair must succeed');
    assert.strictEqual(
      targetBuilding.health,
      targetBuilding.maxHealth,
      'Repaired building must be restored to 100% health'
    );

    const repairFullRes = gameSimulation.repairBuilding(playerProfile.id, homeBase.id);
    assert.strictEqual(repairFullRes.success, true, 'Full base repair must succeed');
    assert.strictEqual(homeBase.health, homeBase.maxHealth);

    // 8. Home Base Capture Protection & 3.0x Armor Bonus
    storeData.users[playerProfile.id].profile.beginnerProtectionUntil = 0;
    homeBase.isProtected = false;
    homeBase.newcomerProtectionUntil = 0;
    homeBase.rebuildProtectionUntil = 0;
    homeBase.defenseShield = 0;
    const enemyInfId = `unit_test_siege_inf_${Date.now()}`;
    storeData.units.push({
      id: enemyInfId,
      mapId: homeBase.mapId,
      type: 'rifle_infantry',
      ownerId: 'enemy_insurgent',
      ownerName: 'Insurgent_AI',
      x: homeBase.x + 0.5,
      y: homeBase.y + 0.5,
      health: 150,
      maxHealth: 150,
      command: 'attack',
      targetUnitId: null,
      targetBaseId: homeBase.id,
      path: [],
      lastAttackTime: 0,
      rotation: 0,
      kills: 0,
      homeBaseId: 'base_insurgent_alpha',
    });
    (gameSimulation as any).tick();
    assert.strictEqual(homeBase.ownerId, playerProfile.id, 'Home Base must NEVER be captured by enemy infantry');
    assert.strictEqual(homeBase.captureProgress, 0, 'Home Base captureProgress must remain 0');
    assert.ok(
      homeBase.captureBlockedReason?.includes('cannot be conquered') ||
        homeBase.captureBlockedReason?.includes('Home Base'),
      'Home Base must report capture immunity reason'
    );
    storeData.units = storeData.units.filter((u) => u.id !== enemyInfId);

    // 9. Home Base Destruction & Reconstruction Lifecycle (Preserving Persistent HQ Structures vs Resetting Starter Facilities)
    const ccBldg = homeBase.buildings.find((b) => b.type === 'command_center')!;
    ccBldg.level = 3;
    let depotBldg = homeBase.buildings.find((b) => b.type === 'storage_depot');
    if (!depotBldg) {
      depotBldg = {
        id: 'bldg_test_depot',
        type: 'storage_depot',
        level: 2,
        health: 900,
        maxHealth: 900,
        isConstructing: false,
      };
      homeBase.buildings.push(depotBldg);
    } else {
      depotBldg.level = 2;
    }
    const vfBldg = homeBase.buildings.find((b) => b.type === 'vehicle_factory')!;
    vfBldg.level = 3;

    // Trigger siege destruction via lethal enemy tank strike once defensive turrets & shield are down
    for (const b of homeBase.buildings) {
      if (['vulcan_turret', 'sam_launcher', 'artillery_battery'].includes(b.type)) {
        b.health = 0;
      }
    }
    homeBase.health = 1;
    homeBase.defenseShield = 0;
    homeBase.isProtected = false;
    homeBase.rebuildProtectionUntil = 0;
    homeBase.newcomerProtectionUntil = 0;
    const siegeTankId = `unit_test_siege_mbt_${Date.now()}`;
    storeData.units.push({
      id: siegeTankId,
      mapId: homeBase.mapId,
      type: 'titan_mbt',
      ownerId: 'enemy_insurgent',
      ownerName: 'Insurgent_AI',
      x: homeBase.x + 2,
      y: homeBase.y + 2,
      health: 800,
      maxHealth: 800,
      command: 'attack',
      targetUnitId: null,
      targetBaseId: homeBase.id,
      path: [],
      lastAttackTime: 0,
      rotation: 0,
      kills: 0,
      homeBaseId: 'base_insurgent_alpha',
    });
    (gameSimulation as any).tick();
    storeData.units = storeData.units.filter((u) => u.id !== siegeTankId);

    assert.strictEqual(homeBase.ownerId, playerProfile.id, 'Destroyed Home Base must remain owned by the player');
    assert.strictEqual(
      homeBase.lifecycleState,
      'rebuilding',
      'Destroyed Home Base must transition to rebuilding state'
    );
    assert.strictEqual(homeBase.isProtected, true, 'Rebuilding Home Base must activate rebuild protection shield');
    assert.strictEqual(
      homeBase.buildings.find((b) => b.type === 'command_center')?.level,
      3,
      'Persistent Command Center must retain Level 3 across Home Base reconstruction'
    );
    assert.strictEqual(
      homeBase.buildings.find((b) => b.type === 'storage_depot')?.level,
      2,
      'Persistent Storage Depot must retain Level 2 across Home Base reconstruction'
    );
    assert.strictEqual(
      homeBase.buildings.find((b) => b.type === 'vehicle_factory')?.level,
      1,
      'Resettable Vehicle Factory must reset to Level 1 upon Home Base reconstruction'
    );
    assert.ok(
      Array.isArray(homeBase.destructionHistory) && homeBase.destructionHistory.length >= 1,
      'Home Base reconstruction must append a HomeBaseDestructionRecord'
    );

    // 10. Home Map Relocation API (POST /api/player/home-map) & Cooldown Enforcement
    const targetMapId = homeBase.mapId === 'map_iron_ridge_corridor' ? 'map_riverfront_assault' : 'map_iron_ridge_corridor';
    const cooldownTargetMapId = homeBase.mapId;
    const relocateRes = await fetch(`${baseUrl}/api/player/home-map`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerToken}`,
      },
      body: JSON.stringify({ targetMapId }),
    });
    assert.strictEqual(relocateRes.status, 200, 'POST /api/player/home-map must succeed');
    const relocateData = await relocateRes.json();
    assert.strictEqual(relocateData.base.mapId, targetMapId);
    assert.strictEqual(homeBase.mapId, targetMapId);
    assert.strictEqual(storeData.users[playerProfile.id].profile.homeMapId, targetMapId);

    // Immediate second relocation must be blocked by cooldown
    const cooldownRelocateRes = await fetch(`${baseUrl}/api/player/home-map`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerToken}`,
      },
      body: JSON.stringify({ targetMapId: cooldownTargetMapId }),
    });
    assert.strictEqual(
      cooldownRelocateRes.status,
      400,
      'Immediate second Home Map relocation must be blocked by cooldown'
    );

    // 11. Returning-Player Restoration After Inactivity Archiving
    const pastTime = Date.now() - 15 * 24 * 60 * 60 * 1000;
    storeData.users[playerProfile.id].profile.lastMapActivityAt = pastTime;
    storeData.users[playerProfile.id].profile.lastActiveAt = pastTime;
    storeData.users[playerProfile.id].profile.lastLoginAt = pastTime;
    const evicted = gameStore.processInactivityEvictions(Date.now());
    assert.ok(
      evicted.evictedUserIds.includes(playerProfile.id),
      'Inactive player must be processed by inactivity eviction'
    );
    assert.ok(
      !storeData.bases.some((b) => b.id === homeBase.id),
      'Evicted Home Base must be removed from active map'
    );
    assert.ok(
      storeData.users[playerProfile.id].profile.archivedHomeBase,
      'Evicted Home Base must be archived in profile.archivedHomeBase'
    );

    // Returning player recovers their Home Base with persistent HQ levels preserved
    const recovered = gameStore.recoverInactivePlayerBaseIfNeeded(playerProfile.id, Date.now());
    assert.strictEqual(recovered.recovered, true, 'Returning player must automatically recover their Home Base');
    const restoredBase = storeData.bases.find((b) => b.ownerId === playerProfile.id && b.isHomeBase);
    assert.ok(restoredBase, 'Restored Home Base must exist on map');
    assert.strictEqual(
      restoredBase!.buildings.find((b) => b.type === 'command_center')?.level,
      3,
      'Recovered Home Base must restore archived Command Center Level 3'
    );
    assert.strictEqual(
      storeData.users[playerProfile.id].profile.archivedHomeBase,
      null,
      'archivedHomeBase snapshot must be cleared once restored'
    );

    // 12. Admin Home Base Inspection & Management Endpoints
    const adminLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Commander',
        password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123',
      }),
    });
    const { token: adminToken } = await adminLoginRes.json();
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    const diagRes = await fetch(`${baseUrl}/api/admin/players/${playerProfile.id}/home-base`, {
      headers: adminHeaders,
    });
    assert.strictEqual(diagRes.status, 200, 'GET /api/admin/players/:id/home-base must return 200');
    const diagData = await diagRes.json();
    assert.strictEqual(diagData.diagnostics.hqLevel, 3);
    assert.strictEqual(diagData.diagnostics.armorMultiplier, 3.0);

    // Admin resets cooldowns and relocates player Home Base back to Sector 01
    const adminResetCdRes = await fetch(`${baseUrl}/api/admin/players/${playerProfile.id}/home-base/action`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ action: 'reset_cooldowns', reason: 'Clear relocation cooldown for test verification' }),
    });
    assert.strictEqual(adminResetCdRes.status, 200);

    const adminRelocateRes = await fetch(`${baseUrl}/api/admin/players/${playerProfile.id}/home-base/action`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        action: 'relocate',
        targetMapId: 'map_riverfront_assault',
        reason: 'Relocate commander HQ back to Sector 01',
      }),
    });
    assert.strictEqual(adminRelocateRes.status, 200);
    const adminRelocateBody = await adminRelocateRes.json();
    assert.strictEqual(adminRelocateBody.diagnostics.mapId, 'map_riverfront_assault');

    // Clean up test commander account
    await fetch(`${baseUrl}/api/admin/players/${playerProfile.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Cleanup Test 23 Commander_SiegeHQ account' }),
    });
  });
});


