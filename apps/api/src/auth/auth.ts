import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../db/client';
import { recuperaciones, usuarios } from '../db/schema';
import { ZodPipe } from '../zod.pipe';
import { CONFIG } from '../tokens';
import { limites } from '../limites';
import type { AppConfig } from '../config';
import { CorreoService } from '../correo';

export type Rol = 'duena' | 'estilista';
export interface Sesion {
  sub: string;
  salonId: string;
  rol: Rol;
  estilistaId: string | null;
  /** Versión de contraseña: si cambia, el token deja de servir. */
  pv: number;
}

export const hashPassword = (p: string) => hash(p);
export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200);
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Contraseña temporal legible (sin 0/O, 1/l/I), 12 caracteres. */
export const passwordTemporal = () =>
  Array.from(randomBytes(12), (b) => ALFABETO[b % ALFABETO.length]).join('');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Hash ficticio para que el tiempo de respuesta no revele si el correo existe.
let hashFicticio: Promise<string> | null = null;

export const ROLES = 'roles';
export const Roles = (...r: Rol[]) => SetMetadata(ROLES, r);
/** Rutas que se pueden usar con una contraseña temporal pendiente de cambio. */
export const PERMITIR_CAMBIO = 'permitir-cambio';
export const PermitirCambioPendiente = () => SetMetadata(PERMITIR_CAMBIO, true);
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Sesion => ctx.switchToHttp().getRequest().usuario,
);

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const m = /^Bearer (.+)$/.exec(req.headers['authorization'] ?? '');
    if (!m) throw new UnauthorizedException('Falta el token');
    let s: Sesion;
    try {
      s = await this.jwt.verifyAsync<Sesion>(m[1]);
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
    const [u] = await this.db
      .select({
        pv: usuarios.passwordVersion,
        cambio: usuarios.debeCambiarPassword,
        rol: usuarios.rol,
        salonId: usuarios.salonId,
        estilistaId: usuarios.estilistaId,
      })
      .from(usuarios)
      .where(eq(usuarios.id, s.sub));
    if (!u || u.pv !== s.pv || u.salonId !== s.salonId)
      throw new UnauthorizedException('Tu sesión ya no es válida. Ingresa de nuevo.');
    // Rol y estilista salen de la base: si la dueña cambia algo, aplica de inmediato.
    req.usuario = { ...s, rol: u.rol, estilistaId: u.estilistaId };
    const meta = <T>(k: string) =>
      this.reflector.getAllAndOverride<T | undefined>(k, [ctx.getHandler(), ctx.getClass()]);
    if (u.cambio && !meta<boolean>(PERMITIR_CAMBIO)) {
      throw new ForbiddenException({
        message: 'Debes cambiar tu contraseña temporal',
        codigo: 'CAMBIO_PASSWORD',
      });
    }
    const roles = meta<Rol[]>(ROLES);
    if (roles && !roles.includes(u.rol))
      throw new ForbiddenException('No tienes permiso para esto');
    return true;
  }
}

const loginSchema = z.object({ email: z.email().max(120), password: z.string().min(1).max(200) });
const cambioSchema = z.object({ actual: z.string().min(1).max(200), nueva: passwordSchema });
const recuperarSchema = z.object({ email: z.email().max(120) });
const restablecerSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/, 'Enlace inválido'),
  nueva: passwordSchema,
});
const VIGENCIA_MS = 60 * 60_000;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly correo: CorreoService,
  ) {}

  private async emitir(u: typeof usuarios.$inferSelect) {
    const sesion: Sesion = {
      sub: u.id,
      salonId: u.salonId,
      rol: u.rol,
      estilistaId: u.estilistaId,
      pv: u.passwordVersion,
    };
    return {
      token: await this.jwt.signAsync(sesion),
      usuario: {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        salonId: u.salonId,
        estilistaId: u.estilistaId,
        debeCambiarPassword: u.debeCambiarPassword,
      },
    };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: () => limites.login, ttl: 60_000 } })
  async login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>) {
    const [u] = await this.db
      .select()
      .from(usuarios)
      .where(eq(sql`lower(${usuarios.email})`, body.email.toLowerCase()));
    hashFicticio ??= hash('contraseña-ficticia');
    const ok = await verify(u?.passwordHash ?? (await hashFicticio), body.password);
    if (!u || !ok) throw new UnauthorizedException('Correo o contraseña incorrectos');
    return this.emitir(u);
  }

  @Get('yo')
  @UseGuards(JwtGuard)
  @PermitirCambioPendiente()
  yo(@UsuarioActual() s: Sesion) {
    return s;
  }

  /** Cambio de contraseña (obligatorio tras una contraseña temporal). Devuelve un token nuevo. */
  @Post('cambiar-password')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @PermitirCambioPendiente()
  @Throttle({ default: { limit: () => limites.login, ttl: 60_000 } })
  async cambiar(
    @UsuarioActual() s: Sesion,
    @Body(new ZodPipe(cambioSchema)) b: z.infer<typeof cambioSchema>,
  ) {
    const [u] = await this.db.select().from(usuarios).where(eq(usuarios.id, s.sub));
    if (!u || !(await verify(u.passwordHash, b.actual)))
      throw new UnauthorizedException('La contraseña actual no coincide');
    if (b.actual === b.nueva)
      throw new BadRequestException('La contraseña nueva debe ser distinta');
    const [act] = await this.db
      .update(usuarios)
      .set({
        passwordHash: await hash(b.nueva),
        debeCambiarPassword: false,
        passwordVersion: sql`${usuarios.passwordVersion} + 1`,
      })
      .where(eq(usuarios.id, u.id))
      .returning();
    return this.emitir(act);
  }

  /** Pide un enlace de recuperación. Responde igual exista o no el correo. */
  @Post('recuperar')
  @HttpCode(202)
  @Throttle({ default: { limit: () => Math.min(3, limites.login), ttl: 60_000 } })
  async recuperar(@Body(new ZodPipe(recuperarSchema)) b: z.infer<typeof recuperarSchema>) {
    const respuesta = {
      mensaje:
        'Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva.',
    };
    const [u] = await this.db
      .select()
      .from(usuarios)
      .where(eq(sql`lower(${usuarios.email})`, b.email.toLowerCase()));
    if (!u) return respuesta;
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async (tx) => {
      // Solo sirve el último enlace.
      await tx
        .update(recuperaciones)
        .set({ usadoEn: new Date() })
        .where(and(eq(recuperaciones.usuarioId, u.id), isNull(recuperaciones.usadoEn)));
      await tx.insert(recuperaciones).values({
        usuarioId: u.id,
        tokenHash: sha256(token),
        expiraEn: new Date(Date.now() + VIGENCIA_MS),
      });
    });
    const enlace = `${this.config.appUrl}/salon/restablecer?token=${token}`;
    await this.correo
      .enviar({
        para: u.email,
        asunto: 'Pilas · Crea una contraseña nueva',
        texto: `Hola ${u.nombre},\n\nPara crear una contraseña nueva entra a este enlace (vale 1 hora y un solo uso):\n${enlace}\n\nSi no lo pediste, ignora este correo.`,
        html: `<p>Hola ${escaparHtml(u.nombre)},</p><p>Para crear una contraseña nueva entra a este enlace (vale 1 hora y un solo uso):</p><p><a href="${enlace}">Crear contraseña nueva</a></p><p>Si no lo pediste, ignora este correo.</p>`,
      })
      .catch((e) =>
        console.error('No se pudo enviar el correo de recuperación', (e as Error).message),
      );
    return respuesta;
  }

  @Post('restablecer')
  @HttpCode(204)
  @Throttle({ default: { limit: () => limites.login, ttl: 60_000 } })
  async restablecer(@Body(new ZodPipe(restablecerSchema)) b: z.infer<typeof restablecerSchema>) {
    const ahora = new Date();
    const ok = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .update(recuperaciones)
        .set({ usadoEn: ahora })
        .where(
          and(
            eq(recuperaciones.tokenHash, sha256(b.token)),
            isNull(recuperaciones.usadoEn),
            gt(recuperaciones.expiraEn, ahora),
          ),
        )
        .returning();
      if (!r) return false;
      await tx
        .update(usuarios)
        .set({
          passwordHash: await hash(b.nueva),
          debeCambiarPassword: false,
          passwordVersion: sql`${usuarios.passwordVersion} + 1`,
        })
        .where(eq(usuarios.id, r.usuarioId));
      return true;
    });
    if (!ok) throw new BadRequestException('El enlace ya se usó o venció. Pide uno nuevo.');
  }
}

export const escaparHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
