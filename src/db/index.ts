import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
    });

    // Idle client terminations (e.g. host or proxy closing idle sockets after timeout)
    // are standard pool lifecycle events. node-postgres automatically evicts the dead client
    // and allocates a fresh connection on the next checkout.
    global._postgresPool.on('error', (err: any) => {
      const isExpectedIdleClosure =
        err?.message?.includes('Connection terminated unexpectedly') ||
        err?.message?.includes('closed') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01' ||
        err?.code === 'EPIPE';

      if (isExpectedIdleClosure) {
        // Expected idle socket reap by host/proxy; client is automatically replaced on next query
        return;
      }
      console.warn('Notice: SQL pool client error:', err?.message || err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };
