import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

/**
 * Envío de correos (HU-13: recuperación de contraseña y avisos de seguridad).
 *
 * Los services dependen de la interfaz `Mailer`, nunca de un proveedor: así se
 * prueban con un buzón falso y en producción se cambia de proveedor sin tocar
 * las reglas del negocio. Qué implementación se usa lo decide `MAIL_TRANSPORT`
 * (ver `config/mail.ts`).
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Texto plano: lo leen todos los clientes de correo y no trae sorpresas de formato. */
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Desarrollo: imprime el correo en la consola del backend (con el enlace, para probar a mano). */
export class ConsoleMailer implements Mailer {
  send(message: MailMessage): Promise<void> {
    console.info(
      `\n✉️  Correo para ${message.to}\n   Asunto: ${message.subject}\n\n${message.text}\n`,
    );

    return Promise.resolve();
  }
}

/**
 * Pruebas E2E: guarda cada correo como un archivo JSON en una carpeta. La
 * prueba lo lee como si abriera el buzón (ver `e2e/support/mailbox.ts`).
 */
export class OutboxMailer implements Mailer {
  private sequence = 0;

  constructor(private readonly directory: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true });

    const name = `${Date.now()}-${String(this.sequence++).padStart(4, '0')}.json`;

    await writeFile(
      join(this.directory, name),
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }),
    );
  }
}

/** Producción: envía de verdad por SMTP (cualquier proveedor: Resend, SendGrid, Gmail…). */
export class SmtpMailer implements Mailer {
  private readonly transport: nodemailer.Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
