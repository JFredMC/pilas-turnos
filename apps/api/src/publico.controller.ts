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
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from './db/client';
import { citas, clientas, estilistas, listaEspera, pagos, salones, servicios } from './db/schema';
import { cuposLibres, dentroDeHorario } from './agenda';
import { aLocal, hhmm } from './tiempo';
import { ZodPipe, fechaSchema, nombreSchema, telefonoSchema, uuidSchema } from './zod.pipe';
import { CONFIG } from './tokens';
import type { AppConfig } from './config';
import { limites } from './limites';

const slugSchema = z.string().regex(/^[a-z0-9-]{3,60}$/, 'Enlace de salón inválido');
const consentimiento = z.literal(true, {
  error: 'Debes aceptar el tratamiento de datos (Ley 1581 de 2012)',
});

const dispSchema = z.object({
  servicioId: uuidSchema,
  estilistaId: uuidSchema,
  fecha: fechaSchema,
});
const reservaSchema = z.object({
  servicioId: uuidSchema,
  estilistaId: uuidSchema,
  inicio: z.iso.datetime({ offset: true }),
  nombre: nombreSchema,
  telefono: telefonoSchema,
  abonar: z.boolean().default(false),
  consentimiento,
});
const esperaSchema = z.object({
  nombre: nombreSchema,
  telefono: telefonoSchema,
  servicioId: uuidSchema.optional(),
  preferencia: z.string().trim().max(120).optional(),
  consentimiento,
});
const borrarSchema = z.object({
  telefono: telefonoSchema,
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/),
});

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nuevoCodigo = () => Array.from(randomBytes(6), (b) => ALFABETO[b % ALFABETO.length]).join('');

/** Endpoints sin cuenta para la clienta, desde el enlace del salón (/s/:slug). */
@Controller('publico/:slug')
export class PublicoController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private async salon(slug: string) {
    const s = slugSchema.safeParse(slug);
    if (!s.success) throw new NotFoundException('Salón no encontrado');
    const [salon] = await this.db.select().from(salones).where(eq(salones.slug, s.data));
    if (!salon) throw new NotFoundException('Salón no encontrado');
    return salon;
  }

  @Get()
  async info(@Param('slug') slug: string) {
    const s = await this.salon(slug);
    const [svc, est] = await Promise.all([
      this.db
        .select({
          id: servicios.id,
          nombre: servicios.nombre,
          minutos: servicios.minutos,
          precio: servicios.precio,
        })
        .from(servicios)
        .where(and(eq(servicios.salonId, s.id), eq(servicios.activo, 1)))
        .orderBy(servicios.nombre),
      this.db
        .select({ id: estilistas.id, nombre: estilistas.nombre })
        .from(estilistas)
        .where(and(eq(estilistas.salonId, s.id), eq(estilistas.activo, 1)))
        .orderBy(estilistas.nombre),
    ]);
    return {
      salon: {
        slug: s.slug,
        nombre: s.nombre,
        ciudad: s.ciudad,
        telefono: s.telefono,
        abonoCop: s.abonoActivo ? s.abonoCop : 0,
        whatsapp: s.whatsapp,
        nequiNumero: s.abonoActivo ? s.nequiNumero : null,
        /** Versión del QR (para la caché); null si no hay QR o no se pide abono. */
        qrVersion:
          s.abonoActivo && s.nequiQr && s.nequiQrActualizado
            ? s.nequiQrActualizado.getTime()
            : null,
      },
      servicios: svc,
      estilistas: est,
      avisoPrivacidad: { version: this.config.avisoPrivacidadVersion, ley: 'Ley 1581 de 2012' },
    };
  }

  private async servicioYEstilista(salonId: string, servicioId: string, estilistaId: string) {
    const [svc] = await this.db
      .select()
      .from(servicios)
      .where(
        and(eq(servicios.id, servicioId), eq(servicios.salonId, salonId), eq(servicios.activo, 1)),
      );
    const [est] = await this.db
      .select()
      .from(estilistas)
      .where(
        and(
          eq(estilistas.id, estilistaId),
          eq(estilistas.salonId, salonId),
          eq(estilistas.activo, 1),
        ),
      );
    if (!svc || !est)
      throw new NotFoundException('Servicio o estilista no encontrado en este salón');
    return { svc, est };
  }

  /** Imagen del QR de Nequi del salón (solo si pide abono). */
  @Get('qr')
  async qr(@Param('slug') slug: string, @Res() res: Response) {
    const s = await this.salon(slug);
    if (!s.abonoActivo || !s.nequiQr || !s.nequiQrTipo)
      throw new NotFoundException('Este salón no tiene QR de Nequi');
    res.setHeader('Content-Type', s.nequiQrTipo);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(s.nequiQr);
  }

  @Get('disponibilidad')
  async disponibilidad(
    @Param('slug') slug: string,
    @Query(new ZodPipe(dispSchema)) q: z.infer<typeof dispSchema>,
  ) {
    const s = await this.salon(slug);
    const { svc } = await this.servicioYEstilista(s.id, q.servicioId, q.estilistaId);
    const libres = await cuposLibres(this.db, s.id, q.estilistaId, q.fecha, svc.minutos);
    return {
      fecha: q.fecha,
      cupos: libres.map((d) => ({ inicio: d.toISOString(), hora: hhmm(aLocal(d).min) })),
    };
  }

  @Post('reservas')
  @Throttle({ default: { limit: () => limites.reservas, ttl: 60_000 } })
  async reservar(
    @Param('slug') slug: string,
    @Body(new ZodPipe(reservaSchema)) b: z.infer<typeof reservaSchema>,
  ) {
    const s = await this.salon(slug);
    const { svc } = await this.servicioYEstilista(s.id, b.servicioId, b.estilistaId);
    const inicio = new Date(b.inicio);
    if (inicio <= new Date()) throw new BadRequestException('Ese horario ya pasó');
    const fin = new Date(inicio.getTime() + svc.minutos * 60_000);
    const { fecha, min } = aLocal(inicio);
    if (!(await dentroDeHorario(this.db, s.id, b.estilistaId, fecha, min, svc.minutos))) {
      throw new BadRequestException('La estilista no atiende en ese horario');
    }
    try {
      return await this.db.transaction(async (tx) => {
        const ahora = new Date();
        const [cl] = await tx
          .insert(clientas)
          .values({
            salonId: s.id,
            nombre: b.nombre,
            telefono: b.telefono,
            consentimientoEn: ahora,
            consentimientoVersion: this.config.avisoPrivacidadVersion,
          })
          .onConflictDoUpdate({
            target: [clientas.salonId, clientas.telefono],
            set: {
              nombre: b.nombre,
              consentimientoEn: ahora,
              consentimientoVersion: this.config.avisoPrivacidadVersion,
            },
          })
          .returning();
        // La restricción de exclusión "citas_sin_choques" rechaza cualquier cruce (código 23P01).
        const [cita] = await tx
          .insert(citas)
          .values({
            salonId: s.id,
            estilistaId: b.estilistaId,
            servicioId: svc.id,
            clientaId: cl.id,
            inicio,
            fin,
            precio: svc.precio,
            codigo: nuevoCodigo(),
          })
          .returning();
        let abono = null;
        if (b.abonar && s.abonoActivo && s.abonoCop > 0) {
          const [p] = await tx
            .insert(pagos)
            .values({
              salonId: s.id,
              citaId: cita.id,
              tipo: 'abono',
              medio: 'nequi',
              monto: s.abonoCop,
            })
            .returning();
          abono = { id: p.id, monto: p.monto, estado: p.estado, medio: p.medio };
        }
        return {
          cita: {
            id: cita.id,
            codigo: cita.codigo,
            inicio: cita.inicio,
            fin: cita.fin,
            estado: cita.estado,
            hora: hhmm(min),
            fecha,
          },
          servicio: { nombre: svc.nombre, precio: svc.precio },
          abono,
        };
      });
    } catch (e) {
      if (esChoque(e)) throw new ConflictException('Ese horario se acaba de ocupar. Escoge otro.');
      throw e;
    }
  }

  @Post('espera')
  @HttpCode(201)
  @Throttle({ default: { limit: () => limites.reservas, ttl: 60_000 } })
  async espera(
    @Param('slug') slug: string,
    @Body(new ZodPipe(esperaSchema)) b: z.infer<typeof esperaSchema>,
  ) {
    const s = await this.salon(slug);
    if (b.servicioId) {
      const [svc] = await this.db
        .select()
        .from(servicios)
        .where(and(eq(servicios.id, b.servicioId), eq(servicios.salonId, s.id)));
      if (!svc) throw new NotFoundException('Servicio no encontrado');
    }
    const ahora = new Date();
    const [cl] = await this.db
      .insert(clientas)
      .values({
        salonId: s.id,
        nombre: b.nombre,
        telefono: b.telefono,
        consentimientoEn: ahora,
        consentimientoVersion: this.config.avisoPrivacidadVersion,
      })
      .onConflictDoUpdate({
        target: [clientas.salonId, clientas.telefono],
        set: {
          nombre: b.nombre,
          consentimientoEn: ahora,
          consentimientoVersion: this.config.avisoPrivacidadVersion,
        },
      })
      .returning();
    const [e] = await this.db
      .insert(listaEspera)
      .values({
        salonId: s.id,
        clientaId: cl.id,
        servicioId: b.servicioId,
        preferencia: b.preferencia || 'Cualquier hora',
      })
      .returning();
    return { id: e.id };
  }

  /** Ley 1581: la clienta borra sus datos con su celular y el código de cualquiera de sus citas. */
  @Delete('mis-datos')
  @HttpCode(204)
  @Throttle({ default: { limit: () => limites.login, ttl: 60_000 } })
  async borrarMisDatos(
    @Param('slug') slug: string,
    @Body(new ZodPipe(borrarSchema)) b: z.infer<typeof borrarSchema>,
  ) {
    const s = await this.salon(slug);
    const [fila] = await this.db
      .select({ clientaId: clientas.id })
      .from(citas)
      .innerJoin(clientas, eq(clientas.id, citas.clientaId))
      .where(
        and(eq(citas.salonId, s.id), eq(citas.codigo, b.codigo), eq(clientas.telefono, b.telefono)),
      );
    if (!fila) throw new NotFoundException('No encontramos datos con ese celular y código');
    await this.db.delete(clientas).where(eq(clientas.id, fila.clientaId));
  }
}

export function esChoque(e: unknown): boolean {
  for (let x = e as { code?: string; cause?: unknown } | undefined; x; x = x.cause as typeof x)
    if (x.code === '23P01') return true;
  return false;
}
