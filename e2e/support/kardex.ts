import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E_BUSINESS_ID, insertUser, withDb, type E2EUser } from './db';
import { signInVia } from './fixtures';

/**
 * Soporte de las pruebas E2E del Kardex (HU-31): movimientos con fechas fijas
 * (hora de Costa Rica), un segundo negocio para el aislamiento y lectores de la
 * tabla del historial.
 *
 * Los movimientos se insertan con las mismas columnas que dejan los flujos
 * reales; además hay una prueba que genera uno con la API real de ventas.
 */

/** `2024-05-02T10:30:00` en hora de Costa Rica (UTC−6) → ISO en UTC. */
const toUtc = (local: string) => new Date(`${local}-06:00`).toISOString();

export interface SeedMovement {
  type: 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  /** Hora de Costa Rica: `YYYY-MM-DDTHH:mm:ss`. */
  at: string;
  reason: string;
  saleId?: string;
}

export async function productIdOf(code: string, businessId = E2E_BUSINESS_ID): Promise<string> {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "Product" WHERE code = $1 AND "businessId" = $2`,
      [code, businessId],
    );

    return result.rows[0]?.id ?? '';
  });
}

export async function seedMovements(
  code: string,
  movements: SeedMovement[],
  businessId = E2E_BUSINESS_ID,
): Promise<void> {
  const productId = await productIdOf(code, businessId);

  await withDb(async (client) => {
    for (const movement of movements) {
      await client.query(
        `INSERT INTO "InventoryMovement"(id, "productId", type, quantity, "stockBefore", "stockAfter", reason, "saleId", "createdAt")
         VALUES (gen_random_uuid(), $1, $2::"InventoryMovementType", $3, $4, $5, $6, $7,
                 ($8::timestamptz AT TIME ZONE 'UTC'))`,
        [
          productId,
          movement.type,
          movement.quantity,
          movement.stockBefore,
          movement.stockAfter,
          movement.reason,
          movement.saleId ?? null,
          toUtc(movement.at),
        ],
      );
    }
  });
}

/** `count` entradas de una unidad, un minuto aparte: «Movimiento 1» … «Movimiento N». */
export async function seedBulkMovements(code: string, count: number): Promise<void> {
  const productId = await productIdOf(code);

  await withDb((client) =>
    client.query(
      `INSERT INTO "InventoryMovement"(id, "productId", type, quantity, "stockBefore", "stockAfter", reason, "createdAt")
       SELECT gen_random_uuid(), $1, 'ENTRY', 1, i - 1, i, 'Movimiento ' || i,
              timestamp '2024-06-01 12:00:00' + (i || ' minutes')::interval
       FROM generate_series(1, $2::int) AS i`,
      [productId, count],
    ),
  );
}

/** Venta mínima a la que apuntan los movimientos de venta y devolución. Devuelve su id. */
export async function seedSaleRow(at: string, total: string): Promise<string> {
  return withDb(async (client) => {
    const sequence = await client.query<{ number: number }>(
      `INSERT INTO "DocumentSequence"("businessId", kind, "next") VALUES ($1, 'SALE', 2)
       ON CONFLICT ("businessId", kind) DO UPDATE SET "next" = "DocumentSequence"."next" + 1
       RETURNING "next" - 1 AS number`,
      [E2E_BUSINESS_ID],
    );
    const sale = await client.query<{ id: string }>(
      `INSERT INTO "Sale"(id, number, "paymentMethod", total, "businessId", "createdAt")
       VALUES (gen_random_uuid(), $1, 'CASH', $2, $3, ($4::timestamptz AT TIME ZONE 'UTC')) RETURNING id`,
      [sequence.rows[0]?.number, total, E2E_BUSINESS_ID, toUtc(at)],
    );

    return sale.rows[0]?.id ?? '';
  });
}

/** Lo que Kardex nunca debe modificar: stock de cada producto y cantidad de movimientos. */
export async function inventoryState(): Promise<{ stock: [string, number][]; movements: number }> {
  return withDb(async (client) => {
    const stock = await client.query<{ code: string; stock: number }>(
      `SELECT code, stock FROM "Product" WHERE "businessId" = $1 ORDER BY code`,
      [E2E_BUSINESS_ID],
    );
    const movements = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM "InventoryMovement"`,
    );

    return {
      stock: stock.rows.map((row) => [row.code, row.stock]),
      movements: Number(movements.rows[0]?.n ?? 0),
    };
  });
}

// --- Segundo negocio y otros usuarios --------------------------------------

export const OTHER_BUSINESS_ID = '0e2e0000-0000-4000-8000-000000000002';

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

/** Otro negocio con un producto de MISMO código «P001» y su propio historial. */
export async function seedOtherBusiness(): Promise<string> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Business"(id, name, "extraUsers", status, "updatedAt") VALUES ($1, 'Negocio Ajeno S.A.', 0, 'ACTIVE', now())`,
      [OTHER_BUSINESS_ID],
    );

    const category = await client.query<{ id: string }>(
      `INSERT INTO "Category"(id, name, "businessId", "updatedAt") VALUES (gen_random_uuid(), 'Secreta', $1, now()) RETURNING id`,
      [OTHER_BUSINESS_ID],
    );

    await client.query(
      `INSERT INTO "Product"(id, code, name, price, cost, stock, "categoryId", "businessId", "updatedAt")
       VALUES (gen_random_uuid(), 'P001', 'Producto del negocio ajeno', 777, 555, 3, $1, $2, now())`,
      [category.rows[0]?.id, OTHER_BUSINESS_ID],
    );
  });
  await seedMovements(
    'P001',
    [
      {
        type: 'ENTRY',
        quantity: 3,
        stockBefore: 0,
        stockAfter: 3,
        at: '2024-05-01T08:00:00',
        reason: 'Historial secreto ajeno',
      },
    ],
    OTHER_BUSINESS_ID,
  );
  await insertUser(OTHER_OWNER);

  return productIdOf('P001', OTHER_BUSINESS_ID);
}

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

/** Filas del historial tal como se ven: `[fecha, concepto, documento, entrada, salida, antes, final]`. */
export async function readHistory(page: Page): Promise<string[][]> {
  const table = page.getByRole('table', { name: 'Movimientos del producto' });

  await expect(table).toBeVisible();

  // [fecha, concepto, documento, entrada, salida, stock final, lotes]: el botón
  // «N lotes» va junto al concepto y se lee aparte («—» si no hay).
  return Promise.all(
    (await table.locator('tbody tr').all()).map(async (row) => {
      const cells = (await row.locator('td').allTextContents()).map((cell) => cell.trim());
      const lots = row.locator('td').nth(1).getByRole('button');
      const lotsText =
        (await lots.count()) === 0
          ? '—'
          : ((await lots.textContent()) ?? '').replace('▦', '').trim();
      // El concepto lleva su signo (+ entra, − sale) y el botón «▦ N lotes» al lado.
      const concept = (cells[1] ?? '')
        .replace(lotsText === '—' ? '' : lotsText, '')
        .replace('▦', '')
        .trim()
        .replace(/^[+−]/, '');

      return [
        cells[0] ?? '',
        concept,
        cells[2] ?? '',
        // Entrada y salida van en insignias con su signo («+12», «−2»): aquí, la cifra.
        (cells[3] ?? '').replace(/^[+−]/, ''),
        (cells[4] ?? '').replace(/^[+−]/, ''),
        cells[5] ?? '',
        lotsText,
      ];
    }),
  );
}
