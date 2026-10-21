import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/auth';
import { loadConfig } from '../config';
import { aLocal, enMinutos, hoy } from '../tiempo';
import { crearDb, crearPool, type Db } from './client';
import {
  citas,
  clientas,
  estilistas,
  horarios,
  pagos,
  salones,
  servicios,
  usuarios,
} from './schema';

/** DATOS DE EJEMPLO: salón, personas y precios inventados para probar Pilas. */
export const SLUG_EJEMPLO = 'salon-ejemplo';

export async function sembrar(
  db: Db,
  opciones: { password: string; slug?: string; email?: string; fecha?: string },
) {
  const slug = opciones.slug ?? SLUG_EJEMPLO;
  const [existe] = await db.select().from(salones).where(eq(salones.slug, slug));
  if (existe) return { salonId: existe.id, creado: false };
  const fecha = opciones.fecha ?? hoy();
  const dominio = opciones.email ?? `${slug}.ejemplo.co`;
  return db.transaction(async (tx) => {
    const [salon] = await tx
      .insert(salones)
      .values({
        slug,
        nombre: 'Salón Ejemplo',
        ciudad: 'Turbo',
        telefono: '3000000000',
        abonoCop: 5000,
      })
      .returning();
    const est = await tx
      .insert(estilistas)
      .values([
        { salonId: salon.id, nombre: 'Yuli (ejemplo)', comisionPct: 50 },
        { salonId: salon.id, nombre: 'Kelly (ejemplo)', comisionPct: 40 },
        { salonId: salon.id, nombre: 'Andrés (ejemplo)', comisionPct: 45 },
      ])
      .returning();
    const svc = await tx
      .insert(servicios)
      .values([
        { salonId: salon.id, nombre: 'Corte de dama', minutos: 45, precio: 25000 },
        { salonId: salon.id, nombre: 'Corte de caballero', minutos: 30, precio: 15000 },
        { salonId: salon.id, nombre: 'Lavado y cepillado', minutos: 45, precio: 20000 },
        { salonId: salon.id, nombre: 'Trenzas', minutos: 120, precio: 60000 },
        { salonId: salon.id, nombre: 'Manicure semipermanente', minutos: 60, precio: 35000 },
        { salonId: salon.id, nombre: 'Tinte completo', minutos: 120, precio: 80000 },
      ])
      .returning();
    // Lunes a sábado, 8:00 a 18:00.
    await tx.insert(horarios).values(
      est.flatMap((e) =>
        [1, 2, 3, 4, 5, 6].map((d) => ({
          salonId: salon.id,
          estilistaId: e.id,
          diaSemana: d,
          abreMin: 8 * 60,
          cierraMin: 18 * 60,
        })),
      ),
    );
    const hash = await hashPassword(opciones.password);
    await tx.insert(usuarios).values([
      {
        salonId: salon.id,
        email: `duena@${dominio}`,
        passwordHash: hash,
        nombre: 'Dueña (ejemplo)',
        rol: 'duena',
      },
      {
        salonId: salon.id,
        email: `yuli@${dominio}`,
        passwordHash: hash,
        nombre: est[0].nombre,
        rol: 'estilista',
        estilistaId: est[0].id,
      },
    ]);
    const ahora = new Date();
    const cl = await tx
      .insert(clientas)
      .values(
        ['María', 'Luz', 'Sandra', 'Diana'].map((n, i) => ({
          salonId: salon.id,
          nombre: `${n} (ejemplo)`,
          telefono: `300000000${i + 1}`,
          consentimientoEn: ahora,
          consentimientoVersion: 'ejemplo',
        })),
      )
      .returning();
    const cita = (
      i: number,
      e: number,
      s: number,
      min: number,
      estado: 'pendiente' | 'confirmada' | 'atendida',
      codigo: string,
    ) => {
      const inicio = enMinutos(fecha, min);
      return {
        salonId: salon.id,
        clientaId: cl[i].id,
        estilistaId: est[e].id,
        servicioId: svc[s].id,
        inicio,
        fin: new Date(inicio.getTime() + svc[s].minutos * 60_000),
        precio: svc[s].precio,
        estado,
        codigo,
      };
    };
    const cs = await tx
      .insert(citas)
      .values([
        cita(0, 0, 0, 8 * 60, 'atendida', 'EJEM01'),
        cita(1, 0, 3, 9 * 60, 'atendida', 'EJEM02'),
        cita(2, 1, 4, 8 * 60 + 30, 'atendida', 'EJEM03'),
        cita(3, 1, 5, 14 * 60, 'confirmada', 'EJEM04'),
      ])
      .returning();
    await tx.insert(pagos).values([
      {
        salonId: salon.id,
        citaId: cs[0].id,
        tipo: 'abono',
        medio: 'nequi',
        monto: 5000,
        estado: 'confirmado',
      },
      {
        salonId: salon.id,
        citaId: cs[0].id,
        tipo: 'saldo',
        medio: 'nequi',
        monto: 20000,
        estado: 'confirmado',
      },
      {
        salonId: salon.id,
        citaId: cs[0].id,
        tipo: 'propina',
        medio: 'nequi',
        monto: 2000,
        estado: 'confirmado',
      },
      {
        salonId: salon.id,
        citaId: cs[1].id,
        tipo: 'saldo',
        medio: 'efectivo',
        monto: 60000,
        estado: 'confirmado',
      },
      {
        salonId: salon.id,
        citaId: cs[2].id,
        tipo: 'saldo',
        medio: 'efectivo',
        monto: 35000,
        estado: 'confirmado',
      },
      {
        salonId: salon.id,
        citaId: cs[3].id,
        tipo: 'abono',
        medio: 'nequi',
        monto: 5000,
        estado: 'confirmado',
      },
    ]);
    return { salonId: salon.id, creado: true, fecha: aLocal(enMinutos(fecha, 0)).fecha };
  });
}

/**
 * Siembra el salón de ejemplo al arrancar si SEED_DEMO=true (Render Free no tiene Shell).
 * Es idempotente: si "salon-ejemplo" ya existe no toca nada, y si dos instancias arrancan a la vez
 * la restricción única del slug evita duplicados.
 */
export async function sembrarDemoSiAplica(
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<'omitido' | 'creado' | 'existia'> {
  if ((env['SEED_DEMO'] ?? '').toLowerCase() !== 'true') return 'omitido';
  const prod = env['NODE_ENV'] === 'production';
  const password = env['SEED_PASSWORD'] ?? (prod ? '' : 'pilas-ejemplo-local');
  if (password.length < 10) {
    console.warn('SEED_DEMO=true pero falta SEED_PASSWORD (mínimo 10 caracteres): no se siembra.');
    return 'omitido';
  }
  try {
    const r = await sembrar(db, { password });
    return r.creado ? 'creado' : 'existia';
  } catch (e) {
    if (
      (e as { code?: string; cause?: { code?: string } }).code === '23505' ||
      (e as { cause?: { code?: string } }).cause?.code === '23505'
    )
      return 'existia';
    throw e;
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* sin .env */
  }
  const prod = process.env['NODE_ENV'] === 'production';
  const password = process.env['SEED_PASSWORD'] ?? (prod ? '' : 'pilas-ejemplo-local');
  if (password.length < 10) {
    console.error('Define SEED_PASSWORD (mínimo 10 caracteres) para sembrar en producción.');
    process.exit(1);
  }
  const pool = crearPool(loadConfig().databaseUrl);
  sembrar(crearDb(pool), { password })
    .then((r) =>
      console.log(r.creado ? 'Datos de ejemplo creados.' : 'El salón de ejemplo ya existía.'),
    )
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
