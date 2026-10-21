import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, type AppDeps } from './app.module';
import { loadConfig } from './config';
import { limites } from './limites';
import { DB, type Db } from './db/client';
import { sembrarDemoSiAplica } from './db/seed';

export async function createApp(deps: AppDeps = {}): Promise<INestApplication> {
  const config = deps.config ?? loadConfig();
  limites.login = config.loginRpm;
  limites.reservas = config.reservasRpm;
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register({ config }), {
    logger: process.env['VITEST'] ? ['error'] : ['log', 'warn', 'error'],
  });
  // Render pone un proxy delante: así el límite de ritmo usa la IP real de la clienta.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '20kb' });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.enableShutdownHooks();
  return app;
}

export async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp({ config });
  const semilla = await sembrarDemoSiAplica(app.get<Db>(DB));
  if (semilla !== 'omitido')
    new Logger('Pilas').log(`Salón de ejemplo: ${semilla === 'creado' ? 'creado' : 'ya existía'}`);
  await app.listen(config.port, '0.0.0.0');
  new Logger('Pilas').log(`API en el puerto ${config.port} (/api)`);
}
