import { prisma } from '../config/prisma.js';
import type { RecoverableAccount } from '../types/auth.js';

const accountSelection = {
  id: true,
  name: true,
  email: true,
  role: true,
  businessId: true,
  isActive: true,
  business: { select: { status: true } },
} as const;

function toAccount({
  business,
  ...user
}: {
  business: { status: 'ACTIVE' | 'SUSPENDED' } | null;
} & Omit<RecoverableAccount, 'businessStatus'>): RecoverableAccount {
  return { ...user, businessStatus: business?.status ?? null };
}

/**
 * Acceso a datos de la recuperación de contraseña por correo (HU-13).
 *
 * En la base solo vive el HASH del token del enlace (`utils/reset-token.ts`) y
 * su vencimiento. Usar el enlace es atómico: una sola actualización comprueba
 * que el token coincide y no venció, y lo borra; dos clics al mismo tiempo no
 * pueden usarlo dos veces.
 */
export class PasswordResetRepository {
  async findByEmail(email: string): Promise<RecoverableAccount | null> {
    const row = await prisma.user.findUnique({ where: { email }, select: accountSelection });

    return row === null ? null : toAccount(row);
  }

  /** Guarda el enlace nuevo; el anterior, si había, deja de servir. */
  async saveToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordResetToken: tokenHash, passwordResetExpires: expiresAt },
    });
  }

  /** La cuenta dueña de un enlace vigente, o `null` si no existe o ya venció. */
  async findByToken(tokenHash: string, now: Date): Promise<RecoverableAccount | null> {
    const row = await prisma.user.findFirst({
      where: { passwordResetToken: tokenHash, passwordResetExpires: { gt: now } },
      select: accountSelection,
    });

    return row === null ? null : toAccount(row);
  }

  /**
   * Pone la contraseña nueva, borra el enlace, cierra todas las sesiones y deja
   * el registro de seguridad, todo en una transacción. `false` si el enlace ya
   * se usó o venció entre la búsqueda y este momento.
   */
  async completeReset(
    account: Pick<RecoverableAccount, 'id' | 'businessId'>,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: {
          id: account.id,
          passwordResetToken: tokenHash,
          passwordResetExpires: { gt: now },
        },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordResetToken: null,
          passwordResetExpires: null,
          sessionVersion: { increment: 1 },
        },
      });

      if (count === 0) {
        return false;
      }

      await tx.accessEvent.create({
        data: {
          type: 'PASSWORD_RECOVERED_BY_EMAIL',
          userId: account.id,
          businessId: account.businessId,
          actorId: null,
        },
      });

      return true;
    });
  }
}
