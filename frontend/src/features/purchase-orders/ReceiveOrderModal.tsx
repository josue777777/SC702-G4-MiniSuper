import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import type { PurchaseOrder, ReceiveOrderPayload } from '../../types/purchase-orders';
import { todayInBusinessZone } from '../reports/report-filters';
import { formatOrderNumber } from './purchase-order-form';

interface ReceiveOrderModalProps {
  order: PurchaseOrder;
  busy: boolean;
  /** Guarda la entrega; devuelve el error del servidor o `null` si se guardó. */
  onSubmit: (payload: ReceiveOrderPayload) => Promise<string | null>;
  onClose: () => void;
}

/** Cantidad escrita → entero ≥ 0, o `null` si no es válida. */
function parseQuantity(text: string): number | null {
  return /^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * Registrar una entrega del proveedor (HU-38): la factura, el día REAL en que
 * llegó y lo que llegó de cada producto (de entrada, lo que falta; se corrige
 * si vino menos). Solo se listan los productos que todavía faltan.
 *
 * Al guardar se elige qué pasa con el inventario, con dos botones claros:
 * cargarlo ya, o dejar la carga pendiente para confirmarla después (por
 * ejemplo, cuando se terminó de revisar la mercadería). El pedido sigue
 * abierto hasta que llega todo o se da por concluido.
 *
 * @example faltan 10 cafés, llegan 6 con la factura F-120 → el pedido queda
 * «Recibido en parte» y faltan 4.
 */
export function ReceiveOrderModal({ order, busy, onSubmit, onClose }: ReceiveOrderModalProps) {
  const today = todayInBusinessZone();
  const pending = order.items.filter((item) => item.pendingQuantity > 0);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(pending.map((item) => [item.productId, String(item.pendingQuantity)])),
  );
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (invoiceNumber.trim() === '') {
      return 'Indique el número de factura.';
    }

    if (receivedOn === '' || receivedOn > today) {
      return 'Indique el día en que llegó (no puede ser futuro).';
    }

    for (const item of pending) {
      const quantity = parseQuantity(quantities[item.productId] ?? '');

      if (quantity === null) {
        return `Revise la cantidad de ${item.productName}: debe ser un número entero.`;
      }

      if (quantity > item.pendingQuantity) {
        return `De ${item.productName} faltan ${item.pendingQuantity}: no puede llegar más.`;
      }
    }

    if (pending.every((item) => parseQuantity(quantities[item.productId] ?? '') === 0)) {
      return 'Anote al menos un producto que haya llegado.';
    }

    return null;
  }

  async function save(loadNow: boolean): Promise<void> {
    const found = validate();

    setError(found);

    if (found !== null) {
      return;
    }

    const failed = await onSubmit({
      invoiceNumber: invoiceNumber.trim(),
      receivedOn,
      loadNow,
      items: pending.map((item) => ({
        productId: item.productId,
        quantity: parseQuantity(quantities[item.productId] ?? '') ?? 0,
      })),
    });

    if (failed === null) {
      onClose();
    } else {
      setError(failed);
    }
  }

  return (
    <Modal
      title={`Registrar entrega · ${formatOrderNumber(order.number)}`}
      size="wide"
      onClose={onClose}
    >
      <form
        className="form"
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void save(true);
        }}
      >
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="receipt-invoice">N.º de factura</label>
            <input
              id="receipt-invoice"
              value={invoiceNumber}
              maxLength={40}
              autoComplete="off"
              autoFocus
              onChange={(event) => setInvoiceNumber(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="receipt-date">Día en que llegó</label>
            <input
              id="receipt-date"
              type="date"
              value={receivedOn}
              max={today}
              onChange={(event) => setReceivedOn(event.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table" aria-label="Lo que llegó">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="table__number">Pedido</th>
                <th className="table__number">Falta</th>
                <th className="table__number">Llegó</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((item) => (
                <tr key={item.productId}>
                  <td>{item.productCode}</td>
                  <td>{item.productName}</td>
                  <td className="table__number">{item.quantity}</td>
                  <td className="table__number">{item.pendingQuantity}</td>
                  <td className="table__number">
                    <input
                      type="number"
                      min="0"
                      max={item.pendingQuantity}
                      step="1"
                      aria-label={`Llegó de ${item.productName}`}
                      value={quantities[item.productId] ?? ''}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.productId]: event.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted hint">
          Anote lo que realmente llegó; 0 si un producto no vino en esta entrega. Lo que no llegue
          sigue pendiente en el pedido.
        </p>

        {error === null ? null : (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Registrar y cargar al inventario'}
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void save(false)}>
            Registrar y dejar la carga pendiente
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
