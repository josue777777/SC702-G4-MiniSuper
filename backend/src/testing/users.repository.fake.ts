import type { UsersRepository } from '../repositories/users.repository.js';
import type {
  CreateOwnerFields,
  ProfileDto,
  UpdateProfileFields,
  UserRecord,
} from '../types/auth.js';

export const OWNER_ID = '11111111-1111-4111-8111-111111111111';

/** Doble de repositorio de usuarios para los tests (sin base de datos). */
export class FakeUsersRepository implements UsersRepository {
  /** Simula que otra petición creó la cuenta antes: `createOwner` devuelve `null` (P2002). */
  simulateRaceOnCreate = false;

  private users: UserRecord[];

  constructor(users: UserRecord[] = []) {
    this.users = [...users];
  }

  /** Último registro guardado, para comprobar qué se persistió (p. ej. el hash). */
  get stored(): readonly UserRecord[] {
    return this.users;
  }

  count(): Promise<number> {
    return Promise.resolve(this.users.length);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  createOwner(fields: CreateOwnerFields): Promise<ProfileDto | null> {
    // Igual que el índice único real: solo cabe una cuenta.
    if (this.simulateRaceOnCreate || this.users.length > 0) {
      return Promise.resolve(null);
    }

    const created: UserRecord = { id: OWNER_ID, ...fields };

    this.users.push(created);

    return Promise.resolve({ id: created.id, name: created.name, email: created.email });
  }

  update(id: string, fields: UpdateProfileFields): Promise<ProfileDto | null> {
    const index = this.users.findIndex((user) => user.id === id);
    const current = this.users[index];

    if (current === undefined) {
      return Promise.resolve(null);
    }

    const next: UserRecord = { ...current, ...fields };

    this.users[index] = next;

    return Promise.resolve({ id: next.id, name: next.name, email: next.email });
  }
}
