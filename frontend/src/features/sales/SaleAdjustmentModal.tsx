import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { salesService } from '../../services/sales.service';
import type { Sale, SaleAdjustmentPayload } from '../../types/sales';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';

interface SaleAdjustmentModalProps {
  saleId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Revisa la venta y permite devolver productos o anular lo que aún queda. */
export function SaleAdjustmentModal({ saleId, onClose, onSaved }: SaleAdjustmentModalProps) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<'RETURN' | 'VOID'>('RETURN');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    salesService
      .get(saleId)
      .then((loadedSale) => {
        if (!cancelled) {
          setSale(loadedSale);
          setQuantities(Object.fromEntries(loadedSale.items.map((item) => [item.id, 0])));
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof ApiError
              ? caught.message
              : 'No se pudo cargar el detalle de la venta.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const canAdjust =
    sale !== null && (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED');
  const selectedItems = sale?.items
    .filter((item) => (quantities[item.id] ?? 0) > 0)
    .map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] ?? 0 }));

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canAdjust || reason.trim().length < 3) {
      return;
    }

    let payload: SaleAdjustmentPayload;

    if (type === 'VOID') {
      payload = { type, reason: reason.trim() };
    } else {
      if (selectedItems === undefined || selectedItems.length === 0) {
        setError('Seleccione la cantidad de al menos un producto devuelto.');
        return;
      }

      payload = { type, reason: reason.trim(), items: selectedItems };
    }

    setSaving(true);
    setError(null);

    try {
      await salesService.adjust(saleId, payload);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No se pudo guardar el ajuste. Intente de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  function close(): void {
    if (!saving) {
      onClose();
    }
  }

  return (
    <Modal title={`Ajustes de la venta #${sale?.number ?? ''}`} onClose={close} size="wide">
      {sale === null && loadError === null ? (
        <p className="muted" role="status">
          Cargando venta…
        </p>
      ) : null}
      {loadError === null ? null : (
        <div className="alert alert--error" role="alert">
          {loadError}
        </div>
      )}
      {sale === null || loadError !== null ? null : (
        <>
          <p>
            Estado: <strong>{saleStatusLabel(sale.status)}</strong> · Total actual:{' '}
            <strong>{formatMoney(sale.total)}</strong>
          </p>

          {canAdjust ? (
            <form onSubmit={(event) => void submit(event)}>
              <fieldset className="form__group">
                <legend>Acción</legend>
                <label className="field__check">
                  <input
                    type="radio"
                    name="sale-adjustment-type"
                    checked={type === 'RETURN'}
                    onChange={() => setType('RETURN')}
                    disabled={saving}
                  />
                  Devolver productos seleccionados
                </label>
                <label className="field__check">
                  <input
                    type="radio"
                    name="sale-adjustment-type"
                    checked={type === 'VOID'}
                    onChange={() => setType('VOID')}
                    disabled={saving}
                  />
                  Anular venta y devolver todos los productos restantes
                </label>
              </fieldset>

              {type === 'RETURN' ? (
                <div className="table-wrapper">
                  <table className="table" aria-label="Productos disponibles para devolución">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="table__number">Vendidos</th>
                        <th className="table__number">Devueltos</th>
                        <th className="table__number">Disponibles</th>
                        <th className="table__number">Devolver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td className="table__number">{item.quantity}</td>
                          <td className="table__number">{item.returnedQuantity}</td>
                          <td className="table__number">{item.availableQuantity}</td>
                          <td className="table__number">
                            <input
                              aria-label={`Cantidad a devolver de ${item.name}`}
                              type="number"
                              min={0}
                              max={item.availableQuantity}
                              step={1}
                              value={quantities[item.id] ?? 0}
                              disabled={saving || item.availableQuantity === 0}
                              onChange={(event) => {
                                const value = Number(event.currentTarget.value);
                                setQuantities((current) => ({
                                  ...current,
                                  [item.id]: Number.isFinite(value) ? value : 0,
                                }));
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {type === 'VOID' ? (
                <p className="muted">
                  Se devolverán al inventario todos los productos que todavía no se hayan devuelto.
                </p>
              ) : null}

              <label className="field">
                Motivo <span aria-hidden="true">*</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  disabled={saving}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              </label>

              {error === null ? null : (
                <p className="alert alert--error" role="alert">
                  {error}
                </p>
              )}

              <div className="form__actions">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={
                    saving ||
                    reason.trim().length < 3 ||
                    (type === 'RETURN' && (selectedItems?.length ?? 0) === 0)
                  }
                >
                  {saving
                    ? 'Guardando…'
                    : type === 'VOID'
                      ? 'Anular venta'
                      : 'Registrar devolución'}
                </button>
                <button type="button" className="button" onClick={close} disabled={saving}>
                  Cerrar
                </button>
              </div>
            </form>
          ) : null}

          {sale.adjustments.length === 0 ? (
            <p className="muted">Esta venta todavía no tiene devoluciones ni anulaciones.</p>
          ) : (
            <section aria-labelledby="sale-adjustment-history">
              <h3 id="sale-adjustment-history">Historial de ajustes</h3>
              <ol className="sale-adjustment-history">
                {sale.adjustments.map((adjustment) => (
                  <li key={adjustment.id}>
                    <strong>
                      {adjustment.type === 'VOID' ? 'Anulación' : 'Devolución'} ·{' '}
                      {formatMoney(adjustment.total)}
                    </strong>
                    <p>{adjustment.reason}</p>
                    <p className="muted">
                      {formatDateTime(adjustment.createdAt)} ·{' '}
                      {adjustment.items
                        .map((item) => `${item.productName} × ${item.quantity}`)
                        .join(', ')}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </Modal>
  );
}

function saleStatusLabel(status: Sale['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'Completada';
    case 'PARTIALLY_RETURNED':
      return 'Con devolución parcial';
    case 'RETURNED':
      return 'Devuelta por completo';
    case 'VOID':
      return 'Anulada';
  }
}
