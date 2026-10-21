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
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { hash, verify } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../db/client';
import { usuarios } from '../db/schema';
import { ZodPipe } from '../zod.pipe';
import { CONFIG } from '../tokens';
import { limites } from '../limites';
import type { AppConfig } from '../config';

export type Rol = 'duena' | 'estilista';
export interface Sesion {
  sub: string;
  salonId: string;
  rol: Rol;
  estilistaId: string | null;
}

export const hashPassword = (p: string) => hash(p);
// Hash ficticio para que el tiempo de respuesta no revele si el correo existe.
let hashFicticio: Promise<string> | null = null;

export const ROLES = 'roles';
export const Roles = (...r: Rol[]) => SetMetadata(ROLES, r);
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Sesion => ctx.switchToHttp().getRequest().usuario,
);

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const m = /^Bearer (.+)$/.exec(req.headers['authorization'] ?? '');
    if (!m) throw new UnauthorizedException('Falta el token');
    try {
      req.usuario = await this.jwt.verifyAsync<Sesion>(m[1]);
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(req.usuario.rol))
      throw new ForbiddenException('No tienes permiso para esto');
    return true;
  }
}

const loginSchema = z.object({ email: z.email().max(120), password: z.string().min(1).max(200) });

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

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
    const sesion: Sesion = {
      sub: u.id,
      salonId: u.salonId,
      rol: u.rol,
      estilistaId: u.estilistaId,
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
      },
    };
  }

  @Get('yo')
  @UseGuards(JwtGuard)
  yo(@UsuarioActual() s: Sesion) {
    return s;
  }
}
