import { expect, test, type Page } from '@playwright/test';
import { saveEvidence } from '../support/evidence';
import { E2E_OWNER, ensureOwner } from '../support/fixtures';

/**
 * HU-11 y HU-12 (issues #12 y #13): el personal entra con un nombre de usuario
 * generado de su nombre, sin necesitar correo. Un solo campo en el login,
 * «Correo o usuario», sirve para todos los roles. Navegador real + backend real
 * + PostgreSQL de pruebas.
 */

const NEW_PASSWORD = 'MiClaveDeCaja2026';

async function login(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo o usuario').fill(login);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function logout(page: Page): Promise<void> {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Crea a alguien del personal sin correo y devuelve su usuario y su contraseña temporal. */
async function createStaff(
  page: Page,
  name: string,
): Promise<{ username: string; temporary: string }> {
  await page.goto('/?config=usuarios');
  await page.getByRole('button', { name: '+ Nuevo usuario' }).click();

  const dialog = page.getByRole('dialog', { name: 'Nuevo usuario' });

  await dialog.getByLabel('Nombre').fill(name);
  // El usuario se sugiere solo, a partir del nombre.
  await expect(dialog.getByLabel('Usuario')).not.toHaveValue('');
  await expect(dialog.getByText('(opcional)')).toBeVisible();
  await dialog.getByLabel('Rol').selectOption('CAJERO');

  const suggested = await dialog.getByLabel('Usuario').inputValue();

  await dialog.getByRole('button', { name: 'Crear usuario' }).click();

  const created = page.getByRole('dialog', { name: 'Usuario creado' });

  await expect(created.getByLabel('Usuario')).toHaveText(suggested);

  const temporary = (await created.getByLabel('Contraseña temporal').textContent()) ?? '';

  return { username: suggested, temporary };
}

test.beforeEach(async () => {
  await ensureOwner();
});

test('HU-12: el Cajero se crea sin correo con un usuario sugerido; si se repite, lleva un número', async ({
  page,
}) => {
  await login(page, E2E_OWNER.email, E2E_OWNER.password);
  await expect(page).toHaveURL(/\/$/);

  const first = await createStaff(page, 'Juan Navarro');

  expect(first.username).toBe('jnavarro');
  await saveEvidence(page, 'HU-12', 'HU-12-usuario-generado.png');
  await page.getByRole('button', { name: 'Listo' }).click();

  const second = await createStaff(page, 'Julia Navarro');

  expect(second.username).toBe('jnavarro2');
  await page.getByRole('button', { name: 'Listo' }).click();

  // En la lista se ve el usuario de cada uno.
  await expect(page.getByRole('row', { name: /Julia Navarro/ })).toContainText('jnavarro2');
});

test('HU-11: el Cajero entra con su usuario (sin importar mayúsculas) y debe cambiar la temporal', async ({
  page,
}) => {
  await login(page, E2E_OWNER.email, E2E_OWNER.password);
  await expect(page).toHaveURL(/\/$/);

  const { temporary } = await createStaff(page, 'Juan Navarro');

  await page.getByRole('button', { name: 'Listo' }).click();
  await logout(page);

  await login(page, 'JNavarro', temporary);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText('Usuario: jnavarro')).toBeVisible();

  await page.getByLabel('Nueva contraseña', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirmar nueva contraseña').fill(NEW_PASSWORD);
  await page.getByLabel('Contraseña actual').fill(temporary);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil actualizado correctamente.');
  await logout(page);

  await login(page, 'jnavarro', NEW_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await saveEvidence(page, 'HU-11', 'HU-11-entra-con-usuario.png');

  // Un usuario que no existe da el mismo mensaje que una contraseña incorrecta.
  await logout(page);
  await login(page, 'nadie', NEW_PASSWORD);
  await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos.');
});
