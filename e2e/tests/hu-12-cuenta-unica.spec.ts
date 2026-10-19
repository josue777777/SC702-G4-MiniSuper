import { expect, test } from '@playwright/test';
import { readUsers, resetOwner } from '../support/db';
import { BACKEND_URL, E2E_SETUP_TOKEN } from '../support/env';
import { saveEvidence } from '../support/evidence';

/**
 * HU-12 — Configurar cuenta única de acceso (issue #13).
 * Navegador real + backend real + PostgreSQL de pruebas.
 */

const OWNER = {
  name: 'Dueña de Prueba',
  email: 'duena.prueba@example.com',
  password: 'ClaveSegura123',
};

test.beforeEach(async () => {
  await resetOwner();
});

test('sin cuenta, el sistema obliga a configurarla y la crea una sola vez', async ({ page }) => {
  // Instalación nueva: cualquier ruta lleva a la configuración inicial.
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Configurar cuenta del dueño' })).toBeVisible();
  await expect(page.getByLabel('Token de configuración')).toBeVisible();
  await saveEvidence(page, 'HU-12', 'HU-12-configuracion-inicial.png');

  await page.getByLabel('Nombre', { exact: true }).fill(OWNER.name);
  await page.getByLabel('Correo electrónico').fill(OWNER.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(OWNER.password);
  await page.getByLabel('Confirmar contraseña').fill(OWNER.password);
  await page.getByLabel('Token de configuración').fill(E2E_SETUP_TOKEN);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Redirección al login con aviso de éxito.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Cuenta configurada');
  await saveEvidence(page, 'HU-12', 'HU-12-cuenta-configurada.png');

  // Persistencia: una sola cuenta y la contraseña solo como hash Argon2id.
  const users = await readUsers();

  expect(users).toHaveLength(1);
  expect(users[0]?.email).toBe(OWNER.email);
  expect(users[0]?.passwordHash).toMatch(/^\$argon2id\$/);
  expect(users[0]?.passwordHash).not.toContain(OWNER.password);
});

test('rechaza correo inválido, contraseña débil, confirmación distinta y token incorrecto', async ({
  page,
}) => {
  await page.goto('/setup');

  await page.getByLabel('Nombre', { exact: true }).fill(OWNER.name);
  await page.getByLabel('Correo electrónico').fill('esto-no-es-un-correo');
  await page.getByLabel('Contraseña', { exact: true }).fill('corta');
  await page.getByLabel('Confirmar contraseña').fill('otra');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByText('El correo no es válido.')).toBeVisible();
  await expect(page.getByText('La contraseña debe tener al menos 10 caracteres.')).toBeVisible();
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await expect(page.getByText('Escriba el token de configuración')).toBeVisible();
  await saveEvidence(page, 'HU-12', 'HU-12-validaciones-rechazadas.png');
  expect(await readUsers()).toHaveLength(0);

  // Datos válidos pero token equivocado: el servidor lo rechaza.
  await page.getByLabel('Correo electrónico').fill(OWNER.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(OWNER.password);
  await page.getByLabel('Confirmar contraseña').fill(OWNER.password);
  await page.getByLabel('Token de configuración').fill('token-equivocado-9999');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByRole('alert')).toContainText('El token de configuración no es válido.');
  expect(await readUsers()).toHaveLength(0);
});

test('con cuenta existente, /setup redirige al login y el registro se rechaza', async ({
  page,
  request,
}) => {
  const created = await request.post(`${BACKEND_URL}/api/auth/setup`, {
    data: { ...OWNER, setupToken: E2E_SETUP_TOKEN },
  });

  expect(created.status()).toBe(201);

  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  const second = await request.post(`${BACKEND_URL}/api/auth/setup`, {
    data: { ...OWNER, email: 'otro@example.com', setupToken: E2E_SETUP_TOKEN },
  });

  expect(second.status()).toBe(409);
  expect(await readUsers()).toHaveLength(1);
});

test('solicitudes de configuración simultáneas crean una sola cuenta', async ({ request }) => {
  const attempts = Array.from({ length: 6 }, (_, index) =>
    request.post(`${BACKEND_URL}/api/auth/setup`, {
      data: { ...OWNER, email: `duena${index}@example.com`, setupToken: E2E_SETUP_TOKEN },
    }),
  );

  const statuses = (await Promise.all(attempts)).map((response) => response.status());

  expect(statuses.filter((status) => status === 201)).toHaveLength(1);
  expect(statuses.filter((status) => status === 409)).toHaveLength(5);
  expect(await readUsers()).toHaveLength(1);
});

test('sin el token de instalación el servidor no crea la cuenta', async ({ request }) => {
  const response = await request.post(`${BACKEND_URL}/api/auth/setup`, { data: OWNER });

  expect(response.status()).toBe(403);
  expect(await readUsers()).toHaveLength(0);
});
