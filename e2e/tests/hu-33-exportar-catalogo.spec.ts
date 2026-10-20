import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { OUTPUT_DIR } from '../support/env';
import { saveEvidence } from '../support/evidence';
import { resetCatalog, seedProducts, signInAsOwner } from '../support/fixtures';

/**
 * HU-33 — Exportar catálogo de productos (issue #33).
 * Navegador real + backend real + PostgreSQL de pruebas; la descarga es real.
 */

const HEADERS = ['Código', 'Nombre', 'Categoría', 'Precio', 'Costo', 'Stock', 'Proveedor'];
const FORMULA_NAME = '=HYPERLINK("http://malo.example")';

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await resetCatalog();
  await seedProducts([
    {
      code: 'B001',
      name: 'Café molido 500 g',
      category: 'Bebidas',
      price: '1234.50',
      cost: '999.05',
      stock: 12,
      supplier: 'Distribuidora Central',
    },
    {
      code: 'B002',
      name: 'Jugo de naranja 1 L',
      category: 'Bebidas',
      price: '1500.00',
      cost: '1000.00',
      stock: 4,
      supplier: 'Distribuidora Central',
    },
    {
      code: 'G001',
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '900.00',
      cost: '700.00',
      stock: 30,
      supplier: 'Granos del Valle',
    },
    {
      code: 'G002',
      name: FORMULA_NAME,
      category: 'Granos',
      price: '100.00',
      cost: '50.00',
      stock: 1,
      supplier: null,
    },
    {
      code: 'B999',
      name: 'Producto desactivado',
      category: 'Bebidas',
      price: '10.00',
      cost: '5.00',
      stock: 0,
      supplier: null,
      isActive: false,
    },
  ]);
});

async function openInventory(page: Page): Promise<void> {
  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: /Exportar a Excel/ })).toBeEnabled();
  await expect(page.getByText('Café molido 500 g')).toBeVisible();
}

async function downloadRows(download: Download) {
  const filePath = path.join(OUTPUT_DIR, 'downloads', download.suggestedFilename());

  await download.saveAs(filePath);

  const bytes = readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

  const rows: (string | number | null)[][] = [];

  workbook.worksheets[0]?.eachRow((row) => {
    rows.push((row.values as (string | number | null)[]).slice(1));
  });

  return { bytes, rows };
}

test('exporta el catálogo activo completo a un .xlsx válido', async ({ page }) => {
  await openInventory(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar a Excel/ }).click(),
  ]);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

  expect(download.suggestedFilename()).toBe(`catalogo-productos-${today}.xlsx`);

  const { bytes, rows } = await downloadRows(download);

  // Un .xlsx es un ZIP: empieza con "PK".
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(rows[0]).toEqual(HEADERS);
  // 4 activos más el encabezado; el desactivado no se exporta.
  expect(rows).toHaveLength(5);
  expect(rows.map((row) => row[0])).not.toContain('B999');

  const coffee = rows.find((row) => row[0] === 'B001');

  expect(coffee).toEqual([
    'B001',
    'Café molido 500 g',
    'Bebidas',
    1234.5,
    999.05,
    12,
    'Distribuidora Central',
  ]);

  // Sin proveedor: celda vacía. La fórmula en el nombre queda como texto inerte.
  const formula = rows.find((row) => row[0] === 'G002');

  expect(formula?.[1]).toBe(`'${FORMULA_NAME}`);
  expect(formula?.[6]).toBeFalsy();

  await expect(page.getByRole('status').filter({ hasText: 'Catálogo exportado' })).toContainText(
    `catalogo-productos-${today}.xlsx`,
  );
  await saveEvidence(page, 'HU-33', 'HU-33-exportacion-catalogo.png');
});

test('exporta solo la categoría elegida en el filtro', async ({ page }) => {
  await openInventory(page);
  await page.getByLabel('Categoría').selectOption({ label: 'Granos' });
  await expect(page.getByText('Arroz 1 kg')).toBeVisible();
  await expect(page.getByText('Café molido 500 g')).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar a Excel/ }).click(),
  ]);
  const { rows } = await downloadRows(download);

  expect(rows[0]).toEqual(HEADERS);
  expect(
    rows
      .slice(1)
      .map((row) => row[0])
      .sort(),
  ).toEqual(['G001', 'G002']);
  expect(rows.slice(1).every((row) => row[2] === 'Granos')).toBe(true);
  await saveEvidence(page, 'HU-33', 'HU-33-exportacion-por-categoria.png');
});

test('sin productos muestra un mensaje claro y no descarga ningún archivo', async ({ page }) => {
  await resetCatalog();
  await page.goto('/inventory');

  let downloads = 0;

  page.on('download', () => (downloads += 1));

  await page.getByRole('button', { name: /Exportar a Excel/ }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'No hay productos activos para exportar.' }),
  ).toBeVisible();
  expect(downloads).toBe(0);
  await saveEvidence(page, 'HU-33', 'HU-33-catalogo-vacio.png');
});
