import argon2 from 'argon2';
import pg from 'pg';
import { e2eDatabaseUrl } from './env';

/** Acceso directo a la base E2E para preparar fixtures y comprobar la persistencia. */
export async function withDb<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });

  await client.connect();

  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Negocio de las pruebas: el del Encargado `E2E_OWNER` (id fijo, valores de fixture). */
export const E2E_BUSINESS_ID = '0e2e0000-0000-4000-8000-000000000001';

/** Tablas del catálogo y todo lo que lo referencia (para vaciarlas de una vez). */
export const CATALOG_TABLES =
  '"SupplierProduct", "InventoryMovement", "SaleItem", "CreditPayment", "Sale", "Customer", "PurchaseOrderItem", "PurchaseOrder", "Product", "Category", "Supplier"';

/**
 * Deja el sistema sin usuarios ni solicitudes, y sin otros negocios que el de
 * las pruebas. Si otro negocio tiene datos (por ejemplo, el que la migración
 * creó con el catálogo viejo de esta base), se vacía el catálogo completo
 * primero: así ningún negocio ajeno queda colgado de él.
 */
export async function resetOwner(): Promise<void> {
  await withDb(async (client) => {
    await client.query('DELETE FROM "PlanRequest"');
    await client.query('DELETE FROM "User"');

    const foreign = await client.query(
      `SELECT 1 FROM "Category" WHERE "businessId" <> $1
       UNION ALL SELECT 1 FROM "Product" WHERE "businessId" <> $1
       UNION ALL SELECT 1 FROM "Customer" WHERE "businessId" <> $1
       UNION ALL SELECT 1 FROM "Supplier" WHERE "businessId" <> $1
       UNION ALL SELECT 1 FROM "Sale" WHERE "businessId" <> $1
       UNION ALL SELECT 1 FROM "PurchaseOrder" WHERE "businessId" <> $1
       LIMIT 1`,
      [E2E_BUSINESS_ID],
    );

    if (foreign.rowCount !== 0) {
      await client.query(`TRUNCATE ${CATALOG_TABLES} CASCADE`);
    }

    await client.query('DELETE FROM "Business" WHERE id <> $1', [E2E_BUSINESS_ID]);
  });
}

export type E2ERole = 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'BODEGA';

export interface E2EUser {
  name: string;
  email: string;
  password: string;
  role: E2ERole;
  mustChangePassword?: boolean;
  /**
   * Negocio del usuario. Por defecto: ninguno para ADMIN (es de la
   * plataforma) y el negocio de las pruebas para los demás roles.
   */
  businessId?: string | null;
}

/**
 * Inserta un usuario con su contraseña en Argon2id, igual que lo guarda el
 * backend (usa la misma librería `argon2` del backend). Así se preparan los
 * usuarios sin registro público, como lo hace `npm run db:seed`.
 */
export async function insertUser(user: E2EUser): Promise<void> {
  const passwordHash = await argon2.hash(user.password, { type: argon2.argon2id });
  const businessId =
    user.businessId === undefined
      ? user.role === 'ADMIN'
        ? null
        : E2E_BUSINESS_ID
      : user.businessId;

  await withDb((client) =>
    client.query(
      `INSERT INTO "User"(id, name, email, "passwordHash", role, "mustChangePassword", "businessId", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())`,
      [
        user.name,
        user.email,
        passwordHash,
        user.role,
        user.mustChangePassword ?? false,
        businessId,
      ],
    ),
  );
}

export interface UserRow {
  name: string;
  email: string;
  passwordHash: string;
  role: E2ERole;
  isActive: boolean;
  mustChangePassword: boolean;
}

export async function readUsers(): Promise<UserRow[]> {
  return withDb(async (client) => {
    const result = await client.query<UserRow>(
      'SELECT name, email, "passwordHash", role, "isActive", "mustChangePassword" FROM "User" ORDER BY "createdAt"',
    );

    return result.rows;
  });
}
