import { defineConfig, devices } from '@playwright/test';
import {
  BACKEND_PORT,
  BACKEND_URL,
  E2E_SETUP_TOKEN,
  FRONTEND_PORT,
  FRONTEND_URL,
  OUTPUT_DIR,
  REPO_ROOT,
  e2eDatabaseUrl,
} from './support/env';
import path from 'node:path';

/**
 * Pruebas E2E en Chromium contra la aplicación real (sin mocks de la API):
 * Express + Prisma + PostgreSQL de pruebas y el frontend de Vite.
 *
 *   E2E_DATABASE_URL=postgresql://…/minisuper_e2e npm run test:e2e
 *
 * La base debe tener las migraciones aplicadas:
 *   DATABASE_URL=$E2E_DATABASE_URL npx prisma migrate deploy --config backend/prisma7.config.ts
 */
const databaseUrl = e2eDatabaseUrl();

export default defineConfig({
  testDir: path.join(REPO_ROOT, 'e2e', 'tests'),
  outputDir: OUTPUT_DIR,
  // Las pruebas comparten una sola base: se ejecutan una a una.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: FRONTEND_URL,
    viewport: { width: 1440, height: 900 },
    locale: 'es-CR',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: path.join(REPO_ROOT, 'backend'),
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(BACKEND_PORT),
        CORS_ORIGIN: FRONTEND_URL,
        DATABASE_URL: databaseUrl,
        SETUP_TOKEN: E2E_SETUP_TOKEN,
      },
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      cwd: path.join(REPO_ROOT, 'frontend'),
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: BACKEND_URL },
    },
  ],
});
