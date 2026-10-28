import type { UsersRepository } from '../repositories/users.repository.js';
import { hashPassword } from '../utils/password.js';
import type { InitialAdminInput } from '../validators/auth.validator.js';

export type InitialAdminResult =
  | { status: 'created'; email: string }
  | { status: 'exists' }
  | { status: 'email-in-use'; email: string };

/**
 * Administrador inicial (HU-12): lo crea el comando `npm run db:seed` con los
 * datos del `.env`, nunca una pantalla pública. Si ya hay un administrador
 * activo no hace nada (ni crea otro ni le cambia la contraseña), así el comando
 * se puede correr las veces que haga falta. La contraseña del `.env` es
 * temporal: se debe cambiar en el primer ingreso.
 */
export async function ensureInitialAdmin(
  repository: UsersRepository,
  input: InitialAdminInput,
): Promise<InitialAdminResult> {
  if ((await repository.countActiveAdmins()) > 0) {
    return { status: 'exists' };
  }

  const created = await repository.create({
    name: input.name,
    email: input.email,
    role: 'ADMIN',
    passwordHash: await hashPassword(input.password),
    mustChangePassword: true,
  });

  return created === null
    ? { status: 'email-in-use', email: input.email }
    : { status: 'created', email: created.email };
}
