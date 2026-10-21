/** Colombia no tiene horario de verano: siempre UTC-5. */
export const OFFSET = '-05:00';
const MS_DIA = 86_400_000;

export const inicioDia = (fecha: string): Date => new Date(`${fecha}T00:00:00${OFFSET}`);
export const finDia = (fecha: string): Date => new Date(inicioDia(fecha).getTime() + MS_DIA);
export const enMinutos = (fecha: string, min: number): Date =>
  new Date(inicioDia(fecha).getTime() + min * 60_000);
/** Día de la semana (0 = domingo) de una fecha de Colombia. */
export const diaSemana = (fecha: string): number =>
  new Date(`${fecha}T12:00:00${OFFSET}`).getUTCDay();
/** Fecha YYYY-MM-DD y minutos desde medianoche, en hora de Colombia. */
export function aLocal(d: Date): { fecha: string; min: number } {
  const local = new Date(d.getTime() - 5 * 3_600_000);
  return {
    fecha: local.toISOString().slice(0, 10),
    min: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}
export const hoy = (): string => aLocal(new Date()).fecha;
export const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
