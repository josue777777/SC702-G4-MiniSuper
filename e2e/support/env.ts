import path from 'node:path';

/**
 * Entorno de las pruebas E2E (Playwright): backend y frontend REALES sobre una
 * base PostgreSQL aparte. Nada de esto toca la base de desarrollo.
 */

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Carpeta de evidencias HERMANA del repositorio (nunca dentro de él):
 *   <padre>/<nombre-del-repo>-evidencias/sprint-2/HU-xx/*.png
 * Se puede cambiar con la variable EVIDENCE_DIR.
 */
export const EVIDENCE_ROOT =
  process.env['EVIDENCE_DIR'] ??
  path.resolve(REPO_ROOT, '..', `${path.basename(REPO_ROOT)}-evidencias`, 'sprint-2');

/** Resultados, trazas y descargas de Playwright, también fuera del repositorio. */
export const OUTPUT_DIR = path.resolve(EVIDENCE_ROOT, '..', 'playwright-output');

export const BACKEND_PORT = 4010;
export const FRONTEND_PORT = 5183;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

/**
 * Base de datos de las pruebas. Debe terminar en `_e2e`: las pruebas BORRAN
 * datos y esta guarda evita apuntar por error a la base de desarrollo.
 */
export function e2eDatabaseUrl(): string {
  const url = process.env['E2E_DATABASE_URL'];

  if (url === undefined) {
    throw new Error(
      'Defina E2E_DATABASE_URL con una base PostgreSQL exclusiva para E2E (nombre terminado en _e2e).',
    );
  }

  if (!new URL(url).pathname.endsWith('_e2e')) {
    throw new Error('E2E_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_e2e".');
  }

  return url;
}
