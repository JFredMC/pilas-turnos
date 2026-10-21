import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from './db/client';
import {
  cierresCaja,
  citas,
  clientas,
  estilistas,
  listaEspera,
  pagos,
  salones,
  servicios,
} from './db/schema';
import { JwtGuard, Roles, UsuarioActual, type Sesion } from './auth/auth';
import { calcularCuadre } from './cuadre';
import { aLocal, finDia, hhmm, hoy, inicioDia } from './tiempo';
import { ZodPipe, fechaSchema, nombreSchema, telefonoSchema, uuidSchema } from './zod.pipe';
import { CONFIG } from './tokens';
import type { AppConfig } from './config';

const fechaQuery = z.object({ fecha: fechaSchema.optional() });
const citaPatch = z.object({
  estado: z.enum(['pendiente', 'confirmada', 'atendida', 'no_llego', 'cancelada']),
  medio: z.enum(['efectivo', 'nequi']).optional(),
  propina: z.number().int().min(0).max(1_000_000).optional(),
});
const esperaBody = z.object({
  nombre: nombreSchema,
  telefono: telefonoSchema,
  servicioId: uuidSchema.optional(),
  preferencia: z.string().trim().max(120).optional(),
  /** La dueña confirma que la clienta autorizó el tratamiento de datos. */
  consentimiento: z.literal(true, {
    error: 'Se necesita la autorización de la clienta (Ley 1581)',
  }),
});

/** Panel del salón. Todo se filtra por el salonId del token: un salón nunca ve datos de otro. */
@Controller('salon')
@UseGuards(JwtGuard)
export class SalonController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async info(@UsuarioActual() u: Sesion) {
    const [s] = await this.db.select().from(salones).where(eq(salones.id, u.salonId));
    const [svc, est] = await Promise.all([
      this.db
        .select()
        .from(servicios)
        .where(eq(servicios.salonId, u.salonId))
        .orderBy(servicios.nombre),
      this.db
        .select()
        .from(estilistas)
        .where(eq(estilistas.salonId, u.salonId))
        .orderBy(estilistas.nombre),
    ]);
    return { salon: s, servicios: svc, estilistas: est, rol: u.rol };
  }

  @Get('agenda')
  async agenda(
    @UsuarioActual() u: Sesion,
    @Query(new ZodPipe(fechaQuery)) q: z.infer<typeof fechaQuery>,
  ) {
    const fecha = q.fecha ?? hoy();
    const filtros = [
      eq(citas.salonId, u.salonId),
      gte(citas.inicio, inicioDia(fecha)),
      lt(citas.inicio, finDia(fecha)),
    ];
    if (u.rol === 'estilista')
      filtros.push(eq(citas.estilistaId, u.estilistaId ?? '00000000-0000-0000-0000-000000000000'));
    const filas = await this.db
      .select({
        id: citas.id,
        inicio: citas.inicio,
        fin: citas.fin,
        estado: citas.estado,
        precio: citas.precio,
        codigo: citas.codigo,
        estilistaId: citas.estilistaId,
        servicioId: citas.servicioId,
        servicio: servicios.nombre,
        clientaId: citas.clientaId,
        clienta: clientas.nombre,
        telefono: clientas.telefono,
        abono: sql<number>`coalesce((select sum(${pagos.monto}) from ${pagos} where ${pagos.citaId} = ${citas.id} and ${pagos.tipo} = 'abono' and ${pagos.estado} = 'confirmado'), 0)::int`,
        abonoPendienteId: sql<
          string | null
        >`(select ${pagos.id} from ${pagos} where ${pagos.citaId} = ${citas.id} and ${pagos.tipo} = 'abono' and ${pagos.estado} = 'pendiente' limit 1)`,
      })
      .from(citas)
      .innerJoin(servicios, eq(servicios.id, citas.servicioId))
      .leftJoin(clientas, eq(clientas.id, citas.clientaId))
      .where(and(...filtros))
      .orderBy(citas.inicio);
    return {
      fecha,
      citas: filas.map((c) => ({
        ...c,
        hora: hhmm(aLocal(c.inicio).min),
        clienta: c.clienta ?? 'Clienta (datos borrados)',
      })),
    };
  }

  private async citaDelSalon(u: Sesion, id: string) {
    const [c] = await this.db
      .select()
      .from(citas)
      .where(and(eq(citas.id, id), eq(citas.salonId, u.salonId)));
    if (!c) throw new NotFoundException('Cita no encontrada');
    if (u.rol === 'estilista' && c.estilistaId !== u.estilistaId)
      throw new ForbiddenException('Esa cita no es tuya');
    return c;
  }

  @Patch('citas/:id')
  async actualizarCita(
    @UsuarioActual() u: Sesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(citaPatch)) b: z.infer<typeof citaPatch>,
  ) {
    const c = await this.citaDelSalon(u, id);
    return this.db.transaction(async (tx) => {
      const [act] = await tx
        .update(citas)
        .set({ estado: b.estado })
        .where(eq(citas.id, c.id))
        .returning();
      // Se rehacen saldo y propina para que marcar dos veces no duplique dinero en el cuadre.
      await tx
        .delete(pagos)
        .where(and(eq(pagos.citaId, c.id), inArray(pagos.tipo, ['saldo', 'propina'])));
      if (b.estado === 'atendida') {
        const medio = b.medio ?? 'efectivo';
        const [{ abonado }] = await tx
          .select({ abonado: sql<number>`coalesce(sum(${pagos.monto}), 0)::int` })
          .from(pagos)
          .where(
            and(eq(pagos.citaId, c.id), eq(pagos.tipo, 'abono'), eq(pagos.estado, 'confirmado')),
          );
        const saldo = Math.max(0, c.precio - abonado);
        if (saldo > 0)
          await tx
            .insert(pagos)
            .values({
              salonId: u.salonId,
              citaId: c.id,
              tipo: 'saldo',
              medio,
              monto: saldo,
              estado: 'confirmado',
            });
        if (b.propina)
          await tx
            .insert(pagos)
            .values({
              salonId: u.salonId,
              citaId: c.id,
              tipo: 'propina',
              medio,
              monto: b.propina,
              estado: 'confirmado',
            });
      }
      return act;
    });
  }

  /** La dueña confirma que el abono por Nequi sí llegó: la cita pasa a confirmada. */
  @Post('pagos/:id/confirmar')
  @Roles('duena')
  @HttpCode(200)
  async confirmarPago(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    const [p] = await this.db
      .update(pagos)
      .set({ estado: 'confirmado' })
      .where(and(eq(pagos.id, id), eq(pagos.salonId, u.salonId)))
      .returning();
    if (!p) throw new NotFoundException('Pago no encontrado');
    if (p.tipo === 'abono') {
      await this.db
        .update(citas)
        .set({ estado: 'confirmada' })
        .where(and(eq(citas.id, p.citaId), eq(citas.estado, 'pendiente')));
    }
    return p;
  }

  @Get('espera')
  async espera(@UsuarioActual() u: Sesion) {
    return this.db
      .select({
        id: listaEspera.id,
        preferencia: listaEspera.preferencia,
        creadoEn: listaEspera.creadoEn,
        clientaId: clientas.id,
        clienta: clientas.nombre,
        telefono: clientas.telefono,
        servicioId: listaEspera.servicioId,
        servicio: servicios.nombre,
      })
      .from(listaEspera)
      .innerJoin(clientas, eq(clientas.id, listaEspera.clientaId))
      .leftJoin(servicios, eq(servicios.id, listaEspera.servicioId))
      .where(eq(listaEspera.salonId, u.salonId))
      .orderBy(listaEspera.creadoEn);
  }

  @Post('espera')
  async agregarEspera(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(esperaBody)) b: z.infer<typeof esperaBody>,
  ) {
    if (b.servicioId) {
      const [svc] = await this.db
        .select()
        .from(servicios)
        .where(and(eq(servicios.id, b.servicioId), eq(servicios.salonId, u.salonId)));
      if (!svc) throw new NotFoundException('Servicio no encontrado');
    }
    const ahora = new Date();
    const [cl] = await this.db
      .insert(clientas)
      .values({
        salonId: u.salonId,
        nombre: b.nombre,
        telefono: b.telefono,
        consentimientoEn: ahora,
        consentimientoVersion: this.config.avisoPrivacidadVersion,
      })
      .onConflictDoUpdate({
        target: [clientas.salonId, clientas.telefono],
        set: { nombre: b.nombre },
      })
      .returning();
    const [e] = await this.db
      .insert(listaEspera)
      .values({
        salonId: u.salonId,
        clientaId: cl.id,
        servicioId: b.servicioId,
        preferencia: b.preferencia || 'Cualquier hora',
      })
      .returning();
    return e;
  }

  @Delete('espera/:id')
  @HttpCode(204)
  async quitarEspera(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.db
      .delete(listaEspera)
      .where(and(eq(listaEspera.id, id), eq(listaEspera.salonId, u.salonId)))
      .returning();
    if (!r.length) throw new NotFoundException('No está en la lista');
  }

  @Get('caja')
  async caja(
    @UsuarioActual() u: Sesion,
    @Query(new ZodPipe(fechaQuery)) q: z.infer<typeof fechaQuery>,
  ) {
    const fecha = q.fecha ?? hoy();
    const filas = await this.cuadre(u.salonId, fecha);
    const visibles =
      u.rol === 'estilista' ? filas.filter((f) => f.estilistaId === u.estilistaId) : filas;
    const cierres = await this.db
      .select()
      .from(cierresCaja)
      .where(and(eq(cierresCaja.salonId, u.salonId), eq(cierresCaja.fecha, fecha)));
    return { fecha, estilistas: visibles, cerrado: cierres.length > 0 };
  }

  @Post('caja/cierre')
  @Roles('duena')
  async cerrarCaja(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(fechaQuery)) b: z.infer<typeof fechaQuery>,
  ) {
    const fecha = b.fecha ?? hoy();
    const filas = await this.cuadre(u.salonId, fecha);
    for (const f of filas) {
      const valores = {
        servicios: f.servicios,
        ventas: f.ventas,
        comision: f.comision,
        propinas: f.propinas,
        efectivo: f.efectivo,
        nequi: f.nequi,
        cerradoPor: u.sub,
      };
      await this.db
        .insert(cierresCaja)
        .values({ salonId: u.salonId, estilistaId: f.estilistaId, fecha, ...valores })
        .onConflictDoUpdate({
          target: [cierresCaja.salonId, cierresCaja.estilistaId, cierresCaja.fecha],
          set: valores,
        });
    }
    return { fecha, estilistas: filas, cerrado: true };
  }

  private async cuadre(salonId: string, fecha: string) {
    const rango = and(
      eq(citas.salonId, salonId),
      gte(citas.inicio, inicioDia(fecha)),
      lt(citas.inicio, finDia(fecha)),
    );
    const [est, cs, ps] = await Promise.all([
      this.db
        .select({
          id: estilistas.id,
          nombre: estilistas.nombre,
          comisionPct: estilistas.comisionPct,
        })
        .from(estilistas)
        .where(eq(estilistas.salonId, salonId))
        .orderBy(estilistas.nombre),
      this.db
        .select({ estilistaId: citas.estilistaId, precio: citas.precio })
        .from(citas)
        .where(and(rango, eq(citas.estado, 'atendida'))),
      this.db
        .select({
          estilistaId: citas.estilistaId,
          tipo: pagos.tipo,
          medio: pagos.medio,
          monto: pagos.monto,
        })
        .from(pagos)
        .innerJoin(citas, eq(citas.id, pagos.citaId))
        .where(and(rango, eq(citas.estado, 'atendida'), eq(pagos.estado, 'confirmado'))),
    ]);
    return calcularCuadre(est, cs, ps);
  }

  /** Ley 1581: consulta de los datos guardados de una clienta. */
  @Get('clientas/:id')
  @Roles('duena')
  async datosClienta(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    const [cl] = await this.db
      .select()
      .from(clientas)
      .where(and(eq(clientas.id, id), eq(clientas.salonId, u.salonId)));
    if (!cl) throw new NotFoundException('Clienta no encontrada');
    const suyas = await this.db
      .select({ inicio: citas.inicio, estado: citas.estado, servicioId: citas.servicioId })
      .from(citas)
      .where(eq(citas.clientaId, id));
    return { clienta: cl, citas: suyas };
  }

  /** Ley 1581: borra los datos personales; las citas quedan anónimas para no descuadrar la caja. */
  @Delete('clientas/:id')
  @Roles('duena')
  @HttpCode(204)
  async borrarClienta(@UsuarioActual() u: Sesion, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.db
      .delete(clientas)
      .where(and(eq(clientas.id, id), eq(clientas.salonId, u.salonId)))
      .returning();
    if (!r.length) throw new NotFoundException('Clienta no encontrada');
  }
}
