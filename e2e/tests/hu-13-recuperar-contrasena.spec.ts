import { expect, test, type Page } from '@playwright/test';
import { insertUser, withDb } from '../support/db';
import { saveEvidence } from '../support/evidence';
import { E2E_OWNER, ensureOwner } from '../support/fixtures';
import { clearMailbox, emailsTo, linkIn, waitForEmail } from '../support/mailbox';

/**
 * HU-13 (issue #14): recuperar la contraseña por correo. Solo el Administrador
 * y el Encargado; el personal la recupera con su Encargado. Navegador real +
 * backend real + PostgreSQL de pruebas; los correos llegan a un buzón de prueba.
 */

const NEW_PASSWORD = 'ClaveRecuperada2026';
const CAJERO = {
  name: 'Carlos Cajero',
  email: 'carlos.cajero@example.com',
  password: 'ClaveCajero123',
  role: 'CAJERO',
} as const;

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo o usuario').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Desde el login: «¿Olvidó su contraseña?» → escribe el correo → enviar. */
async function requestLink(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('link', { name: '¿Olvidó su contraseña?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('status')).toContainText('Si el correo está registrado');
}

async function accessEvents(email: string): Promise<string[]> {
  return withDb(async (client) => {
    const result = await client.query<{ type: string }>(
      `SELECT e.type FROM "AccessEvent" e JOIN "User" u ON u.id = e."userId"
       WHERE u.email = $1 ORDER BY e."createdAt"`,
      [email],
    );

    return result.rows.map((row) => row.type);
  });
}

test.beforeEach(async () => {
  await ensureOwner();
  await clearMailbox();
});

test('HU-13: la Encargada recupera su contraseña con el enlace de su correo', async ({ page }) => {
  await requestLink(page, E2E_OWNER.email);
  await saveEvidence(page, 'HU-13', 'HU-13-enlace-solicitado.png');

  // Le llega el enlace al correo.
  const email = await waitForEmail(E2E_OWNER.email, 'Recuperar su contraseña');

  expect(email.text).toContain('Vence en 30 minutos');

  // Abre el enlace y elige una contraseña nueva.
  await page.goto(linkIn(email));
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Repita la contraseña nueva').fill('NoCoincide2026');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();

  await page.getByLabel('Repita la contraseña nueva').fill(NEW_PASSWORD);
  await saveEvidence(page, 'HU-13', 'HU-13-contrasena-nueva.png');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Contraseña actualizada');

  // Le llega el aviso de seguridad y queda el registro.
  const notice = await waitForEmail(E2E_OWNER.email, 'Su contraseña de MiniSuper cambió');

  expect(notice.text).toContain('Si usted no hizo este cambio');
  expect(await accessEvents(E2E_OWNER.email)).toEqual(['PASSWORD_RECOVERED_BY_EMAIL']);

  // La contraseña vieja ya no sirve; la nueva sí.
  await login(page, E2E_OWNER.email, E2E_OWNER.password);
  await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos.');
  await login(page, E2E_OWNER.email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
});

test('HU-13: el enlace sirve una sola vez', async ({ page }) => {
  await requestLink(page, E2E_OWNER.email);

  const link = linkIn(await waitForEmail(E2E_OWNER.email, 'Recuperar su contraseña'));

  for (const attempt of [1, 2]) {
    await page.goto(link);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(`${NEW_PASSWORD}${attempt}`);
    await page.getByLabel('Repita la contraseña nueva').fill(`${NEW_PASSWORD}${attempt}`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  }

  await expect(page.getByRole('alert')).toContainText(
    'El enlace no es válido o ya venció. Solicite uno nuevo.',
  );
  await saveEvidence(page, 'HU-13', 'HU-13-enlace-usado.png');
});

test('HU-13: un Cajero ve el mismo mensaje, no recibe correo y tiene la otra opción: quien lo administra', async ({
  page,
}) => {
  await insertUser(CAJERO);

  await requestLink(page, CAJERO.email);

  // La otra forma de recuperar el acceso, sin nombrar roles: sirve para cualquiera.
  await page.getByText('¿No tiene acceso a su correo?').click();
  await expect(page.getByText('Pídale a la persona que administra su cuenta')).toBeVisible();
  await saveEvidence(page, 'HU-13', 'HU-13-sin-acceso-al-correo.png');

  // Mismo mensaje que con una cuenta real; el correo no llega y nada cambia.
  await requestLink(page, 'nadie.registrado@example.com');
  await page.waitForTimeout(500);
  expect(await emailsTo(CAJERO.email)).toHaveLength(0);
  expect(await emailsTo('nadie.registrado@example.com')).toHaveLength(0);
});
