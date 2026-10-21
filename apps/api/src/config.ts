/** Configuración por variables de entorno, con valores seguros para desarrollo local (mismo estilo que Ñapa). */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  /** Peticiones por minuto permitidas a cada cliente (general). */
  clientRpm: number;
  /** Intentos de login por minuto por cliente. */
  loginRpm: number;
  /** Reservas públicas por minuto por cliente. */
  reservasRpm: number;
  /** Versión del aviso de privacidad que acepta la clienta. */
  avisoPrivacidadVersion: string;
  produccion: boolean;
  /** URL pública de la web (para los enlaces de los correos). */
  appUrl: string;
  correo: { proveedor: 'ses' | 'log'; region: string; remitente: string | null };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const prod = env['NODE_ENV'] === 'production';
  const num = (k: string, d: number) => Math.max(1, Number(env[k] ?? d) || d);
  const jwtSecret = env['JWT_SECRET'] ?? '';
  if (prod && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET es obligatorio en producción (mínimo 32 caracteres).');
  }
  return {
    port: Number(env['PORT'] ?? 3000),
    databaseUrl: env['DATABASE_URL'] ?? 'postgres://pilas:pilas@localhost:5432/pilas',
    jwtSecret: jwtSecret || 'solo-para-desarrollo-local-no-usar-en-produccion',
    jwtExpiresIn: env['JWT_EXPIRES_IN'] ?? '12h',
    corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:4200,https://jfredmc.github.io')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    clientRpm: num('CLIENT_RPM', 120),
    loginRpm: num('LOGIN_RPM', 5),
    reservasRpm: num('RESERVAS_RPM', 10),
    avisoPrivacidadVersion: env['AVISO_PRIVACIDAD_VERSION'] ?? '2026-10',
    produccion: prod,
    appUrl: (env['APP_URL'] ?? 'http://localhost:4200').replace(/\/+$/, ''),
    correo: {
      proveedor: env['MAIL_PROVIDER'] === 'ses' ? 'ses' : 'log',
      region: env['SES_AWS_REGION'] ?? 'us-east-2',
      remitente: env['SES_FROM_EMAIL'] || null,
    },
  };
}
