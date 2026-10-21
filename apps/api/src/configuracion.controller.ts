import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from './db/client';
import {
  citas,
  estilistas,
  excepcionesHorario,
  horarios,
  salones,
  servicios,
  usuarios,
} from './db/schema';
import {
  JwtGuard,
  Roles,
  UsuarioActual,
  hashPassword,
  passwordTemporal,
  type Sesion,
} from './auth/auth';
import { ZodPipe, fechaSchema, nombreSchema, telefonoSchema } from './zod.pipe';
import { hoy } from './tiempo';
import { QR_MAX_BYTES, sinQr, tipoImagen } from './qr';

const hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:mm')
  .transform((h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)));
const salonPatch = z
  .object({
    nombre: nombreSchema.optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones')
      .min(3)
      .max(60)
      .optional(),
    ciudad: z.string().trim().min(2).max(60).optional(),
    whatsapp: telefonoSchema.nullable().optional(),
    nequiNumero: telefonoSchema.nullable().optional(),
    abonoActivo: z.boolean().optional(),
    abonoCop: z.number().int().min(0).max(500_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para cambiar');
const servicioBody = z.object({
  nombre: nombreSchema,
  minutos: z
    .number()
    .int()
    .min(10)
    .max(600)
    .refine((m) => m % 5 === 0, 'Usa múltiplos de 5 minutos'),
  precio: z.number().int().min(0).max(5_000_000),
  activo: z.boolean().optional(),
});
const estilistaBody = z.object({
  nombre: nombreSchema,
  comisionPct: z.number().int().min(0).max(100),
  activo: z.boolean().optional(),
});
const horarioBody = z.object({
  franjas: z
    .array(z.object({ diaSemana: z.number().int().min(0).max(6), abre: hora, cierra: hora }))
    .max(28)
    .refine(
      (fs) => fs.every((f) => f.abre < f.cierra),
      'La hora de cierre debe ser después de la de apertura',
    )
    .refine(
      (fs) =>
        fs.every((a, i) =>
          fs.every(
            (b, j) =>
              i === j || a.diaSemana !== b.diaSemana || a.cierra <= b.abre || b.cierra <= a.abre,
          ),
        ),
      'Hay franjas que se cruzan el mismo día',
    ),
});
const excepcionBody = z
  .object({
    estilistaId: z.uuid().nullable().default(null),
    fecha: fechaSchema,
    cerrado: z.boolean().default(true),
    abre: hora.optional(),
    cierra: hora.optional(),
    motivo: z.string().trim().max(80).optional(),
  })
  .refine(
    (e) => e.cerrado || (e.abre !== undefined && e.cierra !== undefined && e.abre < e.cierra),
    'Indica la hora de apertura y cierre de ese día',
  );
const usuarioBody = z.object({
  nombre: nombreSchema,
  email: z.email().max(120),
  estilistaId: z.uuid(),
});
const desdeQuery = z.object({ desde: fechaSchema.optional() });

const aHHmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const esUnico = (e: unknown) => {
  for (let x = e as { code?: string; cause?: unknown } | undefined; x; x = x.cause as typeof x)
    if (x.code === '23505') return true;
  return false;
};

/** Configuración del salón: solo la dueña. Todo se limita a su salonId. */
@Controller('config')
@UseGuards(JwtGuard)
@Roles('duena')
export class ConfiguracionController {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ---------- Salón ----------
  @Get('salon')
  async salon(@UsuarioActual() u: Sesion) {
    const [s] = await this.db.select().from(salones).where(eq(salones.id, u.salonId));
    return sinQr(s);
  }

  /** Sube el QR de Nequi Negocios (cuerpo binario image/png, image/jpeg o image/webp, máx. 300 kB). */
  @Put('salon/qr')
  async subirQr(@UsuarioActual() u: Sesion, @Req() req: { body: unknown }) {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length === 0)
      throw new BadRequestException('Envía la imagen del QR (PNG, JPEG o WebP)');
    if (b.length > QR_MAX_BYTES) throw new BadRequestException('La imagen pesa más de 300 kB');
    const tipo = tipoImagen(b);
    if (!tipo) throw new BadRequestException('El archivo no es una imagen PNG, JPEG o WebP');
    const [s] = await this.db
      .update(salones)
      .set({ nequiQr: b, nequiQrTipo: tipo, nequiQrActualizado: new Date() })
      .where(eq(salones.id, u.salonId))
      .returning();
    return sinQr(s);
  }

  @Delete('salon/qr')
  async borrarQr(@UsuarioActual() u: Sesion) {
    const [s] = await this.db
      .update(salones)
      .set({ nequiQr: null, nequiQrTipo: null, nequiQrActualizado: null })
      .where(eq(salones.id, u.salonId))
      .returning();
    return sinQr(s);
  }

  @Patch('salon')
  async editarSalon(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(salonPatch)) b: z.infer<typeof salonPatch>,
  ) {
    if (b.abonoActivo && b.abonoCop === 0)
      throw new BadRequestException('Si pides abono, el monto debe ser mayor que cero');
    try {
      const [s] = await this.db.update(salones).set(b).where(eq(salones.id, u.salonId)).returning();
      return sinQr(s);
    } catch (e) {
      if (esUnico(e)) throw new ConflictException('Ese enlace ya lo usa otro salón');
      throw e;
    }
  }

  // ---------- Servicios ----------
  @Get('servicios')
  servicios(@UsuarioActual() u: Sesion) {
    return this.db
      .select()
      .from(servicios)
      .where(eq(servicios.salonId, u.salonId))
      .orderBy(asc(servicios.nombre));
  }

  @Post('servicios')
  async crearServicio(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(servicioBody)) b: z.infer<typeof servicioBody>,
  ) {
    const [s] = await this.db
      .insert(servicios)
      .values({ ...b, activo: b.activo === false ? 0 : 1, salonId: u.salonId })
      .returning();
    return s;
  }

  @Patch('servicios/:id')
  async editarServicio(
    @UsuarioActual() u: Sesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(servicioBody.partial())) b: Partial<z.infer<typeof servicioBody>>,
  ) {
    const { activo, ...resto } = b;
    const [s] = await this.db
      .update(servicios)
      .set({ ...resto, ...(activo === undefined ? {} : { activo: activo ? 1 : 0 }) })
      .where(and(eq(servicios.id, id), eq(servicios.salonId, u.salonId)))
      .returning();
    if (!s) throw new NotFoundException('Servicio no encontrado');
    return s;
  }

  /** Si el servicio ya tiene citas, se desactiva (no se pierde el historial del cuadre). */
  @Delete('servicios/:id')
  async borrarServicio(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    const [s] = await this.db
      .select()
      .from(servicios)
      .where(and(eq(servicios.id, id), eq(servicios.salonId, u.salonId)));
    if (!s) throw new NotFoundException('Servicio no encontrado');
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(citas)
      .where(eq(citas.servicioId, id));
    if (n > 0) {
      await this.db.update(servicios).set({ activo: 0 }).where(eq(servicios.id, id));
      return { resultado: 'desactivado' };
    }
    await this.db.delete(servicios).where(eq(servicios.id, id));
    return { resultado: 'borrado' };
  }

  // ---------- Estilistas ----------
  @Get('estilistas')
  async estilistas(@UsuarioActual() u: Sesion) {
    const [est, hs] = await Promise.all([
      this.db
        .select()
        .from(estilistas)
        .where(eq(estilistas.salonId, u.salonId))
        .orderBy(asc(estilistas.nombre)),
      this.db
        .select()
        .from(horarios)
        .where(eq(horarios.salonId, u.salonId))
        .orderBy(asc(horarios.diaSemana), asc(horarios.abreMin)),
    ]);
    return est.map((e) => ({
      ...e,
      activo: e.activo === 1,
      horario: hs
        .filter((h) => h.estilistaId === e.id)
        .map((h) => ({
          diaSemana: h.diaSemana,
          abre: aHHmm(h.abreMin),
          cierra: aHHmm(h.cierraMin),
        })),
    }));
  }

  @Post('estilistas')
  async crearEstilista(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(estilistaBody)) b: z.infer<typeof estilistaBody>,
  ) {
    const [e] = await this.db
      .insert(estilistas)
      .values({
        salonId: u.salonId,
        nombre: b.nombre,
        comisionPct: b.comisionPct,
        activo: b.activo === false ? 0 : 1,
      })
      .returning();
    return { ...e, activo: e.activo === 1, horario: [] };
  }

  @Patch('estilistas/:id')
  async editarEstilista(
    @UsuarioActual() u: Sesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(estilistaBody.partial())) b: Partial<z.infer<typeof estilistaBody>>,
  ) {
    const { activo, ...resto } = b;
    const [e] = await this.db
      .update(estilistas)
      .set({ ...resto, ...(activo === undefined ? {} : { activo: activo ? 1 : 0 }) })
      .where(and(eq(estilistas.id, id), eq(estilistas.salonId, u.salonId)))
      .returning();
    if (!e) throw new NotFoundException('Estilista no encontrada');
    return { ...e, activo: e.activo === 1 };
  }

  private async estilistaDelSalon(u: Sesion, id: string) {
    const [e] = await this.db
      .select()
      .from(estilistas)
      .where(and(eq(estilistas.id, id), eq(estilistas.salonId, u.salonId)));
    if (!e) throw new NotFoundException('Estilista no encontrada');
    return e;
  }

  /** Reemplaza el horario semanal completo de una estilista. */
  @Put('estilistas/:id/horario')
  async guardarHorario(
    @UsuarioActual() u: Sesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(horarioBody)) b: z.infer<typeof horarioBody>,
  ) {
    await this.estilistaDelSalon(u, id);
    await this.db.transaction(async (tx) => {
      await tx.delete(horarios).where(eq(horarios.estilistaId, id));
      if (b.franjas.length) {
        await tx.insert(horarios).values(
          b.franjas.map((f) => ({
            salonId: u.salonId,
            estilistaId: id,
            diaSemana: f.diaSemana,
            abreMin: f.abre,
            cierraMin: f.cierra,
          })),
        );
      }
    });
    return {
      franjas: b.franjas.map((f) => ({
        diaSemana: f.diaSemana,
        abre: aHHmm(f.abre),
        cierra: aHHmm(f.cierra),
      })),
    };
  }

  // ---------- Excepciones (días libres, festivos, horario especial) ----------
  @Get('excepciones')
  async excepciones(
    @UsuarioActual() u: Sesion,
    @Query(new ZodPipe(desdeQuery)) q: z.infer<typeof desdeQuery>,
  ) {
    const filas = await this.db
      .select()
      .from(excepcionesHorario)
      .where(
        and(
          eq(excepcionesHorario.salonId, u.salonId),
          gte(excepcionesHorario.fecha, q.desde ?? hoy()),
        ),
      )
      .orderBy(asc(excepcionesHorario.fecha));
    return filas.map((e) => ({
      ...e,
      abre: e.abreMin === null ? null : aHHmm(e.abreMin),
      cierra: e.cierraMin === null ? null : aHHmm(e.cierraMin),
    }));
  }

  @Post('excepciones')
  async crearExcepcion(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(excepcionBody)) b: z.infer<typeof excepcionBody>,
  ) {
    if (b.estilistaId) await this.estilistaDelSalon(u, b.estilistaId);
    const [e] = await this.db
      .insert(excepcionesHorario)
      .values({
        salonId: u.salonId,
        estilistaId: b.estilistaId,
        fecha: b.fecha,
        cerrado: b.cerrado,
        abreMin: b.cerrado ? null : b.abre,
        cierraMin: b.cerrado ? null : b.cierra,
        motivo: b.motivo || null,
      })
      .returning();
    return e;
  }

  @Delete('excepciones/:id')
  @HttpCode(204)
  async borrarExcepcion(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.db
      .delete(excepcionesHorario)
      .where(and(eq(excepcionesHorario.id, id), eq(excepcionesHorario.salonId, u.salonId)))
      .returning();
    if (!r.length) throw new NotFoundException('Excepción no encontrada');
  }

  // ---------- Usuarios del equipo ----------
  @Get('usuarios')
  usuarios(@UsuarioActual() u: Sesion) {
    return this.db
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        email: usuarios.email,
        rol: usuarios.rol,
        estilistaId: usuarios.estilistaId,
        debeCambiarPassword: usuarios.debeCambiarPassword,
      })
      .from(usuarios)
      .where(eq(usuarios.salonId, u.salonId))
      .orderBy(asc(usuarios.nombre));
  }

  /** Invita a una estilista: crea su usuario con una contraseña temporal que se muestra una sola vez. */
  @Post('usuarios')
  async invitar(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(usuarioBody)) b: z.infer<typeof usuarioBody>,
  ) {
    await this.estilistaDelSalon(u, b.estilistaId);
    const temporal = passwordTemporal();
    try {
      const [nuevo] = await this.db
        .insert(usuarios)
        .values({
          salonId: u.salonId,
          nombre: b.nombre,
          email: b.email.toLowerCase(),
          rol: 'estilista',
          estilistaId: b.estilistaId,
          passwordHash: await hashPassword(temporal),
          debeCambiarPassword: true,
        })
        .returning();
      return {
        id: nuevo.id,
        nombre: nuevo.nombre,
        email: nuevo.email,
        rol: nuevo.rol,
        estilistaId: nuevo.estilistaId,
        debeCambiarPassword: true,
        passwordTemporal: temporal,
      };
    } catch (e) {
      if (esUnico(e)) throw new ConflictException('Ya existe un usuario con ese correo');
      throw e;
    }
  }

  /** Genera una contraseña temporal nueva (cierra las sesiones abiertas de ese usuario). */
  @Post('usuarios/:id/restablecer')
  @HttpCode(200)
  async restablecerUsuario(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    if (id === u.sub)
      throw new BadRequestException('Para tu propia cuenta usa "Cambiar contraseña"');
    const temporal = passwordTemporal();
    const [act] = await this.db
      .update(usuarios)
      .set({
        passwordHash: await hashPassword(temporal),
        debeCambiarPassword: true,
        passwordVersion: sql`${usuarios.passwordVersion} + 1`,
      })
      .where(and(eq(usuarios.id, id), eq(usuarios.salonId, u.salonId)))
      .returning();
    if (!act) throw new NotFoundException('Usuario no encontrado');
    return { id: act.id, passwordTemporal: temporal };
  }

  @Delete('usuarios/:id')
  @HttpCode(204)
  async borrarUsuario(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    if (id === u.sub) throw new BadRequestException('No puedes borrar tu propia cuenta');
    const r = await this.db
      .delete(usuarios)
      .where(and(eq(usuarios.id, id), eq(usuarios.salonId, u.salonId), ne(usuarios.rol, 'duena')))
      .returning();
    if (!r.length) throw new NotFoundException('Usuario no encontrado');
  }
}
