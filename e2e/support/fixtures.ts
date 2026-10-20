import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { resetOwner, withDb } from './db';
import { BACKEND_URL, E2E_SETUP_TOKEN } from './env';

/** Cuenta del dueño de pruebas (valores de fixture, no reales). */
export const E2E_OWNER = {
  name: 'Dueña de Prueba',
  email: 'duena.prueba@example.com',
  password: 'ClaveSegura123',
};

/**
 * Deja la cuenta del dueño con las credenciales de `E2E_OWNER`; sin ella la app
 * redirige a /setup. Se recrea siempre porque otra prueba (HU-14) pudo cambiar
 * el correo o la contraseña.
 */
export async function ensureOwner(request: APIRequestContext): Promise<void> {
  await resetOwner();

  const created = await request.post(`${BACKEND_URL}/api/auth/setup`, {
    data: { ...E2E_OWNER, setupToken: E2E_SETUP_TOKEN },
  });

  expect(created.status()).toBe(201);
}

/**
 * Cuenta del dueño + sesión abierta en el navegador de la prueba: las pantallas
 * internas exigen sesión (HU-15). `page.request` comparte las cookies con la
 * página, así que la cookie HttpOnly queda igual que tras el login real.
 */
export async function signInAsOwner(page: Page): Promise<void> {
  await ensureOwner(page.request);

  const login = await page.request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: E2E_OWNER.email, password: E2E_OWNER.password },
  });

  expect(login.status()).toBe(200);
}

/** Borra el catálogo y todo lo que lo referencia (solo en la base `_e2e`). */
export async function resetCatalog(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      'TRUNCATE "SupplierProduct", "InventoryMovement", "SaleItem", "CreditPayment", "Sale", "Customer", "PurchaseOrderItem", "Product", "Category", "Supplier" CASCADE',
    );
  });
}

export interface SeedProduct {
  code: string;
  name: string;
  category: string;
  price: string;
  cost: string;
  stock: number;
  supplier: string | null;
  isActive?: boolean;
  barcode?: string;
}

/** Inserta productos con sus categorías y proveedores (creándolos si faltan). */
export async function seedProducts(products: SeedProduct[]): Promise<void> {
  await withDb(async (client) => {
    for (const product of products) {
      const category = await client.query<{ id: string }>(
        `INSERT INTO "Category"(id, name, "updatedAt") VALUES (gen_random_uuid(), $1, now())
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [product.category],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO "Product"(id, code, name, price, cost, stock, "isActive", "categoryId", barcode, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
        [
          product.code,
          product.name,
          product.price,
          product.cost,
          product.stock,
          product.isActive ?? true,
          category.rows[0]?.id,
          product.barcode ?? null,
        ],
      );

      if (product.supplier !== null) {
        const supplier = await client.query<{ id: string }>(
          `INSERT INTO "Supplier"(id, name, "updatedAt") VALUES (gen_random_uuid(), $1, now())
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [product.supplier],
        );

        await client.query(
          `INSERT INTO "SupplierProduct"(id, "supplierId", "productId", "unitCost", "isPreferred", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, true, now())`,
          [supplier.rows[0]?.id, inserted.rows[0]?.id, product.cost],
        );
      }
    }
  });
}

/**
 * Cliente con deuda previa: una venta a crédito histórica (sin líneas) y, si se
 * indica, un abono. El saldo resultante es `credited - paid`.
 */
export async function seedCustomer(name: string, credited: string, paid = '0.00'): Promise<string> {
  return withDb(async (client) => {
    const customer = await client.query<{ id: string }>(
      `INSERT INTO "Customer"(id, name, "updatedAt") VALUES (gen_random_uuid(), $1, now()) RETURNING id`,
      [name],
    );
    const id = customer.rows[0]?.id ?? '';

    if (credited !== '0.00') {
      await client.query(
        `INSERT INTO "Sale"(id, "paymentMethod", total, "customerId") VALUES (gen_random_uuid(), 'CREDIT', $1, $2)`,
        [credited, id],
      );
    }

    if (paid !== '0.00') {
      await client.query(
        `INSERT INTO "CreditPayment"(id, "customerId", amount) VALUES (gen_random_uuid(), $1, $2)`,
        [id, paid],
      );
    }

    return id;
  });
}

export async function stockOf(code: string): Promise<number> {
  return withDb(async (client) => {
    const result = await client.query<{ stock: number }>(
      'SELECT stock FROM "Product" WHERE code = $1',
      [code],
    );

    return result.rows[0]?.stock ?? -1;
  });
}

export interface SaleRow {
  number: number;
  paymentMethod: string;
  total: string;
  cashReceived: string | null;
  customerId: string | null;
}

/** Ventas con líneas (excluye el crédito histórico sembrado sin líneas). */
export async function readSales(): Promise<SaleRow[]> {
  return withDb(async (client) => {
    const result = await client.query<SaleRow>(
      `SELECT s.number, s."paymentMethod", s.total::text AS total, s."cashReceived"::text AS "cashReceived", s."customerId"
       FROM "Sale" s WHERE EXISTS (SELECT 1 FROM "SaleItem" i WHERE i."saleId" = s.id) ORDER BY s.number`,
    );

    return result.rows;
  });
}

export async function countExitMovements(): Promise<number> {
  return withDb(async (client) => {
    const result = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM "InventoryMovement" WHERE type = 'EXIT' AND "saleId" IS NOT NULL`,
    );

    return Number(result.rows[0]?.n ?? 0);
  });
}
