import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de sesión firmado (HMAC-SHA256), sin estado en el servidor.
 *
 * Formato: `base64url(payload).base64url(firma)`. El navegador NUNCA decide quién
 * es el usuario: el `userId` viaja dentro de un token que solo el servidor puede
 * firmar. `passwordVersion` es una huella del hash vigente, por lo que cambiar la
 * contraseña invalida las sesiones anteriores. `sessionVersion` hace lo mismo al
 * cerrar sesión (HU-15): el servidor la incrementa y los tokens previos ya no coinciden.
 */
export interface SessionPayload {
  userId: string;
  passwordVersion: string;
  sessionVersion: number;
  /** Expiración en segundos desde epoch. */
  expiresAt: number;
}

interface WirePayload {
  uid: string;
  pv: string;
  sv: number;
  exp: number;
}

/** Huella corta del hash de contraseña; cambia cuando la contraseña cambia. */
export function passwordVersionOf(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function createSessionToken(payload: SessionPayload, secret: string): string {
  const wire: WirePayload = {
    uid: payload.userId,
    pv: payload.passwordVersion,
    sv: payload.sessionVersion,
    exp: payload.expiresAt,
  };
  const body = Buffer.from(JSON.stringify(wire)).toString('base64url');

  return `${body}.${sign(body, secret).toString('base64url')}`;
}

/** Devuelve el contenido si la firma es válida y no venció; si no, `null`. */
export function verifySessionToken(
  token: string,
  secret: string,
  nowSeconds: number,
): SessionPayload | null {
  const [body, signature, ...rest] = token.split('.');

  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }

  const expected = sign(body, secret);
  const received = Buffer.from(signature, 'base64url');

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const wire = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<WirePayload>;

    if (
      typeof wire.uid !== 'string' ||
      typeof wire.pv !== 'string' ||
      typeof wire.sv !== 'number' ||
      typeof wire.exp !== 'number' ||
      wire.exp <= nowSeconds
    ) {
      return null;
    }

    return {
      userId: wire.uid,
      passwordVersion: wire.pv,
      sessionVersion: wire.sv,
      expiresAt: wire.exp,
    };
  } catch {
    return null;
  }
}
