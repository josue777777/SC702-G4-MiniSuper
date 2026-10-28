import type { UsersRepository } from '../repositories/users.repository.js';
import type { CreateUserFields, UpdateUserFields, UserRecord } from '../types/auth.js';

export const OWNER_ID = '11111111-1111-4111-8111-111111111111';

/** Usuario de prueba: un administrador activo, salvo lo que se indique. */
export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: OWNER_ID,
    name: 'Ana Pérez',
    email: 'ana@correo.cr',
    passwordHash: '$argon2id$de-prueba',
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 0,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** Doble de repositorio de usuarios para los tests (sin base de datos). */
export class FakeUsersRepository implements UsersRepository {
  private users: UserRecord[];
  private nextId = 1;

  constructor(users: UserRecord[] = []) {
    this.users = [...users];
  }

  /** Lo guardado, para comprobar qué se persistió (p. ej. el hash). */
  get stored(): readonly UserRecord[] {
    return this.users;
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  list(): Promise<UserRecord[]> {
    return Promise.resolve(
      [...this.users].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
      ),
    );
  }

  countActiveAdmins(): Promise<number> {
    return Promise.resolve(
      this.users.filter((user) => user.role === 'ADMIN' && user.isActive).length,
    );
  }

  create(fields: CreateUserFields): Promise<UserRecord | null> {
    // Igual que el índice único real del correo.
    if (this.users.some((user) => user.email === fields.email)) {
      return Promise.resolve(null);
    }

    const created = makeUser({
      ...fields,
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
    });

    this.users.push(created);

    return Promise.resolve(created);
  }

  revokeSessions(id: string): Promise<void> {
    return this.update(id, { revokeSessions: true }).then(() => undefined);
  }

  update(id: string, fields: UpdateUserFields): Promise<UserRecord | null> {
    const index = this.users.findIndex((user) => user.id === id);
    const current = this.users[index];

    if (current === undefined) {
      return Promise.resolve(null);
    }

    const { revokeSessions, ...data } = fields;

    if (
      data.email !== undefined &&
      this.users.some((user) => user.id !== id && user.email === data.email)
    ) {
      return Promise.resolve(null);
    }

    const next: UserRecord = {
      ...current,
      ...data,
      sessionVersion: current.sessionVersion + (revokeSessions === true ? 1 : 0),
    };

    this.users[index] = next;

    return Promise.resolve(next);
  }
}
