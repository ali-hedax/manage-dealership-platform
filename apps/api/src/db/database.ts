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

export interface DatabaseHandle {
  db: Database;
  driver: AppConfig['DB_DRIVER'];
  migrate(): Promise<void>;
  close(): Promise<void>;
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
  };
}
