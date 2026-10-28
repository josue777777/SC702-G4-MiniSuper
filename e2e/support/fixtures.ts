import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  CATALOG_TABLES,
  E2E_BUSINESS_ID,
  insertUser,
  resetOwner,
  withDb,
  type E2EUser,
} from './db';
import { BACKEND_URL } from './env';

/**
 * Encargado (dueña) del negocio de las pruebas: maneja el negocio y su
 * personal. Valores de fixture, no reales.
 */
export const E2E_OWNER: E2EUser = {
  name: 'Dueña de Prueba',
  email: 'duena.prueba@example.com',
  password: 'ClaveSegura123',
  role: 'ENCARGADO',
};

/** Administrador de la plataforma: negocios y planes, sin datos de ningún negocio. */
export const E2E_ADMIN: E2EUser = {
  name: 'Plataforma de Prueba',
  email: 'plataforma.prueba@example.com',
  password: 'ClaveSegura123',
  role: 'ADMIN',
};

/**
 * Deja como únicos usuarios a la Encargada `E2E_OWNER` y al Administrador
 * `E2E_ADMIN`, ya con su contraseña propia, y el negocio de las pruebas con sus
 * datos de fábrica. Se recrean siempre porque otra prueba (HU-14) pudo cambiar
 * el correo o la contraseña.
 */
export async function ensureOwner(): Promise<void> {
  await resetBusiness();
  await resetOwner();
  await insertUser(E2E_OWNER);
  await insertUser(E2E_ADMIN);
}

/**
 * Negocio de las pruebas con sus datos de fábrica (otra prueba pudo cambiarlos
 * en Configuración › General o en la plataforma): Encargado + 4 usuarios,
 * activo. También el nombre del sistema y el precio por usuario de fábrica.
 */
export async function resetBusiness(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Business"(id, name, "receiptMessage", "extraUsers", status, "updatedAt")
       VALUES ($1, 'Abastecedor Nuevo Amanecer', '¡Gracias por su compra!', 4, 'ACTIVE', now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "legalId" = NULL, phone = NULL,
         email = NULL, address = NULL, "receiptMessage" = EXCLUDED."receiptMessage",
         "logoData" = NULL, "logoMimeType" = NULL, "logoUpdatedAt" = NULL,
         "extraUsers" = 4, status = 'ACTIVE', "updatedAt" = now()`,
      [E2E_BUSINESS_ID],
    );
    await client.query(
      `INSERT INTO "PlatformSettings"(id, "systemName", "pricePerExtraUser", "updatedAt")
       VALUES (1, 'MiniSuper', 5000, now())
       ON CONFLICT (id) DO UPDATE SET "systemName" = 'MiniSuper', "pricePerExtraUser" = 5000,
         "updatedAt" = now()`,
    );
  });
}

/**
 * Cuenta del dueño + sesión abierta en el navegador de la prueba: las pantallas
 * internas exigen sesión (HU-15). `page.request` comparte las cookies con la
 * página, así que la cookie HttpOnly queda igual que tras el login real.
 */
export async function signInAsOwner(page: Page): Promise<void> {
  await ensureOwner();
  await signInVia(page.request, E2E_OWNER);
}

/** Abre sesión por la API; la cookie queda en el contexto de `request`. */
export async function signInVia(
  request: APIRequestContext,
  user: Pick<E2EUser, 'email' | 'password'>,
): Promise<void> {
  const login = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });

  expect(login.status()).toBe(200);
}

/** Borra el catálogo y todo lo que lo referencia (solo en la base `_e2e`). */
export async function resetCatalog(): Promise<void> {
  await resetBusiness();
  await withDb(async (client) => {
    await client.query(`TRUNCATE ${CATALOG_TABLES} CASCADE`);
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
        `INSERT INTO "Category"(id, name, "businessId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, now())
         ON CONFLICT ("businessId", name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [product.category, E2E_BUSINESS_ID],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO "Product"(id, code, name, price, cost, stock, "isActive", "categoryId", barcode, "businessId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING id`,
        [
          product.code,
          product.name,
          product.price,
          product.cost,
          product.stock,
          product.isActive ?? true,
          category.rows[0]?.id,
          product.barcode ?? null,
          E2E_BUSINESS_ID,
        ],
      );

      if (product.supplier !== null) {
        const supplier = await client.query<{ id: string }>(
          `INSERT INTO "Supplier"(id, name, "businessId", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, now())
           ON CONFLICT ("businessId", name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [product.supplier, E2E_BUSINESS_ID],
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
      `INSERT INTO "Customer"(id, name, "businessId", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      [name, E2E_BUSINESS_ID],
    );
    const id = customer.rows[0]?.id ?? '';

    if (credited !== '0.00') {
      await client.query(
        `INSERT INTO "Sale"(id, "paymentMethod", total, "customerId", "businessId")
         VALUES (gen_random_uuid(), 'CREDIT', $1, $2, $3)`,
        [credited, id, E2E_BUSINESS_ID],
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
