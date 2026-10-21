import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import type { Db } from './db/client';
import { citas, horarios } from './db/schema';
import { diaSemana, enMinutos, finDia, inicioDia } from './tiempo';

export const ESTADOS_ACTIVOS = ['pendiente', 'confirmada', 'atendida'] as const;
export const PASO_MIN = 30;

/** Horarios libres (inicio de cada cupo) de una estilista para un servicio en una fecha. */
export async function cuposLibres(
  db: Db,
  salonId: string,
  estilistaId: string,
  fecha: string,
  duracion: number,
  ahora = new Date(),
): Promise<Date[]> {
  const turnos = await db
    .select()
    .from(horarios)
    .where(
      and(
        eq(horarios.salonId, salonId),
        eq(horarios.estilistaId, estilistaId),
        eq(horarios.diaSemana, diaSemana(fecha)),
      ),
    );
  if (!turnos.length) return [];
  const ocupadas = await db
    .select({ inicio: citas.inicio, fin: citas.fin })
    .from(citas)
    .where(
      and(
        eq(citas.salonId, salonId),
        eq(citas.estilistaId, estilistaId),
        inArray(citas.estado, [...ESTADOS_ACTIVOS]),
        lt(citas.inicio, finDia(fecha)),
        gt(citas.fin, inicioDia(fecha)),
      ),
    );
  const libres: Date[] = [];
  for (const t of turnos) {
    for (let m = t.abreMin; m + duracion <= t.cierraMin; m += PASO_MIN) {
      const ini = enMinutos(fecha, m);
      const fin = new Date(ini.getTime() + duracion * 60_000);
      if (ini <= ahora) continue;
      if (ocupadas.some((c) => ini < c.fin && fin > c.inicio)) continue;
      libres.push(ini);
    }
  }
  return libres.sort((a, b) => a.getTime() - b.getTime());
}

/** ¿El intervalo cae completo dentro del horario de la estilista ese día y en un cupo válido? */
export async function dentroDeHorario(
  db: Db,
  salonId: string,
  estilistaId: string,
  fecha: string,
  iniMin: number,
  duracion: number,
) {
  const turnos = await db
    .select()
    .from(horarios)
    .where(
      and(
        eq(horarios.salonId, salonId),
        eq(horarios.estilistaId, estilistaId),
        eq(horarios.diaSemana, diaSemana(fecha)),
      ),
    );
  return turnos.some(
    (t) =>
      iniMin >= t.abreMin &&
      iniMin + duracion <= t.cierraMin &&
      (iniMin - t.abreMin) % PASO_MIN === 0,
  );
}
