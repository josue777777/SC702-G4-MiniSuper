import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { EVIDENCE_ROOT } from './env';

/**
 * Guarda una captura REAL de la aplicación en la carpeta de evidencias (fuera
 * del repositorio). Llamar siempre DESPUÉS de las aserciones que comprueban el
 * estado que se quiere documentar. Devuelve la ruta absoluta.
 */
export async function saveEvidence(page: Page, story: string, fileName: string): Promise<string> {
  const directory = path.join(EVIDENCE_ROOT, story);

  mkdirSync(directory, { recursive: true });

  const filePath = path.join(directory, fileName);

  await page.screenshot({ path: filePath });

  return filePath;
}
