import { eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  alliances,
  bases,
  battleReports,
  chatMessages,
  maps,
  sessions,
  systemKv,
  units,
  users,
} from './schema.ts';
import type {
  Alliance,
  Base,
  BattleReport,
  ChatMessage,
  EnvironmentObject,
  MapSectorConfig,
  PlayerProfile,
  Unit,
} from '../types/game.ts';

export function isPostgresConfigured(): boolean {
  if (process.env.NODE_ENV === 'test' && process.env.TEST_POSTGRES !== 'true') {
    return false;
  }
  return Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME && process.env.SQL_USER);
}

/**
 * Verifies connectivity to Cloud SQL PostgreSQL using Drizzle ORM.
 */
export async function verifyPostgresConnection(): Promise<{ connected: boolean; tablesCount: number; error?: string }> {
  if (!isPostgresConfigured()) {
    return { connected: false, tablesCount: 0, error: 'SQL_HOST not configured in environment' };
  }
  try {
    const existingMaps = await db.select().from(maps).limit(1);
    return { connected: true, tablesCount: 9 + (existingMaps.length >= 0 ? 0 : 0) };
  } catch (err: any) {
    console.error('Database Error in verifyPostgresConnection:', err);
    return { connected: false, tablesCount: 0, error: err?.message || 'Unknown DB error' };
  }
}

/**
 * Transactional sync of the authoritative state into Cloud SQL PostgreSQL.
 */
export async function syncStateToPostgres(state: {
  users: Record<string, { passwordHash: string; profile: PlayerProfile }>;
  tokens: Record<string, string>;
  adminSessions: Record<string, any>;
  maps: MapSectorConfig[];
  envObjectsByMap: Record<string, EnvironmentObject[]>;
  bases: Base[];
  units: Unit[];
  alliances: Alliance[];
  chat: ChatMessage[];
  battleReports: BattleReport[];
  kv: Record<string, any>;
}): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const now = Date.now();

  try {
    await db.transaction(async (tx) => {
      // 1. Upsert Users
      for (const [uid, record] of Object.entries(state.users)) {
        await tx
          .insert(users)
          .values({
            uid,
            username: record.profile.username,
            email: record.profile.email || `${uid}@frontline.mil`,
            passwordHash: record.passwordHash,
            profileJson: record.profile,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: {
              username: record.profile.username,
              email: record.profile.email || `${uid}@frontline.mil`,
              passwordHash: record.passwordHash,
              profileJson: record.profile,
              updatedAt: now,
            },
          });
      }

      // 2. Upsert Sessions
      for (const [token, userId] of Object.entries(state.tokens)) {
        const adm = state.adminSessions?.[token];
        await tx
          .insert(sessions)
          .values({
            token,
            userId,
            role: adm?.role || 'player',
            sessionJson: adm || { token, userId },
            expiresAt: adm?.expiresAt || now + 86400000 * 7,
            createdAt: adm?.createdAt || now,
          })
          .onConflictDoUpdate({
            target: sessions.token,
            set: {
              userId,
              role: adm?.role || 'player',
              sessionJson: adm || { token, userId },
              expiresAt: adm?.expiresAt || now + 86400000 * 7,
            },
          });
      }

      // 3. Upsert Maps
      for (const m of state.maps) {
        const mapEnv = state.envObjectsByMap[m.id] || [];
        await tx
          .insert(maps)
          .values({
            id: m.id,
            name: m.name,
            seed: m.seed,
            width: m.width,
            height: m.height,
            enabled: m.enabled,
            isActiveMap: m.isActiveMap,
            configJson: m,
            envObjectsJson: mapEnv,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: maps.id,
            set: {
              name: m.name,
              seed: m.seed,
              width: m.width,
              height: m.height,
              enabled: m.enabled,
              isActiveMap: m.isActiveMap,
              configJson: m,
              envObjectsJson: mapEnv,
              updatedAt: now,
            },
          });
      }

      // 4. Upsert Bases
      for (const b of state.bases) {
        await tx
          .insert(bases)
          .values({
            id: b.id,
            mapId: b.mapId || 'map_riverfront_assault',
            ownerId: b.ownerId,
            allianceId: b.allianceId || null,
            x: Math.round(b.x),
            y: Math.round(b.y),
            baseJson: b,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: bases.id,
            set: {
              mapId: b.mapId || 'map_riverfront_assault',
              ownerId: b.ownerId,
              allianceId: b.allianceId || null,
              x: Math.round(b.x),
              y: Math.round(b.y),
              baseJson: b,
              updatedAt: now,
            },
          });
      }

      // 5. Sync Units (upsert active units and prune destroyed ones)
      const existingUnitRows = await tx.select({ id: units.id }).from(units);
      const activeUnitIds = new Set(state.units.map((u) => u.id));
      const staleIds = existingUnitRows.map((r) => r.id).filter((id) => !activeUnitIds.has(id));
      if (staleIds.length > 0) {
        await tx.delete(units).where(inArray(units.id, staleIds));
      }

      for (const u of state.units) {
        await tx
          .insert(units)
          .values({
            id: u.id,
            mapId: u.mapId || 'map_riverfront_assault',
            ownerId: u.ownerId,
            allianceId: u.allianceId || null,
            x: u.x,
            y: u.y,
            unitJson: u,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: units.id,
            set: {
              mapId: u.mapId || 'map_riverfront_assault',
              ownerId: u.ownerId,
              allianceId: u.allianceId || null,
              x: u.x,
              y: u.y,
              unitJson: u,
              updatedAt: now,
            },
          });
      }

      // 6. Sync Alliances
      const existingAlliances = await tx.select({ id: alliances.id }).from(alliances);
      const activeAllianceIds = new Set(state.alliances.map((a) => a.id));
      const staleAllianceIds = existingAlliances.map((r) => r.id).filter((id) => !activeAllianceIds.has(id));
      if (staleAllianceIds.length > 0) {
        await tx.delete(alliances).where(inArray(alliances.id, staleAllianceIds));
      }

      for (const a of state.alliances) {
        await tx
          .insert(alliances)
          .values({
            id: a.id,
            name: a.name,
            tag: a.tag,
            leaderId: a.leaderId,
            allianceJson: a,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: alliances.id,
            set: {
              name: a.name,
              tag: a.tag,
              leaderId: a.leaderId,
              allianceJson: a,
              updatedAt: now,
            },
          });
      }

      // 7. Upsert recent Chat Messages (last 100)
      const recentChat = state.chat.slice(-100);
      for (const msg of recentChat) {
        await tx
          .insert(chatMessages)
          .values({
            id: msg.id,
            mapId: msg.mapId || 'map_riverfront_assault',
            channel: msg.channel,
            senderId: msg.senderId,
            allianceId: msg.allianceId || null,
            messageJson: msg,
            timestamp: msg.timestamp,
          })
          .onConflictDoNothing();
      }

      // 8. Upsert Battle Reports (last 100)
      const recentReports = (state.battleReports || []).slice(0, 100);
      for (const rep of recentReports) {
        await tx
          .insert(battleReports)
          .values({
            id: rep.id,
            mapId: rep.mapId,
            attackerId: rep.attackerId,
            defenderId: rep.defenderId,
            baseId: rep.baseId || null,
            reportType: rep.type,
            reportJson: rep,
            timestamp: rep.timestamp,
          })
          .onConflictDoNothing();
      }

      // 9. Upsert System KV entries
      for (const [key, val] of Object.entries(state.kv)) {
        if (val === undefined) continue;
        await tx
          .insert(systemKv)
          .values({
            key,
            valueJson: val,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: systemKv.key,
            set: {
              valueJson: val,
              updatedAt: now,
            },
          });
      }
    });
    return true;
  } catch (err) {
    console.error('Database Error in syncStateToPostgres:', err);
    return false;
  }
}

/**
 * Loads existing state from Cloud SQL PostgreSQL if already populated.
 */
export async function loadStateFromPostgres() {
  if (!isPostgresConfigured()) return null;

  try {
    const userRows = await db.select().from(users);
    if (userRows.length === 0) {
      return null;
    }

    const sessionRows = await db.select().from(sessions);
    const mapRows = await db.select().from(maps);
    const baseRows = await db.select().from(bases);
    const unitRows = await db.select().from(units);
    const allianceRows = await db.select().from(alliances);
    const chatRows = await db.select().from(chatMessages);
    const reportRows = await db.select().from(battleReports);
    const kvRows = await db.select().from(systemKv);

    const loadedUsers: Record<string, { passwordHash: string; profile: PlayerProfile }> = {};
    for (const r of userRows) {
      loadedUsers[r.uid] = {
        passwordHash: r.passwordHash,
        profile: r.profileJson as PlayerProfile,
      };
    }

    const loadedTokens: Record<string, string> = {};
    const loadedAdminSessions: Record<string, any> = {};
    const now = Date.now();
    for (const s of sessionRows) {
      if (s.expiresAt > now) {
        loadedTokens[s.token] = s.userId;
        if (s.role && s.role !== 'player' && s.sessionJson) {
          loadedAdminSessions[s.token] = s.sessionJson;
        }
      }
    }

    const loadedMaps: MapSectorConfig[] = [];
    const loadedEnvByMap: Record<string, EnvironmentObject[]> = {};
    for (const m of mapRows) {
      loadedMaps.push(m.configJson as MapSectorConfig);
      loadedEnvByMap[m.id] = (m.envObjectsJson as EnvironmentObject[]) || [];
    }

    const loadedBases: Base[] = baseRows.map((b) => b.baseJson as Base);
    const loadedUnits: Unit[] = unitRows.map((u) => u.unitJson as Unit);
    const loadedAlliances: Alliance[] = allianceRows.map((a) => a.allianceJson as Alliance);
    const loadedChat: ChatMessage[] = chatRows
      .map((c) => c.messageJson as ChatMessage)
      .sort((a, b) => a.timestamp - b.timestamp);
    const loadedReports: BattleReport[] = reportRows
      .map((r) => r.reportJson as BattleReport)
      .sort((a, b) => b.timestamp - a.timestamp);

    const kvMap: Record<string, any> = {};
    for (const k of kvRows) {
      kvMap[k.key] = k.valueJson;
    }

    return {
      users: loadedUsers,
      tokens: loadedTokens,
      adminSessions: loadedAdminSessions,
      maps: loadedMaps,
      envObjectsByMap: loadedEnvByMap,
      bases: loadedBases,
      units: loadedUnits,
      alliances: loadedAlliances,
      chat: loadedChat,
      battleReports: loadedReports,
      kv: kvMap,
    };
  } catch (err) {
    console.error('Database Error in loadStateFromPostgres:', err);
    return null;
  }
}

/**
 * Atomic transactional persistence for a single base and optional unit spawn/transfer.
 */
export async function persistBaseAndUnitsTransaction(base: Base, updatedUnits: Unit[]): Promise<void> {
  if (!isPostgresConfigured()) return;
  const now = Date.now();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(bases)
        .values({
          id: base.id,
          mapId: base.mapId || 'map_riverfront_assault',
          ownerId: base.ownerId,
          allianceId: base.allianceId || null,
          x: Math.round(base.x),
          y: Math.round(base.y),
          baseJson: base,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: bases.id,
          set: {
            mapId: base.mapId || 'map_riverfront_assault',
            ownerId: base.ownerId,
            allianceId: base.allianceId || null,
            x: Math.round(base.x),
            y: Math.round(base.y),
            baseJson: base,
            updatedAt: now,
          },
        });

      for (const u of updatedUnits) {
        await tx
          .insert(units)
          .values({
            id: u.id,
            mapId: u.mapId || 'map_riverfront_assault',
            ownerId: u.ownerId,
            allianceId: u.allianceId || null,
            x: u.x,
            y: u.y,
            unitJson: u,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: units.id,
            set: {
              mapId: u.mapId || 'map_riverfront_assault',
              ownerId: u.ownerId,
              allianceId: u.allianceId || null,
              x: u.x,
              y: u.y,
              unitJson: u,
              updatedAt: now,
            },
          });
      }
    });
  } catch (err) {
    console.error('Database Error in persistBaseAndUnitsTransaction:', err);
  }
}

/**
 * Atomic transactional persistence for user profile & password hash.
 */
export async function persistUserTransaction(uid: string, passwordHash: string, profile: PlayerProfile): Promise<void> {
  if (!isPostgresConfigured()) return;
  const now = Date.now();
  try {
    await db
      .insert(users)
      .values({
        uid,
        username: profile.username,
        email: profile.email || `${uid}@frontline.mil`,
        passwordHash,
        profileJson: profile,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          username: profile.username,
          email: profile.email || `${uid}@frontline.mil`,
          passwordHash,
          profileJson: profile,
          updatedAt: now,
        },
      });
  } catch (err) {
    console.error('Database Error in persistUserTransaction:', err);
  }
}

/**
 * Atomic transactional persistence for alliance state.
 */
export async function persistAllianceTransaction(alliance: Alliance | null, deletedAllianceId?: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  const now = Date.now();
  try {
    if (deletedAllianceId) {
      await db.delete(alliances).where(eq(alliances.id, deletedAllianceId));
      return;
    }
    if (alliance) {
      await db
        .insert(alliances)
        .values({
          id: alliance.id,
          name: alliance.name,
          tag: alliance.tag,
          leaderId: alliance.leaderId,
          allianceJson: alliance,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: alliances.id,
          set: {
            name: alliance.name,
            tag: alliance.tag,
            leaderId: alliance.leaderId,
            allianceJson: alliance,
            updatedAt: now,
          },
        });
    }
  } catch (err) {
    console.error('Database Error in persistAllianceTransaction:', err);
  }
}
