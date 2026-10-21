import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
export const POOL = Symbol('POOL');

export function crearPool(url: string): Pool {
  // Render entrega URLs con SSL; en local no hace falta.
  const ssl = /render\.com|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined;
  return new Pool({ connectionString: url, ssl, max: 10 });
}
export const crearDb = (pool: Pool): Db => drizzle(pool, { schema });
