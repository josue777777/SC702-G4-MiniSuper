import type { DocumentKind, Prisma } from '../generated/prisma/client.js';

/**
 * Entrega el próximo consecutivo del negocio para un tipo de documento (Venta
 * #1, #2… de cada negocio) y avanza el contador.
 *
 * Debe llamarse con el cliente `tx` de la MISMA transacción que guarda el
 * documento:
 *   - es atómico: la fila del contador queda bloqueada hasta el final de la
 *     transacción, así dos ventas simultáneas del negocio nunca reciben el
 *     mismo número;
 *   - si el documento no se guarda (por ejemplo, falta stock), la transacción
 *     se deshace y el número no se gasta: no quedan huecos;
 *   - la primera vez crea el contador del negocio (empieza en 1).
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
  kind: DocumentKind,
): Promise<number> {
  const rows = await tx.$queryRaw<{ number: number }[]>`
    INSERT INTO "DocumentSequence" ("businessId", "kind", "next")
    VALUES (${businessId}::uuid, ${kind}::"DocumentKind", 2)
    ON CONFLICT ("businessId", "kind")
      DO UPDATE SET "next" = "DocumentSequence"."next" + 1
    RETURNING "next" - 1 AS "number"`;
  const number = rows[0]?.number;

  if (number === undefined) {
    throw new Error(`No se pudo asignar el consecutivo ${kind}.`);
  }

  return number;
}
