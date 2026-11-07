import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { EVIDENCE_ROOT } from './env';

/**
 * Guarda una captura REAL de la aplicación en la carpeta de evidencias (fuera
 * del repositorio). Llamar siempre DESPUÉS de las aserciones que comprueban el
 * estado que se quiere documentar. Con `fullPage` captura toda la pantalla, no
 * solo la parte visible. Devuelve la ruta absoluta.
 */
export async function saveEvidence(
  page: Page,
  story: string,
  fileName: string,
  options: { fullPage?: boolean } = {},
): Promise<string> {
  const directory = path.join(EVIDENCE_ROOT, story);

  mkdirSync(directory, { recursive: true });

  const filePath = path.join(directory, fileName);

  await page.screenshot({ path: filePath, fullPage: options.fullPage ?? false });

  return filePath;
}

/**
 * Une, una debajo de otra, capturas REALES ya tomadas de pantallas distintas
 * (por ejemplo, dos pestañas de un mismo módulo) en una sola imagen de evidencia.
 * No dibuja ni modifica nada: solo las apila. Devuelve la ruta absoluta.
 */
export async function saveStackedEvidence(
  page: Page,
  story: string,
  fileName: string,
  screenshots: Buffer[],
): Promise<string> {
  const directory = path.join(EVIDENCE_ROOT, story);

  mkdirSync(directory, { recursive: true });

  const filePath = path.join(directory, fileName);
  const images = screenshots
    .map(
      (shot) =>
        `<img src="data:image/png;base64,${shot.toString('base64')}" style="display:block;width:1440px;border-bottom:4px solid #94a3b8">`,
    )
    .join('');
  const sheet = await page.context().newPage();

  try {
    await sheet.setContent(`<body style="margin:0;background:#fff">${images}</body>`);
    await sheet.waitForFunction(() =>
      Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
    );
    writeFileSync(filePath, await sheet.screenshot({ fullPage: true }));
  } finally {
    await sheet.close();
  }

  return filePath;
}

/**
 * Ruta (absoluta) de un archivo de evidencia que genera la prueba misma, como un
 * PDF con `page.pdf()`. Crea la carpeta de la historia si falta.
 */
export function evidencePath(story: string, fileName: string): string {
  const directory = path.join(EVIDENCE_ROOT, story);

  mkdirSync(directory, { recursive: true });

  return path.join(directory, fileName);
}
