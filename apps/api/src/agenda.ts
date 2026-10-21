import { and, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Db } from './db/client';
import { citas, excepcionesHorario, horarios } from './db/schema';
import { diaSemana, enMinutos, finDia, inicioDia } from './tiempo';

export const ESTADOS_ACTIVOS = ['pendiente', 'confirmada', 'atendida'] as const;
export const PASO_MIN = 30;

/**
 * Franjas de atención de una estilista en una fecha: horario semanal, salvo que haya una excepción.
 * Un cierre de todo el salón (festivo) o de la estilista (día libre) deja el día sin cupos;
 * una excepción con horas reemplaza el horario semanal ese día.
 */
export async function turnosDelDia(db: Db, salonId: string, estilistaId: string, fecha: string) {
  const exc = await db
    .select()
    .from(excepcionesHorario)
    .where(
      and(
        eq(excepcionesHorario.salonId, salonId),
        eq(excepcionesHorario.fecha, fecha),
        or(isNull(excepcionesHorario.estilistaId), eq(excepcionesHorario.estilistaId, estilistaId)),
      ),
    );
  if (exc.some((e) => e.cerrado)) return [];
  const especiales = exc.filter((e) => e.abreMin !== null && e.cierraMin !== null);
  const propia = especiales.filter((e) => e.estilistaId === estilistaId);
  const usar = propia.length ? propia : especiales;
  if (usar.length)
    return usar.map((e) => ({ abreMin: e.abreMin as number, cierraMin: e.cierraMin as number }));
  return db
    .select({ abreMin: horarios.abreMin, cierraMin: horarios.cierraMin })
    .from(horarios)
    .where(
      and(
        eq(horarios.salonId, salonId),
        eq(horarios.estilistaId, estilistaId),
        eq(horarios.diaSemana, diaSemana(fecha)),
      ),
    );
}

/** Horarios libres (inicio de cada cupo) de una estilista para un servicio en una fecha. */
export async function cuposLibres(
  db: Db,
  salonId: string,
  estilistaId: string,
  fecha: string,
  duracion: number,
  ahora = new Date(),
): Promise<Date[]> {
  const turnos = await turnosDelDia(db, salonId, estilistaId, fecha);
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
  const turnos = await turnosDelDia(db, salonId, estilistaId, fecha);
  return turnos.some(
    (t) =>
      iniMin >= t.abreMin &&
      iniMin + duracion <= t.cierraMin &&
      (iniMin - t.abreMin) % PASO_MIN === 0,
  );
}
