import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { withDb } from './db';
import { BACKEND_URL, E2E_SETUP_TOKEN } from './env';

/** Cuenta del dueño de pruebas (valores de fixture, no reales). */
export const E2E_OWNER = {
  name: 'Dueña de Prueba',
  email: 'duena.prueba@example.com',
  password: 'ClaveSegura123',
};

/** Garantiza que exista la cuenta del dueño; sin ella la app redirige a /setup. */
export async function ensureOwner(request: APIRequestContext): Promise<void> {
  const status = await request.get(`${BACKEND_URL}/api/auth/setup-status`);

  if (((await status.json()) as { data: { configured: boolean } }).data.configured) {
    return;
  }

  const created = await request.post(`${BACKEND_URL}/api/auth/setup`, {
    data: { ...E2E_OWNER, setupToken: E2E_SETUP_TOKEN },
  });

  expect(created.status()).toBe(201);
}

/** Borra el catálogo y todo lo que lo referencia (solo en la base `_e2e`). */
export async function resetCatalog(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      'TRUNCATE "SupplierProduct", "InventoryMovement", "SaleItem", "PurchaseOrderItem", "Product", "Category", "Supplier" CASCADE',
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
        `INSERT INTO "Product"(id, code, name, price, cost, stock, "isActive", "categoryId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
        [
          product.code,
          product.name,
          product.price,
          product.cost,
          product.stock,
          product.isActive ?? true,
          category.rows[0]?.id,
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
