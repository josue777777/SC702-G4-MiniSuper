import { expect, test, type Page } from '@playwright/test';
import { insertUser, readUsers } from '../support/db';
import { BACKEND_URL, FRONTEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { E2E_ADMIN, E2E_OWNER, ensureOwner } from '../support/fixtures';

/**
 * Usuarios y roles: criterios adicionales de HU-11 a HU-15 (issues #12 a #16),
 * con la plataforma multi-negocio (ADR 0002). Navegador real + backend real +
 * PostgreSQL de pruebas. La Encargada del negocio de pruebas y el
 * Administrador de la plataforma se preparan en la base, como `npm run db:seed`.
 */

const NEW_PASSWORD = 'MiClavePropia123';

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Entra como la Encargada del negocio y espera el panel antes de navegar. */
async function loginAsOwner(page: Page): Promise<void> {
  await login(page, E2E_OWNER.email, E2E_OWNER.password);
  await expect(page).toHaveURL(/\/$/);
}

/** Entra como Administrador de la plataforma: su inicio son los negocios clientes. */
async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, E2E_ADMIN.email, E2E_ADMIN.password);
  await expect(page).toHaveURL(/\/platform\/businesses$/);
}

async function logout(page: Page): Promise<void> {
  // Con la ventana de Configuración abierta, lo de atrás no se puede usar.
  await page.goto('/profile');
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
  expect(await readUsers()).toHaveLength(2);
});

test('la Encargada crea un Cajero; este cambia la contraseña temporal y solo ve lo suyo', async ({
  page,
}) => {
  await loginAsOwner(page);
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

  // Menú del Cajero: Ventas y Clientes sí; Pedidos no.
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await expect(menu.getByRole('button', { name: 'Salidas' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Entradas' })).toHaveCount(0);
  await saveEvidence(page, 'HU-11', 'HU-11-menu-cajero.png');

  // Configuración: el Cajero solo tiene su Apariencia.
  await menu.getByRole('button', { name: 'Configuración' }).click();

  const settings = page.getByRole('dialog', { name: 'Configuración' });

  await expect(settings.getByRole('tab')).toHaveText(['Apariencia']);
  await page.goto('/');

  // Escribir la dirección a mano no sirve: la pantalla y la API lo bloquean.
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await saveEvidence(page, 'HU-11', 'HU-11-acceso-no-permitido.png');

  const api = await page.request.get(`${BACKEND_URL}/api/purchase-orders`);

  expect(api.status()).toBe(403);
  expect((await page.request.get(`${BACKEND_URL}/api/sales`)).status()).toBe(200);
});

test('la Encargada (dueña del negocio) administra a Cajero y Bodega, nunca a su rango o mayor', async ({
  page,
}) => {
  await loginAsOwner(page);

  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await expect(menu.getByRole('button', { name: 'Entradas' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Salidas' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Negocios' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Configuración' }).click();

  const settings = page.getByRole('dialog', { name: 'Configuración' });

  await expect(settings.getByRole('tab')).toHaveText(['General', 'Usuarios', 'Apariencia']);
  await settings.getByRole('tab', { name: 'Usuarios' }).click();

  // No ve al Administrador de la plataforma; solo puede asignar Cajero o Bodega.
  await expect(settings.getByRole('row', { name: /Plataforma de Prueba/ })).toHaveCount(0);
  await settings.getByRole('button', { name: '+ Nuevo usuario' }).click();
  await expect(page.getByLabel('Rol').locator('option')).toHaveText(['Cajero', 'Bodega']);
  await saveEvidence(page, 'HU-12', 'HU-12-encargado-roles-permitidos.png');

  await page.getByRole('button', { name: 'Cancelar' }).click();

  const temporaryPassword = await createUserFromUi(page, {
    name: 'Bea Bodega',
    email: 'bea@example.com',
    role: 'Bodega',
  });

  expect(temporaryPassword).toHaveLength(12);

  // Aunque se salte la pantalla, el servidor no deja crear otro Encargado.
  const peer = await page.request.post(`${BACKEND_URL}/api/users`, {
    headers: { Origin: FRONTEND_URL },
    data: { name: 'Otro Encargado', email: 'otro@example.com', role: 'ENCARGADO' },
  });

  expect(peer.status()).toBe(403);
  // Ni entrar a la plataforma.
  expect((await page.request.get(`${BACKEND_URL}/api/platform/businesses`)).status()).toBe(403);
  expect((await page.request.get(`${BACKEND_URL}/api/business`)).status()).toBe(200);
});

test('plan: con el plan lleno la Encargada pide más usuarios, la plataforma aprueba y ella los crea', async ({
  page,
}) => {
  // La plataforma deja el plan en «solo Encargado».
  await loginAsAdmin(page);
  await page
    .getByRole('row', { name: /Abastecedor Nuevo Amanecer/ })
    .getByRole('button', { name: 'Cambiar plan' })
    .click();
  await page.getByLabel('Usuarios adicionales al Encargado').fill('0');
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.getByRole('row', { name: /Abastecedor Nuevo Amanecer/ })).toContainText(
    'Solo Encargado',
  );
  await logout(page);

  // La Encargada no puede crear más usuarios…
  await loginAsOwner(page);
  await page.goto('/?config=usuarios');
  await expect(page.getByText(/Usuarios activos del plan: 1 de 1/)).toBeVisible();

  const temporary = await createUserFromUi(page, {
    name: 'Una Más',
    email: 'una@example.com',
    role: 'Cajero',
  }).catch(() => null);

  expect(temporary).toBeNull();
  await expect(page.getByRole('alert')).toContainText('El plan permite 1 usuario activo');
  await saveEvidence(page, 'HU-12', 'HU-12-plan-lleno.png');

  // …así que pide 2 más, con la cotización mensual.
  await page.goto('/?config=general');
  await page.getByRole('button', { name: 'Solicitar más usuarios' }).click();
  await page.getByLabel('Usuarios adicionales').fill('2');
  await expect(page.getByRole('dialog', { name: 'Solicitar más usuarios' })).toContainText(
    /₡10\s000,00/,
  );
  await page.getByLabel('Nota (opcional)').fill('Un cajero para la tarde y uno de bodega.');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByText(/Solicitud enviada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solicitar más usuarios' })).toBeDisabled();
  await saveEvidence(page, 'Plataforma', 'Plataforma-solicitud-enviada.png');
  await logout(page);

  // La solicitud llega a la bandeja de la plataforma, que la aprueba.
  await loginAsAdmin(page);

  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await expect(menu.getByRole('link', { name: /Solicitudes/ })).toContainText('1');
  await menu.getByRole('link', { name: /Solicitudes/ }).click();

  const row = page.getByRole('row', { name: /Abastecedor Nuevo Amanecer/ });

  await expect(row).toContainText('+2');
  await expect(row).toContainText(/₡10\s000,00/);
  await saveEvidence(page, 'Plataforma', 'Plataforma-bandeja-solicitudes.png');
  await row.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByLabel('Respuesta para el Encargado (opcional)').fill('Aprobado desde hoy.');
  await page
    .getByRole('dialog', { name: 'Aprobar solicitud' })
    .getByRole('button', { name: 'Aprobar' })
    .click();
  await expect(page.getByRole('status')).toContainText('ya puede crear 2 usuario(s) más');
  await logout(page);

  // Con el plan ampliado, la Encargada crea los usuarios ella misma.
  await loginAsOwner(page);
  await page.goto('/?config=general');
  await expect(page.getByText(/Usuarios activos: 1 de 3/)).toBeVisible();
  await expect(page.getByRole('row', { name: /Aprobada/ })).toContainText('Aprobado desde hoy.');
  await page.getByRole('tab', { name: 'Usuarios' }).click();
  await createUserFromUi(page, { name: 'Una Más', email: 'una@example.com', role: 'Cajero' });
});

test('Apariencia: cada usuario elige su color y tamaño, y no afecta a los demás', async ({
  page,
}) => {
  await insertUser({
    name: 'Carlos Cajero',
    email: 'carlos@example.com',
    password: 'ClaveSegura123',
    role: 'CAJERO',
  });

  await login(page, 'carlos@example.com', 'ClaveSegura123');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/?config=apariencia');
  await page.getByRole('radio', { name: 'Verde' }).check();
  await page.getByRole('radio', { name: /Grande/ }).check();

  // Vista previa al instante, antes de guardar.
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'verde');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Apariencia guardada.')).toBeVisible();
  await saveEvidence(page, 'Configuracion', 'Configuracion-apariencia-cajero.png');

  // Se conserva al recargar (vive en su cuenta).
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'verde');
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'grande');
  await logout(page);

  // La Encargada sigue con la de fábrica.
  await loginAsOwner(page);
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'azul');
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

  await loginAsOwner(page);
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

test('HU-13: la Encargada restablece una contraseña olvidada con una temporal', async ({
  page,
}) => {
  await insertUser({
    name: 'Carlos Cajero',
    email: 'carlos@example.com',
    password: 'ClaveOlvidada123',
    role: 'CAJERO',
  });

  await loginAsOwner(page);
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

test('la Encargada no puede quitarse su propio rol ni desactivarse', async ({ page }) => {
  await loginAsOwner(page);
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

test('Configuración › General: la Encargada cambia los datos de su negocio y se ven en el sistema', async ({
  page,
  browser,
}) => {
  await loginAsOwner(page);
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

  // Se ve de inmediato debajo del nombre del sistema, y sigue después de recargar.
  await expect(page.locator('.topbar__title')).toHaveText('Súper La Esquina');
  await expect(page.locator('.layout__brand')).toContainText('MiniSuper');
  await expect(page.locator('.layout__brand')).toContainText('Súper La Esquina');
  await page.reload();
  await expect(page.getByLabel('Nombre del negocio')).toHaveValue('Súper La Esquina');

  // El nombre del sistema es de la plataforma: el login no cambia.
  const visitor = await browser.newContext();
  const login = await visitor.newPage();

  await login.goto('/login');
  await expect(login.getByText('MiniSuper · sistema de gestión')).toBeVisible();
  await visitor.close();
});

test('el Cajero no puede cambiar los datos del negocio', async ({ page }) => {
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

test('plataforma: el Administrador crea un negocio con su Encargado y no ve datos de ningún negocio', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);

  // Su menú es solo la plataforma.
  const menu = page.getByRole('navigation', { name: 'Navegación principal' });

  await expect(menu.getByRole('link')).toHaveText(['Negocios', 'Solicitudes']);
  await expect(menu.getByRole('button', { name: 'Salidas' })).toHaveCount(0);
  await expect(page.locator('.layout__brand')).toContainText('Plataforma');

  await page.getByRole('button', { name: '+ Nuevo negocio' }).click();
  await page.getByLabel('Nombre del negocio').fill('Pulpería La Central');
  await page.getByLabel('Usuarios adicionales al Encargado').fill('1');
  await page.getByLabel('Nombre', { exact: true }).fill('Mario Encargado');
  await page.getByLabel('Correo electrónico').fill('mario@example.com');
  await page.getByRole('button', { name: 'Crear negocio' }).click();

  const temporary = page.getByLabel('Contraseña temporal');

  await expect(temporary).toBeVisible();

  const temporaryPassword = (await temporary.textContent()) ?? '';

  await saveEvidence(page, 'Plataforma', 'Plataforma-negocio-creado.png');
  await page.getByRole('button', { name: 'Listo' }).click();

  const row = page.getByRole('row', { name: /Pulpería La Central/ });

  await expect(row).toContainText('Mario Encargado');
  await expect(row).toContainText('Encargado + 1');
  await expect(row).toContainText('1 de 2');

  // Configuración de la plataforma: sin datos ni logo de ningún negocio.
  await menu.getByRole('button', { name: 'Configuración' }).click();

  const settings = page.getByRole('dialog', { name: 'Configuración' });

  await expect(settings.getByRole('tab')).toHaveText(['Plataforma', 'Usuarios', 'Apariencia']);
  await expect(settings.getByLabel('Nombre del negocio')).toHaveCount(0);
  await saveEvidence(page, 'Plataforma', 'Plataforma-configuracion.png');

  // Ni por la API: los módulos del negocio le responden 403.
  for (const path of ['/api/products', '/api/sales', '/api/customers', '/api/business']) {
    expect((await page.request.get(`${BACKEND_URL}${path}`)).status()).toBe(403);
  }

  // El Encargado nuevo entra a SU negocio, vacío: no ve nada del otro.
  const other = await browser.newContext();
  const mario = await other.newPage();

  await login(mario, 'mario@example.com', temporaryPassword);
  await expect(mario).toHaveURL(/\/profile$/);
  await mario.getByLabel('Nueva contraseña', { exact: true }).fill(NEW_PASSWORD);
  await mario.getByLabel('Confirmar nueva contraseña').fill(NEW_PASSWORD);
  await mario.getByLabel('Contraseña actual').fill(temporaryPassword);
  await mario.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(mario.getByRole('status')).toContainText('Perfil actualizado correctamente.');
  await expect(mario.locator('.layout__brand')).toContainText('Pulpería La Central');

  const users = await mario.request.get(`${BACKEND_URL}/api/users`);
  const { data } = (await users.json()) as { data: { email: string }[] };

  expect(data.map((user) => user.email)).toEqual(['mario@example.com']);
  await other.close();
});

test('plataforma: solo el Administrador cambia el nombre del sistema, y lo ven todos', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await page.goto('/platform/businesses?config=plataforma');
  await page.getByLabel('Nombre del sistema').fill('TiendaFácil');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Configuración de la plataforma guardada.')).toBeVisible();
  await expect(page.locator('.layout__brand')).toContainText('TiendaFácil');

  const visitor = await browser.newContext();
  const loginPage = await visitor.newPage();

  await loginPage.goto('/login');
  await expect(loginPage.getByText('TiendaFácil · sistema de gestión')).toBeVisible();
  await visitor.close();

  // La Encargada lo ve, pero no puede cambiarlo.
  await logout(page);
  await loginAsOwner(page);
  await expect(page.locator('.layout__brand')).toContainText('TiendaFácil');

  const change = await page.request.put(`${BACKEND_URL}/api/platform/settings`, {
    headers: { Origin: FRONTEND_URL },
    data: { systemName: 'Mío', pricePerExtraUser: '1' },
  });

  expect(change.status()).toBe(403);
});

test('plataforma: con el negocio suspendido su gente no entra; al reactivarlo, sí', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);

  const row = page.getByRole('row', { name: /Abastecedor Nuevo Amanecer/ });

  await row.getByRole('button', { name: 'Suspender' }).click();
  await page
    .getByRole('dialog', { name: 'Suspender negocio' })
    .getByRole('button', { name: 'Suspender' })
    .click();
  await expect(row).toContainText('Suspendido');

  const other = await browser.newContext();
  const owner = await other.newPage();

  await login(owner, E2E_OWNER.email, E2E_OWNER.password);
  await expect(owner.getByRole('alert')).toContainText('suspendido');
  await saveEvidence(owner, 'Plataforma', 'Plataforma-negocio-suspendido.png');

  await row.getByRole('button', { name: 'Reactivar' }).click();
  await page
    .getByRole('dialog', { name: 'Reactivar negocio' })
    .getByRole('button', { name: 'Reactivar' })
    .click();
  await expect(row).toContainText('Activo');

  await login(owner, E2E_OWNER.email, E2E_OWNER.password);
  await expect(owner).toHaveURL(/\/$/);
  await other.close();
});

/** PNG de 1×1 válido. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('Configuración › General: la Encargada sube el logo de su negocio y se ve en el menú', async ({
  page,
}) => {
  await loginAsOwner(page);
  await page.goto('/?config=general');
  await page
    .getByLabel('Archivo del logo')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByText('Logo actualizado.')).toBeVisible();
  await expect(page.getByAltText('Logo actual del negocio')).toBeVisible();
  await expect(page.locator('.layout__brand-logo')).toBeVisible();
});
