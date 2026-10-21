import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { crearDb, crearPool } from '../src/db/client';
import { salones, usuarios } from '../src/db/schema';
import { sembrarDemoSiAplica } from '../src/db/seed';
import { URL_TEST } from './helpers';

const pool = crearPool(URL_TEST);
const db = crearDb(pool);
afterAll(() => pool.end());

describe('seed al arrancar (SEED_DEMO)', () => {
  it('no hace nada sin SEED_DEMO=true', async () => {
    await db.execute(sql`truncate salones cascade`);
    expect(await sembrarDemoSiAplica(db, { SEED_PASSWORD: 'clave-larga-123' })).toBe('omitido');
    expect(await db.select().from(salones)).toHaveLength(0);
  });
  it('en producción exige SEED_PASSWORD', async () => {
    expect(await sembrarDemoSiAplica(db, { SEED_DEMO: 'true', NODE_ENV: 'production' })).toBe(
      'omitido',
    );
  });
  it('crea salon-ejemplo una sola vez, aunque arranquen dos instancias a la vez', async () => {
    const env = { SEED_DEMO: 'true', NODE_ENV: 'production', SEED_PASSWORD: 'clave-larga-123' };
    const r = await Promise.all([sembrarDemoSiAplica(db, env), sembrarDemoSiAplica(db, env)]);
    expect(r.sort()).toEqual(['creado', 'existia']);
    expect(await sembrarDemoSiAplica(db, env)).toBe('existia');
    expect(await db.select().from(salones)).toHaveLength(1);
    expect(await db.select().from(usuarios)).toHaveLength(2);
  });
});
