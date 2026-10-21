import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Bytes crudos (PostgreSQL bytea). */
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const rolEnum = pgEnum('rol', ['duena', 'estilista']);
export const estadoCitaEnum = pgEnum('estado_cita', [
  'pendiente',
  'confirmada',
  'atendida',
  'no_llego',
  'cancelada',
]);
export const tipoPagoEnum = pgEnum('tipo_pago', ['abono', 'saldo', 'propina']);
export const medioPagoEnum = pgEnum('medio_pago', ['efectivo', 'nequi']);
export const estadoPagoEnum = pgEnum('estado_pago', ['pendiente', 'confirmado', 'rechazado']);

const id = () => uuid('id').primaryKey().defaultRandom();
const creado = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();
const salonRef = () =>
  uuid('salon_id')
    .notNull()
    .references(() => salones.id, { onDelete: 'cascade' });

export const salones = pgTable('salones', {
  id: id(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  ciudad: text('ciudad').notNull().default('Turbo'),
  telefono: text('telefono'),
  /** Abono en pesos que se pide al reservar (0 = sin abono). */
  abonoCop: integer('abono_cop').notNull().default(0),
  /** ¿Se pide abono al reservar? (el monto es abonoCop). */
  abonoActivo: boolean('abono_activo').notNull().default(true),
  /** WhatsApp del salón para que las clientas escriban. */
  whatsapp: text('whatsapp'),
  /** Número de Nequi donde se reciben los abonos. */
  nequiNumero: text('nequi_numero'),
  /** Imagen del QR de Nequi Negocios que sube la dueña (PNG/JPEG/WebP, máx. 300 kB). */
  nequiQr: bytea('nequi_qr'),
  nequiQrTipo: text('nequi_qr_tipo'),
  nequiQrActualizado: timestamp('nequi_qr_actualizado', { withTimezone: true }),
  creadoEn: creado(),
});

export const estilistas = pgTable(
  'estilistas',
  {
    id: id(),
    salonId: salonRef(),
    nombre: text('nombre').notNull(),
    /** Comisión sobre servicios, en porcentaje entero (0-100). */
    comisionPct: integer('comision_pct').notNull().default(50),
    activo: integer('activo').notNull().default(1),
    creadoEn: creado(),
  },
  (t) => [
    index('estilistas_salon_idx').on(t.salonId),
    check('comision_rango', sql`${t.comisionPct} between 0 and 100`),
  ],
);

export const usuarios = pgTable(
  'usuarios',
  {
    id: id(),
    salonId: salonRef(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    nombre: text('nombre').notNull(),
    rol: rolEnum('rol').notNull(),
    estilistaId: uuid('estilista_id').references(() => estilistas.id, { onDelete: 'set null' }),
    /** Contraseña temporal: debe cambiarla en el primer ingreso. */
    debeCambiarPassword: boolean('debe_cambiar_password').notNull().default(false),
    /** Sube con cada cambio de contraseña: invalida los tokens anteriores. */
    passwordVersion: integer('password_version').notNull().default(1),
    creadoEn: creado(),
  },
  (t) => [uniqueIndex('usuarios_email_uq').on(sql`lower(${t.email})`)],
);

export const servicios = pgTable(
  'servicios',
  {
    id: id(),
    salonId: salonRef(),
    nombre: text('nombre').notNull(),
    minutos: integer('minutos').notNull(),
    precio: integer('precio').notNull(),
    activo: integer('activo').notNull().default(1),
  },
  (t) => [
    index('servicios_salon_idx').on(t.salonId),
    check('minutos_pos', sql`${t.minutos} > 0`),
    check('precio_pos', sql`${t.precio} >= 0`),
  ],
);

/** Horario semanal por estilista. Minutos desde medianoche, hora de Colombia. */
export const horarios = pgTable(
  'horarios',
  {
    id: id(),
    salonId: salonRef(),
    estilistaId: uuid('estilista_id')
      .notNull()
      .references(() => estilistas.id, { onDelete: 'cascade' }),
    /** 0 = domingo … 6 = sábado. */
    diaSemana: integer('dia_semana').notNull(),
    abreMin: integer('abre_min').notNull(),
    cierraMin: integer('cierra_min').notNull(),
  },
  (t) => [
    index('horarios_estilista_idx').on(t.estilistaId),
    check('dia_rango', sql`${t.diaSemana} between 0 and 6`),
    check('rango_horas', sql`${t.abreMin} < ${t.cierraMin}`),
  ],
);

/** Datos personales de la clienta (Ley 1581 de 2012): se guarda el consentimiento. */
export const clientas = pgTable(
  'clientas',
  {
    id: id(),
    salonId: salonRef(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono').notNull(),
    consentimientoEn: timestamp('consentimiento_en', { withTimezone: true }).notNull(),
    consentimientoVersion: text('consentimiento_version').notNull(),
    creadoEn: creado(),
  },
  (t) => [uniqueIndex('clientas_salon_tel_uq').on(t.salonId, t.telefono)],
);

export const citas = pgTable(
  'citas',
  {
    id: id(),
    salonId: salonRef(),
    estilistaId: uuid('estilista_id')
      .notNull()
      .references(() => estilistas.id, { onDelete: 'restrict' }),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'restrict' }),
    /** Se vuelve null si la clienta pide borrar sus datos; la cita queda anónima para el cuadre. */
    clientaId: uuid('clienta_id').references(() => clientas.id, { onDelete: 'set null' }),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    /** Precio del servicio al momento de reservar. */
    precio: integer('precio').notNull(),
    estado: estadoCitaEnum('estado').notNull().default('pendiente'),
    /** Código corto que recibe la clienta para consultar o borrar sus datos. */
    codigo: text('codigo').notNull(),
    creadoEn: creado(),
  },
  (t) => [
    index('citas_salon_inicio_idx').on(t.salonId, t.inicio),
    uniqueIndex('citas_codigo_uq').on(t.salonId, t.codigo),
    check('fin_despues', sql`${t.fin} > ${t.inicio}`),
  ],
);

export const listaEspera = pgTable(
  'lista_espera',
  {
    id: id(),
    salonId: salonRef(),
    clientaId: uuid('clienta_id')
      .notNull()
      .references(() => clientas.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
    preferencia: text('preferencia').notNull().default('Cualquier hora'),
    creadoEn: creado(),
  },
  (t) => [index('espera_salon_idx').on(t.salonId)],
);

export const pagos = pgTable(
  'pagos',
  {
    id: id(),
    salonId: salonRef(),
    citaId: uuid('cita_id')
      .notNull()
      .references(() => citas.id, { onDelete: 'cascade' }),
    tipo: tipoPagoEnum('tipo').notNull(),
    medio: medioPagoEnum('medio').notNull(),
    monto: integer('monto').notNull(),
    estado: estadoPagoEnum('estado').notNull().default('pendiente'),
    creadoEn: creado(),
  },
  (t) => [index('pagos_cita_idx').on(t.citaId), check('monto_pos', sql`${t.monto} >= 0`)],
);

/** Cierre de caja guardado (foto del cuadre del día por estilista). */
export const cierresCaja = pgTable(
  'cierres_caja',
  {
    id: id(),
    salonId: salonRef(),
    estilistaId: uuid('estilista_id')
      .notNull()
      .references(() => estilistas.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    servicios: integer('servicios').notNull(),
    ventas: integer('ventas').notNull(),
    comision: integer('comision').notNull(),
    propinas: integer('propinas').notNull(),
    efectivo: integer('efectivo').notNull(),
    nequi: integer('nequi').notNull(),
    cerradoPor: uuid('cerrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creadoEn: creado(),
  },
  (t) => [uniqueIndex('cierre_dia_uq').on(t.salonId, t.estilistaId, t.fecha)],
);

/** Excepciones al horario semanal: días libres, festivos o un horario distinto ese día. */
export const excepcionesHorario = pgTable(
  'excepciones_horario',
  {
    id: id(),
    salonId: salonRef(),
    /** null = aplica a todo el salón (p. ej. festivo). */
    estilistaId: uuid('estilista_id').references(() => estilistas.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    /** true = no se atiende ese día; false = se atiende en abreMin–cierraMin. */
    cerrado: boolean('cerrado').notNull().default(true),
    abreMin: integer('abre_min'),
    cierraMin: integer('cierra_min'),
    motivo: text('motivo'),
    creadoEn: creado(),
  },
  (t) => [
    index('excepciones_salon_fecha_idx').on(t.salonId, t.fecha),
    check(
      'excepcion_horas',
      sql`${t.cerrado} or (${t.abreMin} is not null and ${t.cierraMin} is not null and ${t.abreMin} < ${t.cierraMin})`,
    ),
  ],
);

/** Enlaces de recuperación de contraseña: solo se guarda el hash del token, de un solo uso. */
export const recuperaciones = pgTable(
  'recuperaciones',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    usadoEn: timestamp('usado_en', { withTimezone: true }),
    creadoEn: creado(),
  },
  (t) => [uniqueIndex('recuperaciones_token_uq').on(t.tokenHash)],
);
