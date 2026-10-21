import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Post,
  Headers,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { and, eq, gt, inArray, lte, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { DB, type Db } from './db/client';
import { citas, clientas, estilistas, recordatorios, salones, servicios } from './db/schema';
import { JwtGuard, UsuarioActual, type Sesion } from './auth/auth';
import { CONFIG } from './tokens';
import type { AppConfig } from './config';
import { aLocal, hhmm } from './tiempo';
import { ZodPipe, uuidSchema } from './zod.pipe';

export type TipoRecordatorio = '24h' | '2h';
const HORA = 3_600_000;

export interface RecordatorioPendiente {
  citaId: string;
  salonId: string;
  tipo: TipoRecordatorio;
  inicio: Date;
  clienta: string;
  telefono: string;
  salon: string;
  servicio: string;
  estilista: string;
  codigo: string;
}

/** Texto del recordatorio (también se usa en el enlace wa.me del panel). */
export function textoRecordatorio(r: RecordatorioPendiente): string {
  const cuando = r.tipo === '24h' ? 'mañana' : 'hoy';
  return (
    `¡Hola ${r.clienta}! Te recordamos tu turno en ${r.salon} ${cuando} a las ${hhmm(aLocal(r.inicio).min)}: ` +
    `${r.servicio} con ${r.estilista}. Código ${r.codigo}. Si no puedes venir, avísanos por aquí.`
  );
}
export const enlaceWa = (telefono: string, texto: string) =>
  `https://wa.me/57${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;

/**
 * Busca los recordatorios que tocan ahora:
 * - 24h: la cita empieza en las próximas 24 h (pero falta más de 2 h) y se reservó con más de 24 h de anticipación.
 * - 2h: la cita empieza en las próximas 2 h y se reservó con más de 2 h de anticipación.
 * Excluye los ya enviados o marcados a mano; los fallidos se reintentan.
 */
export async function recordatoriosPendientes(
  db: Db,
  ahora = new Date(),
  salonId?: string,
): Promise<RecordatorioPendiente[]> {
  const r = alias(recordatorios, 'r');
  const consulta = (tipo: TipoRecordatorio, horas: number, piso: number) =>
    db
      .select({
        citaId: citas.id,
        salonId: citas.salonId,
        inicio: citas.inicio,
        codigo: citas.codigo,
        clienta: clientas.nombre,
        telefono: clientas.telefono,
        salon: salones.nombre,
        servicio: servicios.nombre,
        estilista: estilistas.nombre,
      })
      .from(citas)
      .innerJoin(clientas, eq(clientas.id, citas.clientaId))
      .innerJoin(salones, eq(salones.id, citas.salonId))
      .innerJoin(servicios, eq(servicios.id, citas.servicioId))
      .innerJoin(estilistas, eq(estilistas.id, citas.estilistaId))
      .where(
        and(
          inArray(citas.estado, ['pendiente', 'confirmada']),
          gt(citas.inicio, new Date(ahora.getTime() + piso * HORA)),
          lte(citas.inicio, new Date(ahora.getTime() + horas * HORA)),
          lte(citas.creadoEn, sql`${citas.inicio} - make_interval(hours => ${horas})`),
          salonId ? eq(citas.salonId, salonId) : undefined,
          notExists(
            db
              .select({ x: sql`1` })
              .from(r)
              .where(
                and(
                  eq(r.citaId, citas.id),
                  eq(r.tipo, tipo),
                  inArray(r.estado, ['enviado', 'manual']),
                ),
              ),
          ),
        ),
      )
      .then((filas) => filas.map((f) => ({ ...f, tipo })));
  const [a, b] = await Promise.all([consulta('24h', 24, 2), consulta('2h', 2, 0)]);
  return [...a, ...b].sort((x, y) => x.inicio.getTime() - y.inicio.getTime());
}

/** Envío por WhatsApp Cloud API con plantilla aprobada (Meta exige plantilla para mensajes iniciados por el negocio). */
@Injectable()
export class WhatsappService {
  private readonly log = new Logger('WhatsApp');
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  get activo() {
    return !!this.config.whatsapp;
  }

  async enviar(r: RecordatorioPendiente): Promise<string> {
    const w = this.config.whatsapp;
    if (!w) throw new Error('WhatsApp no configurado');
    const res = await fetch(
      `https://graph.facebook.com/${w.apiVersion}/${w.phoneNumberId}/messages`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: `57${r.telefono}`,
          type: 'template',
          template: {
            name: w.plantilla,
            language: { code: w.idioma },
            components: [
              {
                type: 'body',
                parameters: [
                  r.clienta,
                  r.salon,
                  r.tipo === '24h' ? 'mañana' : 'hoy',
                  hhmm(aLocal(r.inicio).min),
                  `${r.servicio} con ${r.estilista}`,
                ].map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }),
      },
    );
    const datos = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(datos.error?.message ?? `HTTP ${res.status}`);
    return datos.messages?.[0]?.id ?? 'enviado';
  }
}

@Injectable()
export class RecordatoriosService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Recordatorios');
  private timer: NodeJS.Timeout | null = null;
  private corriendo = false;
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly wa: WhatsappService,
  ) {}

  onApplicationBootstrap() {
    // Planificador interno mientras la API está despierta; el cron de GitHub Actions la despierta en Render Free.
    if (this.config.recordatoriosCadaMin > 0 && this.wa.activo && !process.env['VITEST']) {
      this.timer = setInterval(
        () => void this.procesar().catch((e) => this.log.error(e)),
        this.config.recordatoriosCadaMin * 60_000,
      );
    }
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Envía los recordatorios que tocan. Sin credenciales de Meta no envía nada (quedan para el enlace del panel). */
  async procesar(ahora = new Date()) {
    const pendientes = await recordatoriosPendientes(this.db, ahora);
    if (!this.wa.activo)
      return { pendientes: pendientes.length, enviados: 0, fallidos: 0, whatsapp: false };
    if (this.corriendo)
      return { pendientes: pendientes.length, enviados: 0, fallidos: 0, whatsapp: true };
    this.corriendo = true;
    let enviados = 0,
      fallidos = 0;
    try {
      for (const p of pendientes) {
        let estado: 'enviado' | 'fallido' = 'enviado';
        let detalle: string;
        try {
          detalle = await this.wa.enviar(p);
          enviados++;
        } catch (e) {
          estado = 'fallido';
          detalle = (e as Error).message.slice(0, 300);
          fallidos++;
        }
        await this.db
          .insert(recordatorios)
          .values({ salonId: p.salonId, citaId: p.citaId, tipo: p.tipo, estado, detalle })
          .onConflictDoUpdate({
            target: [recordatorios.citaId, recordatorios.tipo],
            set: { estado, detalle },
          });
      }
    } finally {
      this.corriendo = false;
    }
    if (pendientes.length)
      this.log.log(`Recordatorios: ${enviados} enviados, ${fallidos} fallidos`);
    return { pendientes: pendientes.length, enviados, fallidos, whatsapp: true };
  }
}

/** Endpoint para el cron (GitHub Actions): despierta la API y procesa. Requiere CRON_TOKEN. */
@Controller('interno')
@SkipThrottle()
export class InternoController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly rec: RecordatoriosService,
  ) {}
  @Post('recordatorios')
  @HttpCode(200)
  procesar(@Headers('authorization') auth?: string) {
    const t = this.config.cronToken;
    if (!t) throw new NotFoundException();
    const dado = Buffer.from((auth ?? '').replace(/^Bearer /, ''));
    const esperado = Buffer.from(t);
    if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado))
      throw new UnauthorizedException();
    return this.rec.procesar();
  }
}

const manualSchema = z.object({ citaId: uuidSchema, tipo: z.enum(['24h', '2h']) });

/** Panel: recordatorios que tocan, con enlace wa.me prellenado, y marcarlos como enviados a mano. */
@Controller('salon/recordatorios')
@UseGuards(JwtGuard)
export class RecordatoriosController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly wa: WhatsappService,
  ) {}

  @Get()
  async listar(@UsuarioActual() u: Sesion) {
    let lista = await recordatoriosPendientes(this.db, new Date(), u.salonId);
    if (u.rol === 'estilista') {
      const mias = await this.db
        .select({ id: citas.id })
        .from(citas)
        .where(eq(citas.estilistaId, u.estilistaId ?? ''));
      const ids = new Set(mias.map((m) => m.id));
      lista = lista.filter((r) => ids.has(r.citaId));
    }
    return {
      whatsappAutomatico: this.wa.activo,
      pendientes: lista.map((r) => ({
        citaId: r.citaId,
        tipo: r.tipo,
        inicio: r.inicio,
        hora: hhmm(aLocal(r.inicio).min),
        clienta: r.clienta,
        enlace: enlaceWa(r.telefono, textoRecordatorio(r)),
      })),
    };
  }

  @Post('manual')
  @HttpCode(204)
  async manual(
    @UsuarioActual() u: Sesion,
    @Body(new ZodPipe(manualSchema)) b: z.infer<typeof manualSchema>,
  ) {
    const [c] = await this.db
      .select()
      .from(citas)
      .where(and(eq(citas.id, b.citaId), eq(citas.salonId, u.salonId)));
    if (!c || (u.rol === 'estilista' && c.estilistaId !== u.estilistaId))
      throw new NotFoundException('Cita no encontrada');
    await this.db
      .insert(recordatorios)
      .values({ salonId: u.salonId, citaId: c.id, tipo: b.tipo, estado: 'manual' })
      .onConflictDoUpdate({
        target: [recordatorios.citaId, recordatorios.tipo],
        set: { estado: 'manual' },
      });
  }
}
