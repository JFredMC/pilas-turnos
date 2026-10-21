import { Cita, Espera, Estilista, Servicio } from './modelos';

/**
 * DATOS DE EJEMPLO. Nombres, precios y citas son inventados para el prototipo;
 * los precios reales de Turbo quedan por validar en las entrevistas.
 */
export const SERVICIOS: Servicio[] = [
  { id: 'corte-dama', nombre: 'Corte de dama', minutos: 45, precio: 25000 },
  { id: 'corte-caballero', nombre: 'Corte de caballero', minutos: 30, precio: 15000 },
  { id: 'cepillado', nombre: 'Lavado y cepillado', minutos: 45, precio: 20000 },
  { id: 'trenzas', nombre: 'Trenzas', minutos: 120, precio: 60000 },
  { id: 'unas', nombre: 'Manicure semipermanente', minutos: 60, precio: 35000 },
  { id: 'tinte', nombre: 'Tinte completo', minutos: 120, precio: 80000 },
];

export const ESTILISTAS: Estilista[] = [
  { id: 'yuli', nombre: 'Yuli (ejemplo)', comision: 0.5 },
  { id: 'kelly', nombre: 'Kelly (ejemplo)', comision: 0.4 },
  { id: 'andres', nombre: 'Andrés (ejemplo)', comision: 0.45 },
];

export const CITAS_EJEMPLO: Cita[] = [
  {
    id: 'c1',
    clienta: 'María (ejemplo)',
    telefono: '3000000001',
    servicioId: 'corte-dama',
    estilistaId: 'yuli',
    hora: '08:00',
    estado: 'atendida',
    abono: 5000,
    pago: 'nequi',
    propina: 2000,
  },
  {
    id: 'c2',
    clienta: 'Luz (ejemplo)',
    telefono: '3000000002',
    servicioId: 'trenzas',
    estilistaId: 'yuli',
    hora: '09:00',
    estado: 'atendida',
    abono: 10000,
    pago: 'efectivo',
    propina: 5000,
  },
  {
    id: 'c3',
    clienta: 'Sandra (ejemplo)',
    telefono: '3000000003',
    servicioId: 'unas',
    estilistaId: 'kelly',
    hora: '08:30',
    estado: 'atendida',
    abono: 0,
    pago: 'efectivo',
  },
  {
    id: 'c4',
    clienta: 'Carlos (ejemplo)',
    telefono: '3000000004',
    servicioId: 'corte-caballero',
    estilistaId: 'andres',
    hora: '10:00',
    estado: 'atendida',
    abono: 0,
    pago: 'nequi',
    propina: 1000,
  },
  {
    id: 'c5',
    clienta: 'Diana (ejemplo)',
    telefono: '3000000005',
    servicioId: 'tinte',
    estilistaId: 'kelly',
    hora: '14:00',
    estado: 'confirmada',
    abono: 20000,
  },
  {
    id: 'c6',
    clienta: 'Paola (ejemplo)',
    telefono: '3000000006',
    servicioId: 'cepillado',
    estilistaId: 'yuli',
    hora: '15:00',
    estado: 'pendiente',
    abono: 0,
  },
  {
    id: 'c7',
    clienta: 'Jorge (ejemplo)',
    telefono: '3000000007',
    servicioId: 'corte-caballero',
    estilistaId: 'andres',
    hora: '11:00',
    estado: 'no-llego',
    abono: 0,
  },
];

export const ESPERA_EJEMPLO: Espera[] = [
  {
    id: 'e1',
    clienta: 'Yesenia (ejemplo)',
    telefono: '3000000008',
    servicioId: 'corte-dama',
    preferencia: 'Hoy en la tarde',
  },
  {
    id: 'e2',
    clienta: 'Camila (ejemplo)',
    telefono: '3000000009',
    servicioId: 'unas',
    preferencia: 'Cualquier hora con Kelly',
  },
];

/** Horario de atención de ejemplo. */
export const HORA_APERTURA = 8;
export const HORA_CIERRE = 18;
