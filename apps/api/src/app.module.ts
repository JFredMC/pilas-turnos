import { DynamicModule, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Pool } from 'pg';
import type { AppConfig } from './config';
import { AuthController, JwtGuard } from './auth/auth';
import { DB, POOL, crearDb, crearPool } from './db/client';
import { HealthController } from './health.controller';
import { PublicoController } from './publico.controller';
import { SalonController } from './salon.controller';
import { ConfiguracionController } from './configuracion.controller';
import { CorreoService } from './correo';
import { CONFIG } from './tokens';

export interface AppDeps {
  config?: AppConfig;
}

class CerrarPool implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Module({})
export class AppModule {
  static register(deps: Required<AppDeps>): DynamicModule {
    const { config } = deps;
    return {
      module: AppModule,
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: config.clientRpm }]),
        JwtModule.register({
          secret: config.jwtSecret,
          signOptions: { expiresIn: config.jwtExpiresIn as never },
        }),
      ],
      controllers: [
        HealthController,
        AuthController,
        PublicoController,
        SalonController,
        ConfiguracionController,
      ],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: POOL, useFactory: () => crearPool(config.databaseUrl) },
        { provide: DB, inject: [POOL], useFactory: crearDb },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        JwtGuard,
        CorreoService,
        CerrarPool,
      ],
    };
  }
}
