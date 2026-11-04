import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  expect,
  type Browser,
  type BrowserContext,
  type Download,
  type Page,
} from '@playwright/test';
import ExcelJS from 'exceljs';
import { E2E_BUSINESS_ID, insertUser, withDb, type E2EUser } from './db';
import { OUTPUT_DIR } from './env';
import { seedProducts, signInVia } from './fixtures';

/**
 * Soporte de las pruebas E2E de los reportes comerciales (HU-28, HU-29, HU-30):
 * un escenario sintético reproducible, un segundo negocio para el aislamiento y
 * lectores de la pantalla y del Excel descargado.
 *
 * Todo ocurre en marzo de 2024 (hora de Costa Rica): un mes pasado, para que el
 * período inicial de la pantalla (el mes actual) siempre salga vacío y los
 * resultados no dependan de la fecha en que corra la prueba.
 */

export const PERIOD = { from: '2024-03-01', to: '2024-03-31' };

// --- Fechas y dinero -------------------------------------------------------

/** `2024-03-10T12:00:00` en hora de Costa Rica (UTC−6) → ISO en UTC. */
const toUtc = (local: string) => new Date(`${local}-06:00`).toISOString();

/** `"1234.50"` → 123450. */
const asCents = (money: string) => Math.round(Number(money) * 100);

/** Texto en pantalla (`₡18.269,00`, `-₡100,00`) → céntimos (1826900, -10000). */
export function centsOf(text: string): number {
  const digits = text.replace(/\D/g, '');

  return (text.includes('-') ? -1 : 1) * Number(digits);
}

// --- Datos -----------------------------------------------------------------

export interface SeedLine {
  code: string;
  quantity: number;
  /** Precio y costo HISTÓRICOS de la línea. */
  unitPrice: string;
  unitCost: string;
  /** Unidades devueltas de esta línea. */
  returned?: number;
}

export interface SeedSale {
  /** Hora de Costa Rica: `YYYY-MM-DDTHH:mm:ss`. */
  at: string;
  payment?: 'CASH' | 'CARD' | 'CREDIT';
  customerId?: string;
  /** Anulada: el total queda en 0 y todas sus líneas devueltas. */
  void?: boolean;
  /** Abono ligado a ESTA venta. */
  linkedPayment?: string;
  lines: SeedLine[];
  businessId?: string;
}

/**
 * Inserta una venta con las MISMAS consecuencias que dejan una devolución o una
 * anulación en el sistema real: `Sale.total` baja, el estado cambia y queda el
 * ajuste con sus líneas. Devuelve el número de venta.
 */
export async function seedSale(sale: SeedSale): Promise<number> {
  return withDb(async (client) => {
    const businessId = sale.businessId ?? E2E_BUSINESS_ID;
    const returnedOf = (line: SeedLine) =>
      sale.void === true ? line.quantity : (line.returned ?? 0);
    const effective = sale.lines.reduce(
      (sum, line) => sum + asCents(line.unitPrice) * (line.quantity - returnedOf(line)),
      0,
    );
    const returnedAmount = sale.lines.reduce(
      (sum, line) => sum + asCents(line.unitPrice) * returnedOf(line),
      0,
    );
    const allReturned = sale.lines.every((line) => returnedOf(line) === line.quantity);
    const status =
      sale.void === true
        ? 'VOID'
        : allReturned
          ? 'RETURNED'
          : returnedAmount > 0
            ? 'PARTIALLY_RETURNED'
            : 'COMPLETED';

    const sequence = await client.query<{ number: number }>(
      `INSERT INTO "DocumentSequence"("businessId", kind, "next") VALUES ($1, 'SALE', 2)
       ON CONFLICT ("businessId", kind) DO UPDATE SET "next" = "DocumentSequence"."next" + 1
       RETURNING "next" - 1 AS number`,
      [businessId],
    );
    const number = sequence.rows[0]?.number ?? 0;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO "Sale"(id, number, "paymentMethod", status, total, "customerId", "businessId", "createdAt")
       VALUES (gen_random_uuid(), $1, $2::"PaymentMethod", $3::"SaleStatus", $4, $5, $6,
               ($7::timestamptz AT TIME ZONE 'UTC'))
       RETURNING id`,
      [
        number,
        sale.payment ?? 'CASH',
        status,
        (effective / 100).toFixed(2),
        sale.customerId ?? null,
        businessId,
        toUtc(sale.at),
      ],
    );
    const saleId = inserted.rows[0]?.id ?? '';
    const returns: { itemId: string; quantity: number }[] = [];

    for (const line of sale.lines) {
      const item = await client.query<{ id: string }>(
        `INSERT INTO "SaleItem"(id, "saleId", "productId", quantity, "unitPrice", "unitCost")
         SELECT gen_random_uuid(), $1, p.id, $3, $4, $5 FROM "Product" p
         WHERE p.code = $2 AND p."businessId" = $6
         RETURNING id`,
        [saleId, line.code, line.quantity, line.unitPrice, line.unitCost, businessId],
      );

      if (item.rows[0] === undefined) {
        throw new Error(`El producto ${line.code} no existe en el negocio de prueba.`);
      }

      if (returnedOf(line) > 0) {
        returns.push({ itemId: item.rows[0].id, quantity: returnedOf(line) });
      }
    }

    if (returns.length > 0) {
      const adjustment = await client.query<{ id: string }>(
        `INSERT INTO "SaleAdjustment"(id, "saleId", type, reason, total)
         VALUES (gen_random_uuid(), $1, $2::"SaleAdjustmentType", 'Dato de prueba', $3) RETURNING id`,
        [saleId, sale.void === true ? 'VOID' : 'RETURN', (returnedAmount / 100).toFixed(2)],
      );

      for (const returned of returns) {
        await client.query(
          `INSERT INTO "SaleAdjustmentItem"(id, "adjustmentId", "saleItemId", quantity)
           VALUES (gen_random_uuid(), $1, $2, $3)`,
          [adjustment.rows[0]?.id, returned.itemId, returned.quantity],
        );
      }
    }

    if (sale.linkedPayment !== undefined && sale.customerId !== undefined) {
      await seedPayment(sale.customerId, sale.linkedPayment, saleId);
    }

    return number;
  });
}

export async function seedPayment(
  customerId: string,
  amount: string,
  saleId: string | null = null,
): Promise<void> {
  await withDb((client) =>
    client.query(
      `INSERT INTO "CreditPayment"(id, "customerId", "saleId", amount) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [customerId, saleId, amount],
    ),
  );
}

export async function seedNamedCustomer(
  name: string,
  isActive = true,
  businessId = E2E_BUSINESS_ID,
): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO "Customer"(id, name, "isActive", "businessId", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id`,
      [name, isActive, businessId],
    );

    return result.rows[0]?.id ?? '';
  });
}

export interface Scenario {
  customers: { ana: string; beto: string; carla: string; zoila: string };
}

/**
 * Escenario común (marzo de 2024). El catálogo vale hoy ₡5.000 (costo ₡4.000)
 * a propósito: ninguna cifra de los reportes debe salir de ahí.
 *
 *   #1  contado   A1×3 (1 devuelta) @900 + B1×2 @1.234,50
 *   #2  tarjeta   ANULADA
 *   #3  contado   Z1×2 devueltas por completo
 *   #4  contado   B1 @1.500, a las 23:59:59 del 31 (último día)
 *   #5  contado   1 abr 00:00:00 y #7 29 feb 23:59:59: FUERA del período
 *   #6  contado   Z1×4 (producto desactivado), 1 mar 00:00:00 (primer día)
 *   #8  fiado Ana       A1 @1.000, sin abonos
 *   #9  fiado Ana       B1 @500, cubierto por un abono ligado a la venta
 *   #10 fiado Zoila     B1 @200 (clienta inactiva)
 *   #11 fiado Beto      B1×2 @400, 1 devuelta
 *   #12 fiado Carla     ANULADO
 *   #13 contado   M1×4 @2.500 (empata en unidades con Z1)
 */
export async function seedScenario(): Promise<Scenario> {
  await seedProducts([
    {
      code: 'A1',
      name: 'Arroz 1 kg',
      category: 'Granos',
      price: '5000.00',
      cost: '4000.00',
      stock: 50,
      supplier: null,
    },
    {
      code: 'B1',
      name: 'Café molido',
      category: 'Bebidas',
      price: '5000.00',
      cost: '4000.00',
      stock: 50,
      supplier: null,
    },
    {
      code: 'M1',
      name: 'Leche entera',
      category: 'Lácteos',
      price: '5000.00',
      cost: '4000.00',
      stock: 50,
      supplier: null,
    },
    {
      code: 'Z1',
      name: 'Producto descontinuado',
      category: 'Granos',
      price: '5000.00',
      cost: '4000.00',
      stock: 0,
      supplier: null,
      isActive: false,
    },
  ]);

  const customers = {
    ana: await seedNamedCustomer('Ana Fiadora'),
    beto: await seedNamedCustomer('Beto Cliente'),
    carla: await seedNamedCustomer('Carla Cliente'),
    zoila: await seedNamedCustomer('Zoila Inactiva', false),
  };

  await seedSale({
    at: '2024-03-10T12:00:00',
    lines: [
      { code: 'A1', quantity: 3, unitPrice: '900.00', unitCost: '700.00', returned: 1 },
      { code: 'B1', quantity: 2, unitPrice: '1234.50', unitCost: '999.05' },
    ],
  });
  await seedSale({
    at: '2024-03-11T12:00:00',
    payment: 'CARD',
    void: true,
    lines: [{ code: 'A1', quantity: 1, unitPrice: '900.00', unitCost: '700.00' }],
  });
  await seedSale({
    at: '2024-03-12T12:00:00',
    lines: [{ code: 'Z1', quantity: 2, unitPrice: '100.00', unitCost: '50.00', returned: 2 }],
  });
  await seedSale({
    at: '2024-03-31T23:59:59',
    lines: [{ code: 'B1', quantity: 1, unitPrice: '1500.00', unitCost: '1000.00' }],
  });
  await seedSale({
    at: '2024-04-01T00:00:00',
    lines: [{ code: 'A1', quantity: 1, unitPrice: '900.00', unitCost: '700.00' }],
  });
  await seedSale({
    at: '2024-03-01T00:00:00',
    lines: [{ code: 'Z1', quantity: 4, unitPrice: '100.00', unitCost: '50.00' }],
  });
  await seedSale({
    at: '2024-02-29T23:59:59',
    lines: [{ code: 'A1', quantity: 1, unitPrice: '900.00', unitCost: '700.00' }],
  });
  await seedSale({
    at: '2024-03-15T12:00:00',
    payment: 'CREDIT',
    customerId: customers.ana,
    lines: [{ code: 'A1', quantity: 1, unitPrice: '1000.00', unitCost: '700.00' }],
  });
  await seedSale({
    at: '2024-03-16T12:00:00',
    payment: 'CREDIT',
    customerId: customers.ana,
    linkedPayment: '500.00',
    lines: [{ code: 'B1', quantity: 1, unitPrice: '500.00', unitCost: '300.00' }],
  });
  await seedSale({
    at: '2024-03-17T12:00:00',
    payment: 'CREDIT',
    customerId: customers.zoila,
    lines: [{ code: 'B1', quantity: 1, unitPrice: '200.00', unitCost: '100.00' }],
  });
  await seedSale({
    at: '2024-03-18T12:00:00',
    payment: 'CREDIT',
    customerId: customers.beto,
    lines: [{ code: 'B1', quantity: 2, unitPrice: '400.00', unitCost: '250.00', returned: 1 }],
  });
  await seedSale({
    at: '2024-03-19T12:00:00',
    payment: 'CREDIT',
    customerId: customers.carla,
    void: true,
    lines: [{ code: 'B1', quantity: 1, unitPrice: '300.00', unitCost: '150.00' }],
  });
  await seedSale({
    at: '2024-03-20T12:00:00',
    lines: [{ code: 'M1', quantity: 4, unitPrice: '2500.00', unitCost: '1800.00' }],
  });

  return { customers };
}

// --- Segundo negocio (aislamiento) -----------------------------------------

export const OTHER_BUSINESS_ID = '0e2e0000-0000-4000-8000-000000000002';

/** Encargada de OTRO negocio, con los mismos códigos de producto. */
export const OTHER_OWNER: E2EUser = {
  name: 'Dueño Ajeno',
  email: 'dueno.ajeno@example.com',
  password: 'ClaveSegura123',
  role: 'ENCARGADO',
  businessId: OTHER_BUSINESS_ID,
};

export const CAJERO: E2EUser = {
  name: 'Cajera de Prueba',
  email: 'cajera.prueba@example.com',
  password: 'ClaveSegura123',
  role: 'CAJERO',
};

export const BODEGA: E2EUser = {
  name: 'Bodeguero de Prueba',
  email: 'bodeguero.prueba@example.com',
  password: 'ClaveSegura123',
  role: 'BODEGA',
};

/** Ventas de ₡99.999 y un fiado de ₡7.777 en otro negocio que NUNCA deben verse en el de las pruebas. */
export async function seedOtherBusiness(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Business"(id, name, "extraUsers", status, "updatedAt") VALUES ($1, 'Negocio Ajeno S.A.', 0, 'ACTIVE', now())`,
      [OTHER_BUSINESS_ID],
    );

    const category = await client.query<{ id: string }>(
      `INSERT INTO "Category"(id, name, "businessId", "updatedAt") VALUES (gen_random_uuid(), 'Granos', $1, now()) RETURNING id`,
      [OTHER_BUSINESS_ID],
    );

    await client.query(
      `INSERT INTO "Product"(id, code, name, price, cost, stock, "categoryId", "businessId", "updatedAt")
       VALUES (gen_random_uuid(), 'A1', 'Producto del negocio ajeno', 5000, 4000, 10, $1, $2, now())`,
      [category.rows[0]?.id, OTHER_BUSINESS_ID],
    );
  });

  const customer = await seedNamedCustomer('Cliente Ajeno', true, OTHER_BUSINESS_ID);

  await seedSale({
    businessId: OTHER_BUSINESS_ID,
    at: '2024-03-10T12:00:00',
    lines: [{ code: 'A1', quantity: 1, unitPrice: '99999.00', unitCost: '1.00' }],
  });
  await seedSale({
    businessId: OTHER_BUSINESS_ID,
    at: '2024-03-11T12:00:00',
    payment: 'CREDIT',
    customerId: customer,
    lines: [{ code: 'A1', quantity: 1, unitPrice: '7777.00', unitCost: '1.00' }],
  });
  await insertUser(OTHER_OWNER);
}

// --- Pantalla --------------------------------------------------------------

/** Navegador aparte con la sesión de otro usuario (misma base, cookies separadas). */
export async function openAs(
  browser: Browser,
  user: E2EUser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();

  await signInVia(context.request, user);

  return { context, page: await context.newPage() };
}

/** Errores de ejecución de la página (excepciones y `console.error`) hasta ahora. */
export function trackRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      errors.push(`console: ${message.text()}`);
    }
  });

  return errors;
}

/** Abre Reportes y elige el reporte comercial. */
export async function openReport(page: Page, tab: string): Promise<void> {
  await page.goto('/reports');
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/** Pulsa el botón del formulario y espera la respuesta REAL del servidor. */
export async function consult(page: Page, button = 'Generar reporte'): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/reports/commercial/') &&
        response.request().method() === 'GET',
    ),
    page.getByRole('button', { name: button, exact: true }).click(),
  ]);
}

export async function setPeriod(page: Page, from: string, to: string): Promise<void> {
  await page.getByLabel('Desde').fill(from);
  await page.getByLabel('Hasta').fill(to);
}

/**
 * Abre la explicación del reporte y sus notas técnicas: están plegadas para no
 * llenar la pantalla de texto, pero siguen completas a un clic.
 */
export async function openCalculationNotes(page: Page): Promise<void> {
  await page.getByText('ⓘ Cómo se calcula').click();
  await page.getByText('Notas técnicas').click();
}

/** Valor mostrado en el cuadro de total con esa etiqueta. */
export async function tile(page: Page, label: string): Promise<string> {
  const value = page.locator('.stat-tile', { hasText: label }).locator('.stat-tile__value');

  return (await value.textContent()) ?? '';
}

export async function tileCents(page: Page, label: string): Promise<number> {
  return centsOf(await tile(page, label));
}

export interface ScreenTable {
  headers: string[];
  rows: string[][];
}

/**
 * En pantalla, el reporte muestra gráficos; el detalle fila por fila está en
 * «Ver detalle», cerrado. Lo abre si hace falta.
 */
export async function openDetail(page: Page): Promise<void> {
  const summary = page.getByText(/^Ver detalle \(/);

  await expect(summary).toBeVisible();

  if ((await summary.locator('xpath=..').getAttribute('open')) === null) {
    await summary.click();
  }
}

/** Tabla del reporte tal como se ve. */
export async function readTable(page: Page, name: string): Promise<ScreenTable> {
  const table = page.getByRole('table', { name, exact: true });

  // Primero el reporte correcto (su título es el nombre de la tabla); después, su detalle.
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await openDetail(page);
  await expect(table).toBeVisible();

  const text = async (selector: string) =>
    (await table.locator(selector).allTextContents()).map((value) => value.trim());

  const headers = await text('thead th');
  const rows = await Promise.all(
    (await table.locator('tbody tr').all()).map(async (row) =>
      (await row.locator('td').allTextContents()).map((value) => value.trim()),
    ),
  );

  return { headers, rows };
}

// --- Excel descargado ------------------------------------------------------

export type Cell = string | number | null;

export interface DownloadedReport {
  fileName: string;
  /** Hoja «Resumen»: pares etiqueta/valor. */
  summary: Cell[][];
  /** Hoja «Datos»: encabezado y filas. */
  data: Cell[][];
  /** Cualquier hoja por su nombre (el reporte de inventario usa una por sección). */
  sheet: (name: string) => Cell[][];
}

export async function readDownload(download: Download): Promise<DownloadedReport> {
  const filePath = path.join(OUTPUT_DIR, 'downloads', download.suggestedFilename());

  await download.saveAs(filePath);

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(readFileSync(filePath) as unknown as ArrayBuffer);

  const rowsOf = (name: string) => {
    const rows: Cell[][] = [];

    workbook.getWorksheet(name)?.eachRow((row) => {
      rows.push((row.values as Cell[]).slice(1));
    });

    return rows;
  };

  return {
    sheet: rowsOf,
    fileName: download.suggestedFilename(),
    summary: rowsOf('Resumen'),
    data: rowsOf('Datos'),
  };
}

/** Valor de una fila de la hoja «Resumen» por su etiqueta. */
export function summaryValue(report: DownloadedReport, label: string): Cell | undefined {
  return report.summary.find((row) => row[0] === label)?.[1];
}

/**
 * Compara lo exportado con lo que se ve: mismos encabezados, mismas filas y
 * mismos importes (la pantalla los muestra con formato; el Excel como números).
 */
export function expectExportMatchesScreen(
  screen: ScreenTable,
  exported: DownloadedReport,
  moneyHeaders: string[],
): void {
  expect(exported.data[0]).toEqual(screen.headers);
  expect(exported.data).toHaveLength(screen.rows.length + 1);

  screen.rows.forEach((row, index) => {
    const exportedRow = exported.data[index + 1] ?? [];

    row.forEach((cell, column) => {
      const header = screen.headers[column] ?? '';
      const value = exportedRow[column];

      if (moneyHeaders.includes(header)) {
        expect(cell === '—' ? '' : centsOf(cell), `${header} fila ${index + 1}`).toBe(
          value === '' || value === null || value === undefined
            ? ''
            : Math.round(Number(value) * 100),
        );
      } else {
        expect(String(value ?? ''), `${header} fila ${index + 1}`).toBe(cell);
      }
    });
  });
}

// --- Consultas de apoyo ----------------------------------------------------

/** Id de una venta del negocio de las pruebas por su número. */
export async function saleIdByNumber(number: number): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Sale" WHERE number = $1 AND "businessId" = $2`,
      [number, E2E_BUSINESS_ID],
    );

    return result.rows[0]?.id ?? '';
  });
}

/** Id de un producto del negocio de las pruebas por su código. */
export async function productIdByCode(code: string): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = $1 AND "businessId" = $2`,
      [code, E2E_BUSINESS_ID],
    );

    return result.rows[0]?.id ?? '';
  });
}
