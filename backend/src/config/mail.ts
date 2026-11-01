import { AccessEventsRepository } from '../repositories/access-events.repository.js';
import { AccountNotifier } from '../services/account-notifier.service.js';
import { AccountSecurityService } from '../services/account-security.service.js';
import { ConsoleMailer, type Mailer, OutboxMailer, SmtpMailer } from '../utils/mailer.js';
import { env } from './env.js';

/** El buzón según `MAIL_TRANSPORT` (ver `backend/.env.example`). */
function createMailer(): Mailer {
  switch (env.MAIL_TRANSPORT) {
    case 'smtp':
      // `env.ts` ya exige SMTP_URL con este transporte.
      return new SmtpMailer(env.SMTP_URL ?? '', env.MAIL_FROM);
    case 'outbox':
      return new OutboxMailer(env.MAIL_OUTBOX_DIR);
    case 'console':
      return new ConsoleMailer();
  }
}

/** Correos de seguridad de las cuentas, compartidos por todas las rutas. */
export const accountNotifier = new AccountNotifier(createMailer());

/** Registro de seguridad + aviso por correo cada vez que cambia una contraseña. */
export const accountSecurity = new AccountSecurityService(
  new AccessEventsRepository(),
  accountNotifier,
);
