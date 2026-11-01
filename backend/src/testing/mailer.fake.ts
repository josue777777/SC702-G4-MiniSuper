import type { Mailer, MailMessage } from '../utils/mailer.js';

/** Buzón de prueba: guarda los correos en memoria para revisarlos. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);

    return Promise.resolve();
  }

  /** El enlace de recuperación del último correo enviado a `to`. */
  lastLinkTo(to: string): string | null {
    const message = this.sent.filter((mail) => mail.to === to).at(-1);

    return message?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
  }
}
