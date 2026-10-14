import { useState, type FormEvent } from 'react';
import type { PurchaseOrderPayload } from '../../types/purchase-orders';
import type { Supplier } from '../../types/suppliers';
import { formatMoney } from '../products/money';
import {
  buildOrderLines,
  calculateOrderTotal,
  toOrderPayload,
  validateOrder,
  type QuantityInputs,
} from './purchase-order-form';

interface PurchaseOrderFormProps {
  suppliers: Supplier[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: PurchaseOrderPayload) => void;
}

/**
 * Armar un pedido a un proveedor (HU-24): se elige el proveedor, aparecen los
 * productos que él suministra con el costo acordado (HU-21) y se escribe la
 * cantidad de cada uno. Sin productos no se puede generar el pedido.
 */
export function PurchaseOrderForm({ suppliers, busy, onCancel, onSubmit }: PurchaseOrderFormProps) {
  const [supplierId, setSupplierId] = useState('');
  const [quantities, setQuantities] = useState<QuantityInputs>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const supplier = suppliers.find((item) => item.id === supplierId);
  const products = supplier?.products ?? [];
  const lines = buildOrderLines(products, quantities);
  const total = calculateOrderTotal(lines);
  // Una cantidad mal escrita se avisa en el momento, no hasta enviar.
  const typedSomething = Object.values(quantities).some((text) => text.trim() !== '');
  const liveError = typedSomething ? validateOrder(supplierId, quantities, lines) : null;

  function chooseSupplier(id: string): void {
    // Otro proveedor tiene otro catálogo y otros costos: se empieza de cero.
    setSupplierId(id);
    setQuantities({});
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const message = validateOrder(supplierId, quantities, lines);
    setError(message);

    if (message === null) {
      onSubmit(toOrderPayload(supplierId, notes, lines));
    }
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Nuevo pedido</h2>
      </header>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="order-supplier">Proveedor *</label>
            <select
              id="order-supplier"
              value={supplierId}
              onChange={(event) => chooseSupplier(event.target.value)}
            >
              <option value="">Seleccione…</option>
              {suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label htmlFor="order-notes">Notas</label>
            <input
              id="order-notes"
              value={notes}
              autoComplete="off"
              placeholder="Ej.: entregar el lunes en la mañana"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        {supplier === undefined ? (
          <p className="muted">Elija un proveedor para ver los productos que le suministra.</p>
        ) : products.length === 0 ? (
          <p className="muted">
            Este proveedor no tiene productos asociados. Agrégueselos en Proveedores.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table order-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="table__number">Costo unitario</th>
                  <th className="table__number">Cantidad</th>
                  <th className="table__number">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const line = lines.find((item) => item.productId === product.productId);

                  return (
                    <tr key={product.productId}>
                      <td>{product.productCode}</td>
                      <td>{product.productName}</td>
                      <td className="table__number">{formatMoney(product.unitCost)}</td>
                      <td className="table__number">
                        <input
                          className="order-quantity"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Cantidad de ${product.productName}`}
                          value={quantities[product.productId] ?? ''}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [product.productId]: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="table__number">
                        {line === undefined ? '—' : formatMoney(line.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4} className="table__number">
                    Total ({lines.length} producto(s))
                  </th>
                  <th className="table__number">{formatMoney(total)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {(liveError ?? error) === null ? null : <p className="form__error">{liveError ?? error}</p>}

        <div className="form__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || lines.length === 0}
            title={lines.length === 0 ? 'Agregue al menos un producto' : undefined}
          >
            {busy ? 'Guardando…' : 'Generar pedido'}
          </button>
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
