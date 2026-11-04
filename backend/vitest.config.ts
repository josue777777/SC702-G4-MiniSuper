import { defineConfig } from 'vitest/config';

/**
 * Con una base `*_test`, las pruebas de integración (`*.integration.test.ts`)
 * comparten esa base y vacían tablas: los archivos corren uno a la vez para no
 * pisarse los datos. Sin esa base se omiten solas y todo corre en paralelo.
 */
const usesTestDatabase = new URL(
  process.env['DATABASE_URL'] ?? 'postgresql://x/none',
).pathname.endsWith('_test');

export default defineConfig({
  test: {
    fileParallelism: !usesTestDatabase,
  },
});
