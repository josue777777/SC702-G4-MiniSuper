import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSessionToken, passwordVersionOf, verifySessionToken } from './session-token.js';

const SECRET = 'a'.repeat(40);
const payload = {
  userId: 'user-1',
  passwordVersion: passwordVersionOf('hash-1'),
  sessionVersion: 3,
  expiresAt: 2_000,
};

describe('session-token', () => {
  it('devuelve el contenido si la firma es válida y no venció', () => {
    expect(verifySessionToken(createSessionToken(payload, SECRET), SECRET, 1_000)).toEqual(payload);
  });

  it('rechaza un token vencido', () => {
    expect(verifySessionToken(createSessionToken(payload, SECRET), SECRET, 2_000)).toBeNull();
  });

  it('rechaza un token firmado con otra clave', () => {
    const forged = createSessionToken(payload, 'b'.repeat(40));

    expect(verifySessionToken(forged, SECRET, 1_000)).toBeNull();
  });

  it('rechaza un payload alterado aunque conserve la firma', () => {
    const [, signature] = createSessionToken(payload, SECRET).split('.');
    const tampered = Buffer.from(
      JSON.stringify({ uid: 'otro', pv: payload.passwordVersion, sv: 3, exp: 2_000 }),
    ).toString('base64url');

    expect(verifySessionToken(`${tampered}.${signature}`, SECRET, 1_000)).toBeNull();
  });

  it('rechaza un token firmado sin versión de sesión (anterior a HU-15)', () => {
    const body = Buffer.from(
      JSON.stringify({ uid: 'user-1', pv: payload.passwordVersion, exp: 2_000 }),
    ).toString('base64url');
    const signature = createHmac('sha256', SECRET).update(body).digest('base64url');

    expect(verifySessionToken(`${body}.${signature}`, SECRET, 1_000)).toBeNull();
  });

  it('rechaza basura sin estructura', () => {
    expect(verifySessionToken('', SECRET, 1_000)).toBeNull();
    expect(verifySessionToken('abc', SECRET, 1_000)).toBeNull();
    expect(verifySessionToken('a.b.c', SECRET, 1_000)).toBeNull();
  });

  it('cambia la versión cuando cambia el hash de la contraseña', () => {
    expect(passwordVersionOf('hash-1')).not.toBe(passwordVersionOf('hash-2'));
  });
});
