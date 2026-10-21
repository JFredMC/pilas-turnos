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
export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'no-llego';
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
}
export interface Espera {
  id: string;
  clienta: string;
  telefono: string;
  servicioId: string;
  preferencia: string;
}
