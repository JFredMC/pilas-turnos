export interface Servicio {
  id: string;
  nombre: string;
  minutos: number;
  precio: number;
}
export interface Estilista {
  id: string;
  nombre: string;
  /** Porcentaje de comisión sobre servicios (0-1). */
  comision: number;
}
export type MedioPago = 'efectivo' | 'nequi';
export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'no-llego' | 'cancelada';
export interface Cita {
  id: string;
  clienta: string;
  telefono: string;
  servicioId: string;
  estilistaId: string;
  /** Hora en formato HH:mm del día de hoy. */
  hora: string;
  estado: EstadoCita;
  abono: number;
  pago?: MedioPago;
  propina?: number;
  /** Código que recibe la clienta (solo con API). */
  codigo?: string;
  /** Abono por Nequi esperando confirmación de la dueña (solo con API). */
  abonoPendienteId?: string | null;
}
export interface Espera {
  id: string;
  clienta: string;
  telefono: string;
  servicioId: string;
  preferencia: string;
}
export interface Cupo {
  hora: string;
  /** Fecha-hora ISO del cupo (solo con API). */
  inicio?: string;
}
