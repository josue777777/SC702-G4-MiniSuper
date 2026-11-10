import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';

/**
 * HU-23 — Sugerencia de pedido por stock bajo.
 * Navegador real + backend real + PostgreSQL de pruebas.
 */

async function setMinStock(minimums: Record<string, number>): Promise<void> {
  await withDb(async (client) => {
    for (const [code, minStock] of Object.entries(minimums)) {
      await client.query('UPDATE "Product" SET "minStock" = $1 WHERE code = $2', [minStock, code]);
    }
  });
}

async function openSuggestions(page: Page) {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Sugerencia de pedido' }).click();

  return page.getByRole('dialog', { name: 'Sugerencia de pedido' });
}

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'B001',
      name: 'Café molido 500 g',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.00',
      stock: 1,
      supplier: 'Distribuidora Central',
    },
    {
      code: 'B002',
      name: 'Jugo de naranja 1 L',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.00',
      stock: 10,
      supplier: 'Distribuidora Central',
    },
    {
      code: 'G001',
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '900.00',
      cost: '700.00',
      stock: 2,
      supplier: 'Granos del Valle',
    },
    {
      code: 'G002',
      name: 'Sal 1 kg',
      category: 'Granos',
      price: '400.00',
      cost: '250.00',
      stock: 0,
      supplier: null,
    },
  ]);
});

test('agrupa por proveedor, permite ajustar la cantidad y genera el pedido', async ({ page }) => {
  await setMinStock({ B001: 3, B002: 3, G001: 2, G002: 1 });

  const dialog = await openSuggestions(page);
  const central = dialog.getByRole('region', { name: 'Distribuidora Central' });
  const granos = dialog.getByRole('region', { name: 'Granos del Valle' });
  const noSupplier = dialog.getByRole('region', { name: 'Sin proveedor' });

  // Sugerido = mínimo × 2 − stock; el jugo está sobre su mínimo y no aparece.
  await expect(central.getByLabel('Cantidad de Café molido 500 g')).toHaveValue('5');
  await expect(granos.getByLabel('Cantidad de Arroz 1 kg')).toHaveValue('2');
  await expect(noSupplier).toContainText('Sal 1 kg');
  await expect(dialog).not.toContainText('Jugo de naranja 1 L');
  await saveEvidence(page, 'HU-23', 'HU-23-sugerencia-agrupada.png');

  await central.getByLabel('Cantidad de Café molido 500 g').fill('8');
  await central.getByRole('button', { name: 'Generar pedido' }).click();

  await expect(dialog.getByRole('status')).toContainText('PED-0001 a Distribuidora Central');
  // Lo pedido queda pendiente: ese proveedor sale de la sugerencia.
  await expect(central).toBeHidden();
  await expect(granos).toBeVisible();

  const items = await withDb(async (client) => {
    const result = await client.query<{ code: string; quantity: number; status: string }>(
      `SELECT p.code, i.quantity, o.status FROM "PurchaseOrderItem" i
       JOIN "PurchaseOrder" o ON o.id = i."purchaseOrderId" JOIN "Product" p ON p.id = i."productId"`,
    );

    return result.rows;
  });

  expect(items).toEqual([{ code: 'B001', quantity: 8, status: 'PENDING' }]);
  await saveEvidence(page, 'HU-23', 'HU-23-pedido-generado.png');
});

test('sin productos bajo el mínimo informa que no hay sugerencias', async ({ page }) => {
  const dialog = await openSuggestions(page);

  await expect(dialog.getByRole('status')).toContainText('no hay sugerencias de pedido pendientes');
  await expect(dialog.getByRole('table')).toHaveCount(0);
  await saveEvidence(page, 'HU-23', 'HU-23-sin-sugerencias.png');
});
