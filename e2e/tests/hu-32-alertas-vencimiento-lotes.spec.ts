import { expect, test, type Page } from '@playwright/test';
import { withDb } from '../support/db';
import { BACKEND_URL } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner, stockOf } from '../support/fixtures';

/**
 * HU-32 — Alerta de productos próximos a vencer, por LOTE. El panel avisa por
 * cada lote con unidades que vence pronto: dice el lote, su fecha y cuántas
 * unidades quedan de él. Un lote lejano de vencer no alerta aunque otro del
 * mismo producto sí; cuando las unidades de un lote se agotan (venta o
 * retiro), su alerta desaparece aunque queden otros lotes; un producto
 * vencido que ya se retiró del inventario deja de alertar.
 */

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'LEC-01',
      name: 'Leche entera 1 L',
      category: 'Lácteos',
      price: '900.00',
      cost: '650.00',
      stock: 0,
      supplier: null,
      perishable: true,
    },
    {
      code: 'YOG-01',
      name: 'Yogur natural',
      category: 'Lácteos',
      price: '750.00',
      cost: '500.00',
      stock: 0,
      supplier: null,
      perishable: true,
    },
  ]);
});

/** Día de hoy en Costa Rica más `days` días, `YYYY-MM-DD`. */
function inDays(days: number): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const date = new Date(`${today}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/**
 * Deja al producto con estos lotes. Los lotes se insertan ANTES de subir el
 * stock, como hace una entrega: así el disparador encuentra la suma cuadrada.
 */
async function seedLots(
  code: string,
  lots: { lotNumber: string; days: number; quantity: number }[],
): Promise<string> {
  return withDb(async (client) => {
    const product = await client.query<{ id: string }>(`SELECT id FROM "Product" WHERE code = $1`, [
      code,
    ]);
    const id = product.rows[0]?.id ?? '';

    for (const lot of lots) {
      await client.query(
        `INSERT INTO "ProductLot"(id, "productId", "lotNumber", "expirationDate", quantity, "receivedQuantity")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $4)`,
        [id, lot.lotNumber, inDays(lot.days), lot.quantity],
      );
    }

    await client.query(`UPDATE "Product" SET stock = $2 WHERE id = $1`, [
      id,
      lots.reduce((sum, lot) => sum + lot.quantity, 0),
    ]);

    return id;
  });
}

function urgentSection(page: Page) {
  return page.getByRole('region', { name: 'Lo urgente hoy' });
}

test('dos lotes, uno a 10 días y otro a 60: solo alerta el próximo, con su lote, fecha y unidades', async ({
  page,
}) => {
  await seedLots('LEC-01', [
    { lotNumber: 'L-10', days: 10, quantity: 6 },
    { lotNumber: 'L-60', days: 60, quantity: 12 },
  ]);
  await page.goto('/');

  const card = urgentSection(page).getByRole('article', {
    name: '1 producto vence en menos de 15 días',
  });

  await expect(card).toContainText('Leche entera 1 L');
  await card.getByRole('button', { name: 'Ver por vencer' }).click();

  const list = page.getByRole('dialog', { name: 'Vencidos y por vencer' });
  const rows = list.getByRole('table').locator('tbody tr');

  // Una sola fila: el lote L-10 con sus 6 unidades (el producto tiene 18).
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('L-10');
  await expect(rows.first()).toContainText('Próximo a vencer: 10 días');
  await expect(list.getByRole('columnheader')).toContainText([
    'Código',
    'Producto',
    'Stock',
    'Lote',
    'Unidades del lote',
    'Vence',
    'Estado',
  ]);
  await expect(rows.first().locator('td').nth(2)).toHaveText('18');
  await expect(rows.first().locator('td').nth(4)).toHaveText('6');
  await expect(list).not.toContainText('L-60');
  await saveEvidence(page, 'HU-32', 'alerta-por-lote.png');
});

test('cuando el lote se agota por un retiro, su alerta desaparece aunque queden otros lotes', async ({
  page,
}) => {
  const id = await seedLots('LEC-01', [
    { lotNumber: 'L-10', days: 10, quantity: 6 },
    { lotNumber: 'L-60', days: 60, quantity: 12 },
  ]);

  await page.goto('/');
  await expect(
    urgentSection(page).getByRole('article', { name: '1 producto vence en menos de 15 días' }),
  ).toBeVisible();

  // Se retiran las 6 unidades del lote L-10 (egreso «Vencido / descartado»).
  const lots = await page.request.get(`${BACKEND_URL}/api/kardex/products/${id}/lots`);
  const l10 = ((await lots.json()) as { data: { id: string; lotNumber: string }[] }).data.find(
    (lot) => lot.lotNumber === 'L-10',
  );
  const exit = await page.request.post(`${BACKEND_URL}/api/kardex/products/${id}/exits`, {
    data: { concept: 'EXPIRED', documentNumber: '44', lotId: l10?.id, quantity: 6 },
  });

  expect(exit.status()).toBe(201);
  expect(await stockOf('LEC-01')).toBe(12);

  await page.reload();
  await expect(urgentSection(page).getByRole('status')).toContainText('¡Está al día!');
  await saveEvidence(page, 'HU-32', 'lote-agotado-sin-alerta.png');
});

test('un producto vencido que ya se retiró del inventario deja de alertar', async ({ page }) => {
  await seedLots('YOG-01', [{ lotNumber: 'Y-1', days: -3, quantity: 2 }]);
  await page.goto('/');

  const expired = urgentSection(page).getByRole('article', { name: '1 producto vencido' });

  await expect(expired).toContainText('Yogur natural');

  // Se retira (una venta o un conteo que lo deja en 0 también sirven).
  await withDb((client) => client.query(`UPDATE "Product" SET stock = 0 WHERE code = 'YOG-01'`));
  await page.reload();
  await expect(
    urgentSection(page).getByRole('article', { name: '1 producto vencido' }),
  ).toHaveCount(0);
});
