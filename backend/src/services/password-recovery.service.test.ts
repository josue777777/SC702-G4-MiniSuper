import { describe, expect, it } from 'vitest';
import type { RecoverableAccount } from '../types/auth.js';
import { TEST_BUSINESS_ID } from '../testing/fake-session.js';
import { FakeMailer } from '../testing/mailer.fake.js';
import { FakePasswordResetRepository } from '../testing/password-reset.repository.fake.js';
import { LoginRateLimiter } from '../utils/login-rate-limiter.js';
import { verifyPassword } from '../utils/password.js';
import { AccountNotifier } from './account-notifier.service.js';
import { PasswordRecoveryService } from './password-recovery.service.js';

/**
 * Recuperación de contraseña por correo (HU-13): solo Administrador y
 * Encargado; enlace que vence y sirve una vez; nunca revela si una cuenta existe.
 */

const APP_URL = 'http://localhost:5173';

function account(overrides: Partial<RecoverableAccount>): RecoverableAccount {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Elena Encargada',
    email: 'elena@correo.cr',
    role: 'ENCARGADO',
    businessId: TEST_BUSINESS_ID,
    isActive: true,
    businessStatus: 'ACTIVE',
    ...overrides,
  };
}

const ENCARGADA = account({});
const ADMIN = account({
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Ana Admin',
  email: 'admin@correo.cr',
  role: 'ADMIN',
  businessId: null,
  businessStatus: null,
});
const CAJERO = account({
  id: '10000000-0000-4000-8000-000000000003',
  name: 'Carlos Cajero',
  email: 'carlos@correo.cr',
  role: 'CAJERO',
});

function build(accounts: RecoverableAccount[] = [ENCARGADA, ADMIN, CAJERO]) {
  let now = new Date('2026-11-01T12:00:00Z');
  const repository = new FakePasswordResetRepository(accounts);
  const mailer = new FakeMailer();
  const service = new PasswordRecoveryService(repository, new AccountNotifier(mailer), {
    appUrl: APP_URL,
    emailLimiter: new LoginRateLimiter(3, 60 * 60 * 1000),
    ipLimiter: new LoginRateLimiter(10, 60 * 60 * 1000),
    now: () => now,
  });

  return {
    service,
    repository,
    mailer,
    advanceMinutes: (minutes: number) => {
      now = new Date(now.getTime() + minutes * 60 * 1000);
    },
  };
}

/** El token del enlace que llegó al correo. */
function tokenOf(link: string | null): string {
  return new URL(link ?? 'http://x/').searchParams.get('token') ?? '';
}

describe('pedir el enlace de recuperación', () => {
  it('a la Encargada le llega un enlace a su correo, y en la base solo queda el hash', async () => {
    const { service, mailer, repository } = build();

    await service.requestReset(ENCARGADA.email, 'ip-1');

    const link = mailer.lastLinkTo(ENCARGADA.email);

    expect(link).toMatch(/^http:\/\/localhost:5173\/reset-password\?token=[\w-]{40,}$/);
    expect(mailer.sent[0]?.text).toContain('Vence en 30 minutos');
    expect(repository.accounts[0]?.tokenHash).not.toBe(tokenOf(link));
    expect(repository.accounts[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el Administrador también puede recuperarla por correo', async () => {
    const { service, mailer } = build();

    await service.requestReset(ADMIN.email, 'ip-1');

    expect(mailer.lastLinkTo(ADMIN.email)).not.toBeNull();
  });

  it('a un Cajero no se le envía nada (la recupera con su Encargado), y no se nota la diferencia', async () => {
    const { service, mailer, repository } = build();

    await expect(service.requestReset(CAJERO.email, 'ip-1')).resolves.toBeUndefined();

    expect(mailer.sent).toHaveLength(0);
    expect(repository.accounts[2]?.tokenHash).toBeNull();
  });

  it('con un correo que no existe responde igual y no envía nada', async () => {
    const { service, mailer } = build();

    await expect(service.requestReset('nadie@correo.cr', 'ip-1')).resolves.toBeUndefined();
    expect(mailer.sent).toHaveLength(0);
  });

  it('no envía enlaces a cuentas desactivadas ni a negocios suspendidos', async () => {
    const inactive = account({ email: 'inactiva@correo.cr', isActive: false });
    const suspended = account({
      id: '10000000-0000-4000-8000-000000000009',
      email: 'suspendida@correo.cr',
      businessStatus: 'SUSPENDED',
    });
    const { service, mailer } = build([inactive, suspended]);

    await service.requestReset(inactive.email, 'ip-1');
    await service.requestReset(suspended.email, 'ip-1');

    expect(mailer.sent).toHaveLength(0);
  });

  it('máximo 3 enlaces por correo cada hora: el resto se ignora en silencio', async () => {
    const { service, mailer } = build();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.requestReset(ENCARGADA.email, `ip-${attempt}`);
    }

    expect(mailer.sent).toHaveLength(3);
  });

  it('máximo 10 solicitudes por equipo cada hora: después responde 429', async () => {
    const { service } = build();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await service.requestReset(`otro${attempt}@correo.cr`, 'ip-insistente');
    }

    await expect(service.requestReset(ENCARGADA.email, 'ip-insistente')).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});

describe('poner la contraseña nueva con el enlace', () => {
  it('cambia la contraseña, cierra las sesiones, deja el registro y avisa por correo', async () => {
    const { service, mailer, repository } = build();

    await service.requestReset(ENCARGADA.email, 'ip-1');
    await service.resetPassword(tokenOf(mailer.lastLinkTo(ENCARGADA.email)), 'ClaveNueva2026');

    const stored = repository.accounts[0];

    expect(await verifyPassword(stored?.passwordHash ?? '', 'ClaveNueva2026')).toBe(true);
    expect(stored?.sessionVersion).toBe(1);
    expect(repository.events).toEqual([
      {
        type: 'PASSWORD_RECOVERED_BY_EMAIL',
        userId: ENCARGADA.id,
        businessId: TEST_BUSINESS_ID,
        actorId: null,
      },
    ]);
    expect(mailer.sent.at(-1)).toMatchObject({
      to: ENCARGADA.email,
      subject: 'Su contraseña de MiniSuper cambió',
    });
    expect(mailer.sent.at(-1)?.text).toContain('Si usted no hizo este cambio');
  });

  it('el enlace sirve una sola vez', async () => {
    const { service, mailer } = build();

    await service.requestReset(ENCARGADA.email, 'ip-1');
    const token = tokenOf(mailer.lastLinkTo(ENCARGADA.email));

    await service.resetPassword(token, 'ClaveNueva2026');

    await expect(service.resetPassword(token, 'OtraClave2026')).rejects.toMatchObject({
      statusCode: 400,
      message: 'El enlace no es válido o ya venció. Solicite uno nuevo.',
    });
  });

  it('el enlace vence a los 30 minutos', async () => {
    const { service, mailer, advanceMinutes } = build();

    await service.requestReset(ENCARGADA.email, 'ip-1');
    advanceMinutes(31);

    await expect(
      service.resetPassword(tokenOf(mailer.lastLinkTo(ENCARGADA.email)), 'ClaveNueva2026'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('pedir otro enlace deja sin efecto el anterior', async () => {
    const { service, mailer } = build();

    await service.requestReset(ENCARGADA.email, 'ip-1');
    const first = tokenOf(mailer.lastLinkTo(ENCARGADA.email));

    await service.requestReset(ENCARGADA.email, 'ip-1');

    await expect(service.resetPassword(first, 'ClaveNueva2026')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('un enlace inventado no sirve', async () => {
    const { service } = build();

    await expect(service.resetPassword('a'.repeat(43), 'ClaveNueva2026')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
