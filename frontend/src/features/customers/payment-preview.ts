import type { CreditSummary } from '../../types/credit';
import { formatCents, isMoneyText, toCents } from '../sales/cents';

/** Reparto que se mostrará antes de confirmar: solo es una vista previa, el servidor decide. */
export interface PreviewPart {
  saleId: string;
  number: number;
  amount: bigint;
}

export interface PaymentPreview {
  /** Monto escrito en céntimos; `null` si todavía no es un importe válido. */
  amount: bigint | null;
  /** Lo máximo que se puede abonar con lo elegido (toda la deuda, o ese fiado). */
  limit: bigint;
  /** Lo que sobra por encima de `limit`; 0 si no se pasa. */
  excess: bigint;
  /** Saldo esperado tras el abono (solo si el monto es válido y no se pasa). */
  newBalance: bigint | null;
  parts: PreviewPart[];
  /** Error visible del monto (vacío, formato o cero). */
  amountError: string | null;
}

/**
 * Lo que verá la persona antes de confirmar: el límite, si se pasa de la deuda, el
 * nuevo saldo y a qué fiados se aplicaría (más antiguos primero, igual que el servidor).
 * `showRequired` evita regañar un campo que todavía no se tocó.
 */
export function previewPayment(
  credit: CreditSummary,
  amountText: string,
  saleId: string | null,
  showRequired: boolean,
): PaymentPreview {
  const debt = toCents(credit.balance);
  const chosen = saleId === null ? null : credit.fiados.find((fiado) => fiado.saleId === saleId);
  const pending = chosen === undefined || chosen === null ? null : toCents(chosen.pendingAmount);
  const limit = pending === null ? debt : pending < debt ? pending : debt;
  const text = amountText.trim();

  let amountError: string | null = null;
  let amount: bigint | null = null;

  if (text === '') {
    amountError = showRequired ? 'Ingrese el monto a pagar.' : null;
  } else if (!isMoneyText(text)) {
    amountError = 'Escriba un importe válido, sin signo y con hasta dos decimales.';
  } else if (toCents(text) <= 0n) {
    amountError = 'El monto debe ser mayor que cero.';
  } else {
    amount = toCents(text);
  }

  const excess = amount !== null && amount > limit ? amount - limit : 0n;
  const parts: PreviewPart[] = [];

  if (amount !== null && excess === 0n) {
    let remaining = amount;
    const targets =
      saleId === null ? credit.fiados : credit.fiados.filter((fiado) => fiado.saleId === saleId);

    for (const fiado of targets) {
      const fiadoPending = toCents(fiado.pendingAmount);

      if (remaining === 0n) {
        break;
      }

      if (fiadoPending === 0n) {
        continue;
      }

      const part = remaining < fiadoPending ? remaining : fiadoPending;

      parts.push({ saleId: fiado.saleId, number: fiado.number, amount: part });
      remaining -= part;
    }
  }

  return {
    amount,
    limit,
    excess,
    newBalance: amount !== null && excess === 0n ? debt - amount : null,
    parts,
    amountError,
  };
}

/** Importe en texto (`"2000.00"`) de un monto en céntimos, para ajustar el campo. */
export function amountText(cents: bigint): string {
  return formatCents(cents);
}
