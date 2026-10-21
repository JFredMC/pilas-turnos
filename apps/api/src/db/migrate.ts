import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config';
import { crearDb, crearPool } from './client';

export const CARPETA_MIGRACIONES = path.resolve(__dirname, '../../drizzle');

export async function migrar(url: string): Promise<void> {
  const pool = crearPool(url);
  try {
    await migrate(crearDb(pool), { migrationsFolder: CARPETA_MIGRACIONES });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* sin .env */
  }
  migrar(loadConfig().databaseUrl).then(
    () => console.log('Migraciones aplicadas.'),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
