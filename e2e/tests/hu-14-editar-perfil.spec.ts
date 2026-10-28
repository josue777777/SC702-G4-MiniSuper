import { expect, test, type Page } from '@playwright/test';
import { readUsers } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { E2E_OWNER, ensureOwner } from '../support/fixtures';

/**
 * HU-14 — Editar perfil (issue #15). Navegador real + backend real + PostgreSQL.
 * El administrador se prepara en la base (como `npm run db:seed`) y se entra por
 * el formulario de login real.
 */

const OWNER = E2E_OWNER;

test.beforeEach(async () => {
  await ensureOwner();
});

async function loginAndOpenProfile(page: Page, password = OWNER.password, email = OWNER.email) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Mi perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
}

test('un visitante sin sesión no puede ver ni cambiar el perfil', async ({ page, request }) => {
  await page.goto('/profile');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Inicie sesión para continuar.');

  const read = await request.get(`${BACKEND_URL}/api/profile`);
  const write = await request.patch(`${BACKEND_URL}/api/profile`, {
    data: { email: 'robado@example.com', currentPassword: OWNER.password },
  });

  expect(read.status()).toBe(401);
  expect(write.status()).toBe(401);
  expect((await readUsers())[0]?.email).toBe(OWNER.email);
});

test('muestra los valores actuales sin precargar la contraseña', async ({ page }) => {
  await loginAndOpenProfile(page);

  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(OWNER.name);
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue(OWNER.email);
  await expect(page.getByLabel('Contraseña actual')).toHaveValue('');
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  await saveEvidence(page, 'HU-14', 'HU-14-editar-perfil.png');
});

test('un correo con formato inválido no permite guardar', async ({ page }) => {
  await loginAndOpenProfile(page);

  await page.getByLabel('Correo electrónico', { exact: true }).fill('correo-sin-formato');
  await page.getByLabel('Contraseña actual').fill(OWNER.password);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('El correo no es válido.')).toBeVisible();
  await saveEvidence(page, 'HU-14', 'HU-14-correo-invalido.png');
  expect((await readUsers())[0]?.email).toBe(OWNER.email);
});

test('cancelar la edición no persiste nada', async ({ page }) => {
  await loginAndOpenProfile(page);

  await page.getByLabel('Nombre', { exact: true }).fill('Nombre que se descarta');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(OWNER.name);
  await page.reload();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(OWNER.name);
  expect((await readUsers())[0]?.name).toBe(OWNER.name);
});

test('actualiza el nombre sin pedir contraseña y lo conserva al recargar', async ({ page }) => {
  await loginAndOpenProfile(page);

  await page.getByLabel('Nombre', { exact: true }).fill('Dueña Renombrada');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByRole('status')).toContainText('Perfil actualizado correctamente.');
  await page.reload();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Dueña Renombrada');
  expect((await readUsers())[0]?.name).toBe('Dueña Renombrada');
});

test('cambiar el correo exige la contraseña actual y queda guardado para la recuperación', async ({
  page,
}) => {
  await loginAndOpenProfile(page);
  const newEmail = 'nuevo.correo@example.com';

  // Sin contraseña actual: el formulario lo señala y no guarda.
  await page.getByLabel('Correo electrónico', { exact: true }).fill(newEmail);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(
    page.getByText('Escriba su contraseña actual para confirmar el cambio.'),
  ).toBeVisible();
  expect((await readUsers())[0]?.email).toBe(OWNER.email);

  // Contraseña actual incorrecta: el servidor lo rechaza.
  await page.getByLabel('Contraseña actual').fill('incorrecta12345');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('alert')).toContainText('contraseña actual correcta');
  expect((await readUsers())[0]?.email).toBe(OWNER.email);

  // Contraseña actual correcta: se guarda y se confirma.
  await page.getByLabel('Contraseña actual').fill(OWNER.password);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByRole('status')).toContainText('Perfil actualizado correctamente.');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue(newEmail);
  await expect(page.getByLabel('Contraseña actual')).toHaveValue('');
  await saveEvidence(page, 'HU-14', 'HU-14-perfil-actualizado.png');

  await page.reload();
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue(newEmail);
  expect((await readUsers())[0]?.email).toBe(newEmail);
});

test('cambiar la contraseña guarda un hash nuevo y solo sirve la clave nueva', async ({
  page,
  browser,
}) => {
  await loginAndOpenProfile(page);
  const newPassword = 'ClaveNueva456789';

  await page.getByLabel('Nueva contraseña', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirmar nueva contraseña').fill(newPassword);
  await page.getByLabel('Contraseña actual').fill(OWNER.password);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByRole('status')).toContainText('Perfil actualizado correctamente.');

  // Esta sesión sigue válida después del cambio.
  await page.reload();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(OWNER.name);

  const hash = (await readUsers())[0]?.passwordHash ?? '';

  expect(hash).toMatch(/^\$argon2id\$/);
  expect(hash).not.toContain(newPassword);

  // En otro navegador: la clave vieja ya no entra y la nueva sí.
  const other = await browser.newContext();
  const otherPage = await other.newPage();

  await otherPage.goto('/login');
  await otherPage.getByLabel('Correo electrónico', { exact: true }).fill(OWNER.email);
  await otherPage.getByLabel('Contraseña', { exact: true }).fill(OWNER.password);
  await otherPage.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(otherPage.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');

  await otherPage.getByLabel('Contraseña', { exact: true }).fill(newPassword);
  await otherPage.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(otherPage).toHaveURL(/\/$/);
  await other.close();
});
