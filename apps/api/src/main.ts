import 'reflect-metadata';
import { bootstrap } from './bootstrap';

// Lee apps/api/.env si existe (Node ≥ 21.7). Las credenciales nunca se versionan.
try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env: se usan las variables del entorno y los valores por defecto */
}

void bootstrap();
