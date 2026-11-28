import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { Pool } from 'pg';
import type { AppConfig } from '../config';
import * as schema from './schema';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Tx;

/** A session-level PostgreSQL advisory lock held on one dedicated connection. */
export interface LeaderLock {
  /** True once the connection holding the lock was lost (the lock went with it). */
  readonly lost: boolean;
  /**
   * Proves the lock is still held: one cheap query on the holding connection. A connection that died
   * quietly (no error event) is found here, so a second worker can never run beside this one (S07).
   */
  check(): Promise<boolean>;
  release(): Promise<void>;
}

export interface DatabaseHandle {
  db: Database;
  driver: AppConfig['DB_DRIVER'];
  migrate(): Promise<void>;
  close(): Promise<void>;
  /**
   * pg_try_advisory_lock on a dedicated connection, so that only one background worker of a
   * kind runs at a time (Manage Pulse). Null when another process holds it. PGlite is a single
   * embedded process and always grants it.
   */
  leaderLock(key: number): Promise<LeaderLock | null>;
}

export const DATABASE = Symbol('DATABASE');

const MIGRATIONS_FOLDER = join(__dirname, 'migrations');

export function openDatabase(cfg: AppConfig): DatabaseHandle {
  if (cfg.DB_DRIVER === 'postgres') {
    const pool = new Pool({ connectionString: cfg.DATABASE_URL, max: 10 });
    const db = drizzlePg(pool, { schema });
    return {
      db: db as unknown as Database,
      driver: 'postgres',
      migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => pool.end(),
      async leaderLock(key: number) {
        const client = await pool.connect();
        try {
          const res = await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [key]);
          if (!res.rows[0]?.ok) {
            client.release();
            return null;
          }
        } catch (e) {
          client.release();
          throw e;
        }
        const state = { lost: false, released: false };
        client.on('error', () => { state.lost = true; });
        client.on('end', () => { state.lost = true; });
        return {
          get lost() { return state.lost; },
          async check() {
            if (state.lost || state.released) return false;
            try {
              // The lock is ours only while this connection lives and still holds it.
              const held = await client.query<{ ok: boolean }>("select exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and objid::bigint = ($1::bigint % 4294967296) and granted) as ok", [key]);
              if (!held.rows[0]?.ok) state.lost = true;
            } catch {
              state.lost = true;
            }
            return !state.lost;
          },
          async release() {
            if (state.released) return;
            state.released = true;
            try { if (!state.lost) await client.query('select pg_advisory_unlock($1)', [key]); } finally { client.release(state.lost); }
          },
        };
      },
    };
  }

  const dir = cfg.PGLITE_DATA_DIR;
  let client: PGlite;
  if (dir.startsWith('memory://')) {
    client = new PGlite();
  } else {
    const abs = isAbsolute(dir) ? dir : resolve(__dirname, '../..', dir);
    mkdirSync(abs, { recursive: true });
    client = new PGlite(abs);
  }
  const db = drizzlePglite(client, { schema });
  return {
    db: db as unknown as Database,
    driver: 'pglite',
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
    // PGlite is one embedded process: the lock is always granted and never lost.
    async leaderLock() {
      return { lost: false, async check() { return true; }, async release() { /* nothing to release */ } };
    },
  };
}
