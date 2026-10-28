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

/** Deja el sistema como recién instalado: sin usuarios. */
export async function resetOwner(): Promise<void> {
  await withDb((client) => client.query('DELETE FROM "User"'));
}

export type E2ERole = 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'BODEGA';

export interface E2EUser {
  name: string;
  email: string;
  password: string;
  role: E2ERole;
  mustChangePassword?: boolean;
}

/**
 * Inserta un usuario con su contraseña en Argon2id, igual que lo guarda el
 * backend (usa la misma librería `argon2` del backend). Así se prepara el
 * administrador sin registro público, como lo hace `npm run db:seed`.
 */
export async function insertUser(user: E2EUser): Promise<void> {
  const passwordHash = await argon2.hash(user.password, { type: argon2.argon2id });

  await withDb((client) =>
    client.query(
      `INSERT INTO "User"(id, name, email, "passwordHash", role, "mustChangePassword", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
      [user.name, user.email, passwordHash, user.role, user.mustChangePassword ?? false],
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
