import { expect, test, type Page } from '@playwright/test';
import { insertUser, readUsers } from '../support/db';
import { BACKEND_URL, FRONTEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { E2E_OWNER, ensureOwner } from '../support/fixtures';

/**
 * Usuarios y roles: criterios adicionales de HU-11 a HU-15 (issues #12 a #16).
 * Navegador real + backend real + PostgreSQL de pruebas. El administrador se
 * prepara en la base, como lo hace `npm run db:seed`.
 */

const NEW_PASSWORD = 'MiClavePropia123';

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Entra como administrador y espera el panel antes de navegar a otra pantalla. */
async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, E2E_OWNER.email, E2E_OWNER.password);
  await expect(page).toHaveURL(/\/$/);
}

async function logout(page: Page): Promise<void> {
  // Con la ventana de Configuración abierta, lo de atrás no se puede usar.
  await page.goto('/');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Crea un usuario desde Configuración › Usuarios y devuelve su contraseña temporal. */
async function createUserFromUi(
  page: Page,
  user: { name: string; email: string; role: string },
): Promise<string> {
  await page.getByRole('button', { name: '+ Nuevo usuario' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(user.name);
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Rol').selectOption({ label: user.role });
  await page.getByRole('button', { name: 'Crear usuario' }).click();

  const temporary = page.getByLabel('Contraseña temporal');

  await expect(temporary).toBeVisible();

  return (await temporary.textContent()) ?? '';
}

test.beforeEach(async () => {
  await ensureOwner();
});

test('no hay registro público: /setup no existe y la API de registro responde 404', async ({
  page,
  request,
}) => {
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  const response = await request.post(`${BACKEND_URL}/api/auth/setup`, {
    data: { name: 'Intruso', email: 'intruso@example.com', password: 'ClaveSegura123' },
  });

  expect(response.status()).toBe(404);
  expect(await readUsers()).toHaveLength(1);
});

test('el administrador crea un Cajero; este cambia la contraseña temporal y solo ve lo suyo', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.getByRole('button', { name: 'Configuración' }).click();
  await page.getByRole('tab', { name: 'Usuarios' }).click();
  await expect(page.getByRole('tab', { name: 'Usuarios' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const temporaryPassword = await createUserFromUi(page, {
    name: 'Carlos Cajero',
    email: 'carlos@example.com',
    role: 'Cajero',
  });

  expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
  await saveEvidence(page, 'HU-12', 'HU-12-usuario-creado-contrasena-temporal.png');
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('row', { name: /Carlos Cajero/ })).toContainText(
    'Contraseña temporal',
  );

  const saved = (await readUsers()).find((user) => user.email === 'carlos@example.com');

  expect(saved).toEqual(expect.objectContaining({ role: 'CAJERO', mustChangePassword: true }));
  expect(saved?.passwordHash).toMatch(/^\$argon2id\$/);
  expect(saved?.passwordHash).not.toContain(temporaryPassword);

  await logout(page);

  // Primer ingreso: solo puede ir a «Mi perfil» hasta crear su contraseña.
  await login(page, 'carlos@example.com', temporaryPassword);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('alert')).toContainText('contraseña temporal');
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/profile$/);
  await saveEvidence(page, 'HU-11', 'HU-11-cambio-obligatorio-contrasena.png');

  await page.getByLabel('Nueva contraseña', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirmar nueva contraseña').fill(NEW_PASSWORD);
  await page.getByLabel('Contraseña actual').fill(temporaryPassword);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil actualizado correctamente.');

  // Menú del Cajero: Ventas y Clientes sí; Pedidos y Configuración no.
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await expect(menu.getByRole('button', { name: 'Salidas' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Entradas' })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Configuración' })).toHaveCount(0);
  await saveEvidence(page, 'HU-11', 'HU-11-menu-cajero.png');

  // Escribir la dirección a mano no sirve: la pantalla y la API lo bloquean.
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await saveEvidence(page, 'HU-11', 'HU-11-acceso-no-permitido.png');

  const api = await page.request.get(`${BACKEND_URL}/api/purchase-orders`);

  expect(api.status()).toBe(403);
  expect((await page.request.get(`${BACKEND_URL}/api/sales`)).status()).toBe(200);
});

test('el Encargado usa todo el negocio, pero no la Configuración', async ({ page }) => {
  await insertUser({
    name: 'Elena Encargada',
    email: 'elena@example.com',
    password: 'ClaveSegura123',
    role: 'ENCARGADO',
  });

  await login(page, 'elena@example.com', 'ClaveSegura123');
  await expect(page).toHaveURL(/\/$/);

  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await expect(menu.getByRole('button', { name: 'Entradas' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Salidas' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Configuración' })).toHaveCount(0);

  await page.goto('/settings/users');
  await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  expect((await page.request.get(`${BACKEND_URL}/api/users`)).status()).toBe(403);
  expect((await page.request.get(`${BACKEND_URL}/api/purchase-orders`)).status()).toBe(200);
});

test('al desactivar a un usuario se cierra su sesión y ya no puede entrar', async ({
  page,
  browser,
}) => {
  await insertUser({
    name: 'Bea Bodega',
    email: 'bea@example.com',
    password: 'ClaveSegura123',
    role: 'BODEGA',
  });

  // Bea tiene una sesión abierta en otro navegador.
  const other = await browser.newContext();
  const bea = await other.newPage();

  await login(bea, 'bea@example.com', 'ClaveSegura123');
  await expect(bea).toHaveURL(/\/$/);

  await loginAsAdmin(page);
  await page.goto('/settings/users');

  const row = page.getByRole('row', { name: /Bea Bodega/ });

  await row.getByRole('button', { name: 'Desactivar' }).click();
  await page
    .getByRole('dialog', { name: 'Desactivar usuario' })
    .getByRole('button', { name: 'Desactivar' })
    .click();
  await expect(row).toContainText('Inactivo');
  await saveEvidence(page, 'HU-15', 'HU-15-usuario-desactivado.png');

  // Su sesión abierta deja de servir y no puede volver a entrar.
  await bea.reload();
  await expect(bea).toHaveURL(/\/login$/);
  await login(bea, 'bea@example.com', 'ClaveSegura123');
  await expect(bea.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
  await other.close();

  // No se borró: sigue en la base, inactivo.
  expect((await readUsers()).find((user) => user.email === 'bea@example.com')?.isActive).toBe(
    false,
  );
});

test('HU-13: el administrador restablece una contraseña olvidada con una temporal', async ({
  page,
}) => {
  await insertUser({
    name: 'Carlos Cajero',
    email: 'carlos@example.com',
    password: 'ClaveOlvidada123',
    role: 'CAJERO',
  });

  await loginAsAdmin(page);
  await page.goto('/settings/users');
  await page
    .getByRole('row', { name: /Carlos Cajero/ })
    .getByRole('button', { name: 'Restablecer contraseña' })
    .click();
  await page
    .getByRole('dialog', { name: 'Restablecer contraseña' })
    .getByRole('button', { name: 'Restablecer' })
    .click();

  const temporary = page.getByLabel('Contraseña temporal');

  await expect(temporary).toBeVisible();

  const temporaryPassword = (await temporary.textContent()) ?? '';

  await saveEvidence(page, 'HU-13', 'HU-13-contrasena-restablecida.png');
  await page.getByRole('button', { name: 'Listo' }).click();
  await logout(page);

  // La contraseña vieja ya no sirve; la temporal sí, y obliga a cambiarla.
  await login(page, 'carlos@example.com', 'ClaveOlvidada123');
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
  await login(page, 'carlos@example.com', temporaryPassword);
  await expect(page).toHaveURL(/\/profile$/);
});

test('el administrador no puede quitarse su propio rol ni desactivarse', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/settings/users');

  const own = page.getByRole('row', { name: /Dueña de Prueba/ });

  await expect(own.getByRole('button', { name: 'Desactivar' })).toHaveCount(0);
  await own.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByLabel('Rol')).toBeDisabled();

  // Aunque se intente por la API, el servidor lo rechaza.
  const users = await page.request.get(`${BACKEND_URL}/api/users`);
  const { data } = (await users.json()) as { data: { id: string; email: string }[] };
  const ownId = data.find((user) => user.email === E2E_OWNER.email)?.id ?? '';
  const response = await page.request.post(`${BACKEND_URL}/api/users/${ownId}/deactivate`, {
    headers: { Origin: FRONTEND_URL },
  });

  expect(response.status()).toBe(409);
});

test('Configuración › General: el administrador cambia los datos del negocio y se ven en todo el sistema', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await page.getByRole('button', { name: 'Configuración' }).click();

  const window = page.getByRole('dialog', { name: 'Configuración' });

  await expect(window.getByRole('tab', { name: 'General' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(window.getByLabel('Nombre del negocio')).toHaveValue('Abastecedor Nuevo Amanecer');

  // Validación: correo inválido no se guarda.
  await window.getByLabel('Correo del negocio').fill('no-es-correo');
  await window.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(window.getByText('El correo no es válido.')).toBeVisible();

  await window.getByLabel('Nombre del negocio').fill('Súper La Esquina');
  await window.getByLabel('Correo del negocio').fill('info@laesquina.cr');
  await window.getByLabel('Teléfono').fill('2222-3333');
  await window.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(window.getByRole('status')).toContainText('Datos del negocio guardados.');
  await saveEvidence(page, 'Configuracion', 'Configuracion-general-guardada.png');

  // Se ve de inmediato en la barra superior, y sigue después de recargar.
  await expect(page.locator('.topbar__title')).toHaveText('Súper La Esquina');
  await page.reload();
  await expect(page.getByLabel('Nombre del negocio')).toHaveValue('Súper La Esquina');

  // El login (sin sesión) muestra el nombre nuevo.
  const visitor = await browser.newContext();
  const login = await visitor.newPage();

  await login.goto('/login');
  await expect(login.getByText('Súper La Esquina · sistema de gestión')).toBeVisible();
  await visitor.close();
});

test('solo el administrador puede cambiar los datos del negocio', async ({ page }) => {
  await insertUser({
    name: 'Carlos Cajero',
    email: 'carlos@example.com',
    password: 'ClaveSegura123',
    role: 'CAJERO',
  });

  await login(page, 'carlos@example.com', 'ClaveSegura123');
  await expect(page).toHaveURL(/\/$/);

  // Puede leerlos (el comprobante los usa), pero no cambiarlos.
  expect((await page.request.get(`${BACKEND_URL}/api/business`)).status()).toBe(200);

  const change = await page.request.put(`${BACKEND_URL}/api/business`, {
    headers: { Origin: FRONTEND_URL },
    data: { name: 'Hackeado' },
  });

  expect(change.status()).toBe(403);

  await page.goto('/?config=general');
  await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
});
