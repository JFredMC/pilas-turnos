import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { crearDb, crearPool } from '../src/db/client';
import { sembrar } from '../src/db/seed';

export const URL_TEST =
  process.env['DATABASE_URL_TEST'] ?? 'postgres://pilas:pilas@localhost:5432/pilas_test';
export const PASSWORD = 'clave-de-prueba-123';

/** Lunes futuro (los horarios de ejemplo son de lunes a sábado). */
export function proximoLunes(): string {
  const d = new Date(Date.now() - 5 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export async function prepararApp(extra: Partial<ReturnType<typeof loadConfig>> = {}) {
  const pool = crearPool(URL_TEST);
  const db = crearDb(pool);
  await db.execute(sql`truncate salones cascade`);
  const fecha = proximoLunes();
  await sembrar(db, { password: PASSWORD, fecha });
  await sembrar(db, { password: PASSWORD, slug: 'otro-salon', fecha });
  const app: INestApplication = await createApp({
    config: {
      ...loadConfig({ DATABASE_URL: URL_TEST, JWT_SECRET: 'x'.repeat(40) }),
      clientRpm: 10_000,
      loginRpm: 1_000,
      reservasRpm: 1_000,
      ...extra,
    },
  });
  await app.init();
  const http = () => request(app.getHttpServer());
  const login = async (email: string) =>
    (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body
      .token as string;
  return {
    app,
    db,
    pool,
    http,
    login,
    fecha,
    cerrar: async () => {
      await app.close();
      await pool.end();
    },
  };
}
