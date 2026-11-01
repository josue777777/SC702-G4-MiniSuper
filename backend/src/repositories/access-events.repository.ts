import { prisma } from '../config/prisma.js';
import type { AccessEventFields } from '../types/auth.js';

/**
 * Registro de seguridad de las cuentas (HU-13): quién cambió o restableció una
 * contraseña y cuándo. Solo agrega filas; nunca las cambia ni las borra.
 *
 * La recuperación por correo registra su evento dentro de su propia transacción
 * (`password-reset.repository.ts`); este repositorio lo usan los demás cambios.
 */
export class AccessEventsRepository {
  async record(fields: AccessEventFields): Promise<void> {
    await prisma.accessEvent.create({ data: fields });
  }
}
