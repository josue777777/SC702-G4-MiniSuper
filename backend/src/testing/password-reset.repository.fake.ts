import type { PasswordResetRepository } from '../repositories/password-reset.repository.js';
import type { AccessEventFields, RecoverableAccount } from '../types/auth.js';

interface StoredAccount extends RecoverableAccount {
  passwordHash: string;
  sessionVersion: number;
  tokenHash: string | null;
  tokenExpires: Date | null;
}

/** Doble del repositorio de recuperación (sin base de datos), con las mismas reglas. */
export class FakePasswordResetRepository implements PasswordResetRepository {
  readonly accounts: StoredAccount[];
  readonly events: AccessEventFields[] = [];

  constructor(accounts: RecoverableAccount[]) {
    this.accounts = accounts.map((account) => ({
      ...account,
      passwordHash: 'hash-original',
      sessionVersion: 0,
      tokenHash: null,
      tokenExpires: null,
    }));
  }

  findByEmail(email: string): Promise<RecoverableAccount | null> {
    return Promise.resolve(this.accounts.find((account) => account.email === email) ?? null);
  }

  saveToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const account = this.accounts.find((candidate) => candidate.id === userId);

    if (account !== undefined) {
      account.tokenHash = tokenHash;
      account.tokenExpires = expiresAt;
    }

    return Promise.resolve();
  }

  findByToken(tokenHash: string, now: Date): Promise<RecoverableAccount | null> {
    return Promise.resolve(this.valid(tokenHash, now) ?? null);
  }

  completeReset(
    account: Pick<RecoverableAccount, 'id' | 'businessId'>,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    const stored = this.valid(tokenHash, now);

    if (stored === undefined || stored.id !== account.id) {
      return Promise.resolve(false);
    }

    stored.passwordHash = passwordHash;
    stored.sessionVersion += 1;
    stored.tokenHash = null;
    stored.tokenExpires = null;
    this.events.push({
      type: 'PASSWORD_RECOVERED_BY_EMAIL',
      userId: stored.id,
      businessId: stored.businessId,
      actorId: null,
    });

    return Promise.resolve(true);
  }

  private valid(tokenHash: string, now: Date): StoredAccount | undefined {
    return this.accounts.find(
      (account) =>
        account.tokenHash === tokenHash &&
        account.tokenExpires !== null &&
        account.tokenExpires > now,
    );
  }
}
