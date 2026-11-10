import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import type {
  PurchaseOrder,
  RestockSuggestion,
  RestockSuggestionGroup,
} from '../../types/purchase-orders';
import { formatMoney } from '../products/money';
import type { Notice } from '../products/use-products';
import { formatOrderNumber, MAX_QUANTITY, parseQuantity } from './purchase-order-form';

interface RestockSuggestionsProps {
  onClose: () => void;
  /** Avisa a la pantalla que se guardó un pedido, para refrescar el historial. */
  onOrderCreated: (order: PurchaseOrder) => void;
}

/** Cantidad escrita por producto (`productId → texto`); vacío = no se pide. */
type Quantities = Record<string, string>;

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** Cantidades sugeridas, sin pisar las que el dueño ya ajustó. */
function mergeQuantities(suggestion: RestockSuggestion, current: Quantities): Quantities {
  const next: Quantities = {};

  for (const group of suggestion.groups) {
    for (const item of group.items) {
      next[item.productId] = current[item.productId] ?? String(item.suggestedQuantity);
    }
  }

  return next;
}

function groupLines(group: RestockSuggestionGroup, quantities: Quantities) {
  return group.items.flatMap((item) => {
    const quantity = parseQuantity(quantities[item.productId] ?? '');

    return quantity === null || item.unitCost === null
      ? []
      : [{ productId: item.productId, quantity, unitCost: item.unitCost }];
  });
}

function groupTotal(lines: { quantity: number; unitCost: string }[]): string {
  const cents = lines.reduce(
    (sum, line) => sum + Math.round(Number(line.unitCost) * 100) * line.quantity,
    0,
  );

  return (cents / 100).toFixed(2);
}

/**
 * Sugerencia de pedido por stock bajo (HU-23): los productos en o bajo su
 * mínimo, agrupados por proveedor, con una cantidad sugerida que el dueño puede
 * ajustar antes de generar el pedido de cada proveedor.
 */
export function RestockSuggestions({ onClose, onOrderCreated }: RestockSuggestionsProps) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [suggestion, setSuggestion] = useState<RestockSuggestion | null>(null);
  const [quantities, setQuantities] = useState<Quantities>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await purchaseOrdersService.suggestions();
      setSuggestion(data);
      setQuantities((current) => mergeQuantities(data, current));
      setPhase('ready');
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error) });
      setPhase('failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(group: RestockSuggestionGroup): Promise<void> {
    if (group.supplierId === null) {
      return;
    }

    const invalid = group.items.some((item) => {
      const text = quantities[item.productId] ?? '';
      return text.trim() !== '' && parseQuantity(text) === null;
    });

    if (invalid) {
      setNotice({
        kind: 'error',
        text: `Las cantidades deben ser números enteros entre 1 y ${MAX_QUANTITY.toLocaleString('es-CR')}.`,
      });
      return;
    }

    const lines = groupLines(group, quantities);

    if (lines.length === 0) {
      setNotice({ kind: 'error', text: 'Agregue al menos un producto al pedido.' });
      return;
    }

    setSaving(group.supplierId);
    setNotice(null);

    try {
      const order = await purchaseOrdersService.create({
        supplierId: group.supplierId,
        notes: null,
        items: lines.map(({ productId, quantity }) => ({ productId, quantity })),
      });
      setNotice({
        kind: 'success',
        text: `Pedido ${formatOrderNumber(order.number)} a ${order.supplierName} guardado en el historial.`,
      });
      onOrderCreated(order);
      // Lo pedido ahora está pendiente: la sugerencia se recalcula sin ese grupo.
      await load();
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error) });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      title="Sugerencia de pedido"
      size="wide"
      onClose={() => {
        if (saving === null) {
          onClose();
        }
      }}
    >
      {notice === null ? null : (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
        </p>
      )}

      {phase === 'loading' ? <p className="muted">Calculando sugerencia…</p> : null}

      {phase === 'failed' ? (
        <button type="button" className="button" onClick={() => void load()}>
          Reintentar
        </button>
      ) : null}

      {phase === 'ready' && suggestion !== null && suggestion.groups.length === 0 ? (
        <p className="alert alert--success" role="status">
          {suggestion.message ?? 'No hay sugerencias de pedido pendientes.'}
        </p>
      ) : null}

      {phase === 'ready' && suggestion !== null
        ? suggestion.groups.map((group) => {
            const lines = groupLines(group, quantities);
            const key = group.supplierId ?? 'sin-proveedor';

            return (
              <section
                key={key}
                className="card"
                aria-label={group.supplierName ?? 'Sin proveedor'}
              >
                <header className="card__header">
                  <h2>{group.supplierName ?? 'Sin proveedor asignado'}</h2>
                  {group.supplierId === null ? null : (
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={saving !== null || lines.length === 0}
                      onClick={() => void confirm(group)}
                    >
                      {saving === group.supplierId ? 'Guardando…' : 'Generar pedido'}
                    </button>
                  )}
                </header>
                {group.supplierId === null ? (
                  <p className="muted">
                    Estos productos no tienen un proveedor activo. Asócielos en Proveedores para
                    poder pedirlos.
                  </p>
                ) : null}
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Producto</th>
                        <th className="table__number">Stock</th>
                        <th className="table__number">Mínimo</th>
                        <th className="table__number">En pedidos pendientes</th>
                        <th className="table__number">Costo unitario</th>
                        <th className="table__number">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={item.productId}>
                          <td>{item.productCode}</td>
                          <td>{item.productName}</td>
                          <td className="table__number">{item.stock}</td>
                          <td className="table__number">{item.minStock}</td>
                          <td className="table__number">{item.pendingQuantity}</td>
                          <td className="table__number">
                            {item.unitCost === null ? '—' : formatMoney(item.unitCost)}
                          </td>
                          <td className="table__number">
                            {group.supplierId === null ? (
                              item.suggestedQuantity
                            ) : (
                              <input
                                className="order-quantity"
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                aria-label={`Cantidad de ${item.productName}`}
                                value={quantities[item.productId] ?? ''}
                                disabled={saving !== null}
                                onChange={(event) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [item.productId]: event.target.value,
                                  }))
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {group.supplierId === null ? null : (
                      <tfoot>
                        <tr>
                          <th colSpan={6} className="table__number">
                            Total ({lines.length} producto(s))
                          </th>
                          <th className="table__number">{formatMoney(groupTotal(lines))}</th>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
            );
          })
        : null}

      <div className="form__actions modal__actions">
        <button type="button" className="button" onClick={onClose} disabled={saving !== null}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
