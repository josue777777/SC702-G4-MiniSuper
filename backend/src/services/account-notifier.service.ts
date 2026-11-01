import { recoversByEmail, type Role } from '../auth/permissions.js';
import type { Mailer, MailMessage } from '../utils/mailer.js';
import { RESET_TOKEN_TTL_MINUTES } from '../utils/reset-token.js';

/** Cómo cambió la contraseña: cambia el texto del aviso. */
export type PasswordChange = 'recovered' | 'changed' | 'reset-by-manager';

interface Recipient {
  name: string;
  email: string;
  role: Role;
}

const SYSTEM_NAME = 'MiniSuper';

const CHANGE_DETAIL: Record<PasswordChange, string> = {
  recovered: 'La contraseña de su cuenta se cambió con el enlace de recuperación.',
  changed: 'La contraseña de su cuenta se cambió desde «Mi perfil».',
  'reset-by-manager':
    'Un administrador le asignó una contraseña temporal. El sistema le pedirá cambiarla al ingresar.',
};

/**
 * Correos de seguridad de las cuentas (HU-13).
 *
 * Solo escribe a los roles que recuperan su acceso por correo (`ROLE_RECOVERY`
 * en `auth/permissions.ts`). El
 * envío va en segundo plano: si el proveedor de correo tarda o falla, la
 * respuesta al usuario no cambia (ni revela nada) y el error queda en el log.
 */
export class AccountNotifier {
  constructor(private readonly mailer: Mailer) {}

  /** El enlace para elegir una contraseña nueva. */
  sendResetLink(recipient: Recipient, link: string): void {
    this.deliver({
      to: recipient.email,
      subject: `Recuperar su contraseña de ${SYSTEM_NAME}`,
      text: [
        `Hola, ${recipient.name}:`,
        '',
        `Recibimos una solicitud para cambiar la contraseña de su cuenta en ${SYSTEM_NAME}.`,
        `Para elegir una contraseña nueva, abra este enlace. Vence en ${RESET_TOKEN_TTL_MINUTES} minutos y sirve una sola vez:`,
        '',
        link,
        '',
        'Si usted no lo pidió, ignore este correo: su contraseña no cambia.',
      ].join('\n'),
    });
  }

  /** Aviso de que su contraseña cambió: si no fue la persona, se entera de inmediato. */
  passwordChanged(recipient: Recipient, how: PasswordChange): void {
    if (!recoversByEmail(recipient.role)) {
      return;
    }

    this.deliver({
      to: recipient.email,
      subject: `Su contraseña de ${SYSTEM_NAME} cambió`,
      text: [
        `Hola, ${recipient.name}:`,
        '',
        CHANGE_DETAIL[how],
        'Por seguridad, se cerraron las sesiones abiertas de su cuenta en otros dispositivos.',
        '',
        'Si usted no hizo este cambio, comuníquese de inmediato con el administrador de la plataforma.',
      ].join('\n'),
    });
  }

  private deliver(message: MailMessage): void {
    this.mailer.send(message).catch((error: unknown) => {
      console.error(`No se pudo enviar el correo «${message.subject}» a ${message.to}:`, error);
    });
  }
}
