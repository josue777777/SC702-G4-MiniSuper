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

/** Deja el sistema como recién instalado: sin cuenta del dueño. */
export async function resetOwner(): Promise<void> {
  await withDb((client) => client.query('DELETE FROM "User"'));
}

export interface UserRow {
  name: string;
  email: string;
  passwordHash: string;
}

export async function readUsers(): Promise<UserRow[]> {
  return withDb(async (client) => {
    const result = await client.query<UserRow>('SELECT name, email, "passwordHash" FROM "User"');

    return result.rows;
  });
}
