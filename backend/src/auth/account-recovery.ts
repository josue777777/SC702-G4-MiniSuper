import type { Role } from './permissions.js';

/**
 * Quién recupera su contraseña por correo (HU-13).
 *
 * Solo los roles con un correo propio y responsabilidad sobre otros: el
 * Administrador de la plataforma y el Encargado de un negocio. Así ninguno
 * depende de que otra persona esté disponible.
 *
 * El personal (Cajero, Bodega) recupera su contraseña con su Encargado, que se
 * la restablece con una temporal (`users.service.ts`). A ellos tampoco se les
 * envían avisos por correo.
 */
export const EMAIL_RECOVERY_ROLES: readonly Role[] = ['ADMIN', 'ENCARGADO'];

export function recoversByEmail(role: Role): boolean {
  return EMAIL_RECOVERY_ROLES.includes(role);
}
