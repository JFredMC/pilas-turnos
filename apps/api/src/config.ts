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
  /** WhatsApp Cloud API (Meta). Sin token no se envía nada: el panel ofrece el enlace wa.me. */
  whatsapp: {
    token: string;
    phoneNumberId: string;
    plantilla: string;
    idioma: string;
    apiVersion: string;
  } | null;
  /** Protege POST /api/interno/recordatorios (cron de GitHub Actions). Sin él, el endpoint no existe. */
  cronToken: string | null;
  /** Cada cuántos minutos revisa recordatorios mientras la API está despierta (0 = apagado). */
  recordatoriosCadaMin: number;
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
    whatsapp:
      env['WHATSAPP_TOKEN'] && env['WHATSAPP_PHONE_NUMBER_ID']
        ? {
            token: env['WHATSAPP_TOKEN'],
            phoneNumberId: env['WHATSAPP_PHONE_NUMBER_ID'],
            plantilla: env['WHATSAPP_TEMPLATE'] ?? 'recordatorio_cita',
            idioma: env['WHATSAPP_TEMPLATE_LANG'] ?? 'es',
            apiVersion: env['WHATSAPP_API_VERSION'] ?? 'v21.0',
          }
        : null,
    cronToken: (env['CRON_TOKEN'] ?? '').length >= 24 ? (env['CRON_TOKEN'] as string) : null,
    recordatoriosCadaMin: Math.max(0, Number(env['RECORDATORIOS_CADA_MIN'] ?? 10) || 0),
    correo: {
      proveedor: env['MAIL_PROVIDER'] === 'ses' ? 'ses' : 'log',
      region: env['SES_AWS_REGION'] ?? 'us-east-2',
      remitente: env['SES_FROM_EMAIL'] || null,
    },
  };
}
