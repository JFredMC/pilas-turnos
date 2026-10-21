import { Inject, Injectable, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { CONFIG } from './tokens';
import type { AppConfig } from './config';

export interface Mensaje {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/**
 * Envío de correos. Con MAIL_PROVIDER=ses usa Amazon SES (credenciales AWS estándar del entorno).
 * Sin SES: en desarrollo escribe el mensaje en el log; en producción solo avisa (no filtra enlaces).
 */
@Injectable()
export class CorreoService {
  private readonly log = new Logger('Correo');
  private readonly ses: SESv2Client | null;
  /** Últimos mensajes "enviados" en modo log (para tests y desarrollo). */
  readonly bandeja: Mensaje[] = [];

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    this.ses =
      config.correo.proveedor === 'ses' ? new SESv2Client({ region: config.correo.region }) : null;
  }

  async enviar(m: Mensaje): Promise<void> {
    if (this.ses && this.config.correo.remitente) {
      await this.ses.send(
        new SendEmailCommand({
          FromEmailAddress: this.config.correo.remitente,
          Destination: { ToAddresses: [m.para] },
          Content: {
            Simple: {
              Subject: { Data: m.asunto, Charset: 'UTF-8' },
              Body: {
                Text: { Data: m.texto, Charset: 'UTF-8' },
                Html: { Data: m.html, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      return;
    }
    this.bandeja.push(m);
    if (this.bandeja.length > 20) this.bandeja.shift();
    if (this.config.produccion) {
      this.log.warn(`Correo sin configurar (MAIL_PROVIDER=ses): no se envió "${m.asunto}".`);
    } else {
      this.log.log(`[desarrollo] Para ${m.para} · ${m.asunto}\n${m.texto}`);
    }
  }
}
