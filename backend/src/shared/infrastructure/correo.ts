import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from './logger.js';

export interface MensajeCorreo {
  para: string;
  asunto: string;
  texto: string;
}

/** Adaptador de correo: SMTP en producción, consola en desarrollo, memoria en pruebas. */
export interface Correo {
  enviar(m: MensajeCorreo): Promise<void>;
}

export class SmtpCorreo implements Correo {
  private transporte = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  async enviar(m: MensajeCorreo) {
    await this.transporte.sendMail({ from: env.MAIL_FROM, to: m.para, subject: m.asunto, text: m.texto });
  }
}

export class ConsolaCorreo implements Correo {
  async enviar(m: MensajeCorreo) {
    logger.info({ para: m.para, asunto: m.asunto }, `Correo (sin SMTP configurado):\n${m.texto}`);
  }
}

export function crearCorreo(): Correo {
  return env.SMTP_HOST ? new SmtpCorreo() : new ConsolaCorreo();
}
