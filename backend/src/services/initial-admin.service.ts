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
    // El administrador es de la plataforma: no pertenece a ningún negocio.
    businessId: null,
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

/** Prisma explica el error en varias líneas con código; la causa es la última. */
function lastLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .at(-1) ?? text
  );
}

/** Dónde escribe el aviso: la consola del servidor (inyectable para las pruebas). */
export type WarningLogger = (message: string) => void;

/**
 * Texto del aviso cuando no hay ningún administrador activo. Explica el
 * problema y los pasos, sin mostrar correos ni contraseñas.
 */
export const NO_ACTIVE_ADMIN_WARNING = [
  '⚠️  No hay ningún administrador activo: nadie puede iniciar sesión como',
  '   Administrador ni crear usuarios en Configuración › Usuarios.',
  '   Para crear el administrador inicial:',
  '     1. En backend/.env defina ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD',
  '        (hay un ejemplo en backend/.env.example).',
  '     2. Ejecute: npm run db:seed',
  '   Esa contraseña es temporal: el sistema pedirá cambiarla en el primer ingreso.',
].join('\n');

/**
 * Revisión al arrancar el servidor: si no hay un administrador activo, lo avisa
 * en la consola del servidor con los pasos para crearlo.
 *
 * El aviso es SOLO interno, a propósito: lo ve quien instala y administra el
 * servidor, nunca la pantalla de login. Así no se le anuncia a un visitante que
 * el sistema está sin dueño (la razón por la que se quitó `/setup`).
 *
 * Nunca impide que el servidor arranque: si la base no responde, lo dice con el
 * detalle (es la consola interna) y sigue; `/api/health/database` también sirve
 * para diagnosticarlo.
 */
export async function warnIfNoActiveAdmin(
  repository: UsersRepository,
  log: WarningLogger = console.warn,
): Promise<'ok' | 'missing' | 'unknown'> {
  try {
    if ((await repository.countActiveAdmins()) > 0) {
      return 'ok';
    }

    log(NO_ACTIVE_ADMIN_WARNING);

    return 'missing';
  } catch (error) {
    log(
      '⚠️  No se pudo comprobar si existe un administrador: la base de datos no respondió.\n' +
        '   Revise que PostgreSQL esté arriba (npm run db:up) y las migraciones (npm run db:migrate).\n' +
        `   Detalle: ${lastLine(error instanceof Error ? error.message : String(error))}`,
    );

    return 'unknown';
  }
}
