import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { kardexService } from '../../services/kardex.service';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import { suppliersService } from '../../services/suppliers.service';
import type { KardexProduct } from '../../types/kardex';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/purchase-orders';
import type { Supplier } from '../../types/suppliers';
import { formatMoney } from '../products/money';
import { formatOrderNumber } from '../purchase-orders/purchase-order-form';
import { ReceiveOrderModal } from '../purchase-orders/ReceiveOrderModal';
import {
  emptyLot,
  lotsError,
  lotsTotal,
  parseUnits,
  toReceiptLots,
  type LotDraft,
} from '../purchase-orders/receipt-lots';
import { todayInBusinessZone } from '../reports/report-filters';
import { orderNumberOf } from './kardex-format';

/** Mensaje de un error de la API, o uno genérico. */
function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** Costo escrito → «4850.00», o `null` si no es un monto válido. */
function parseCost(text: string): string | null {
  const clean = text.trim().replace(',', '.');

  return /^\d{1,10}(\.\d{1,2})?$/.test(clean) ? Number(clean).toFixed(2) : null;
}

interface EntryPanelProps {
  product: KardexProduct;
  /** Guardado: el aviso para la pantalla (y se recargan ficha e historial). */
  onSaved: (message: string) => void;
}

/**
 * «+ Ingreso» de Movimientos (HU-38): entra mercadería de ESTE producto, con
 * sus lotes, desde el kardex. Dos caminos en el mismo formulario:
 *
 * - **Con pedido**: se escribe el N.º de pedido (PED-0421) y se precargan el
 *   proveedor, lo que falta de este producto y su costo; al guardar, la
 *   entrega queda en el pedido (recibido o parcial) y entra al inventario.
 *   «Registrar todo el pedido» abre la misma ventana de Pedidos con todos
 *   sus productos (una ventana, dos puertas).
 * - **Sin pedido** (compra directa): factura, proveedor, fecha, cantidad y
 *   costo; queda como «Compra directa» con la factura como documento.
 *
 * Sin factura (referencia) o con 0 unidades no se guarda. Si el producto
 * vence, cada lote lleva su fecha; los lotes suman exactamente la cantidad.
 */
export function EntryPanel({ product, onSaved }: EntryPanelProps) {
  const today = todayInBusinessZone();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orderText, setOrderText] = useState('');
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [line, setLine] = useState<PurchaseOrderItem | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [wholeOrder, setWholeOrder] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState(product.cost);
  const [lots, setLots] = useState<LotDraft[]>([emptyLot()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    suppliersService
      .list()
      .then((list) => setSuppliers(list.filter((supplier) => supplier.isActive)))
      .catch(() => setSuppliers([]));
  }, []);

  const units = parseUnits(quantity);
  const unitCost = parseCost(cost);

  function reset(): void {
    setOrderText('');
    setOrder(null);
    setLine(null);
    setOrderError(null);
    setInvoice('');
    setSupplierId('');
    setDate(today);
    setQuantity('');
    setCost(product.cost);
    setLots([emptyLot()]);
    setError(null);
  }

  function changeQuantity(text: string): void {
    setQuantity(text);
    // Con un solo lote, el lote es todo lo que entra.
    setLots((current) =>
      current.length === 1 ? [{ ...current[0], quantity: text } as LotDraft] : current,
    );
  }

  /** Busca el pedido escrito y precarga proveedor, lo que falta y el costo de este producto. */
  async function loadOrder(): Promise<void> {
    const number = orderNumberOf(orderText);

    setOrderError(null);

    if (number === null) {
      setOrderError('Escriba el número de pedido, por ejemplo PED-0421.');

      return;
    }

    try {
      const summary = (await purchaseOrdersService.list()).find((item) => item.number === number);

      if (summary === undefined) {
        setOrderError(`No existe el pedido ${formatOrderNumber(number)}.`);

        return;
      }

      const found = await purchaseOrdersService.get(summary.id);
      const item = found.items.find((candidate) => candidate.productId === product.id);

      if (found.status === 'RECEIVED') {
        setOrderError(`El pedido ${formatOrderNumber(number)} ya está recibido.`);
      } else if (item === undefined) {
        setOrderError(`El pedido ${formatOrderNumber(number)} no incluye ${product.name}.`);
      } else if (item.pendingQuantity === 0) {
        setOrderError(
          `De ${product.name} ya llegó todo lo del pedido ${formatOrderNumber(number)}.`,
        );
      } else {
        setOrder(found);
        setLine(item);
        setOrderText(formatOrderNumber(number));
        setSupplierId(found.supplierId);
        setCost(item.unitCost);
        changeQuantity(String(item.pendingQuantity));
      }
    } catch (failure) {
      setOrderError(describeError(failure));
    }
  }

  function validate(): string | null {
    if (invoice.trim() === '') {
      return 'Indique el número de factura (la referencia del ingreso).';
    }

    if (order === null && supplierId === '') {
      return 'Elija el proveedor.';
    }

    if (date === '' || date > today) {
      return 'Indique la fecha de la factura (no puede ser futura).';
    }

    if (units === null || units <= 0) {
      return 'La cantidad debe ser mayor que 0.';
    }

    if (line !== null && units > line.pendingQuantity) {
      return `Del pedido faltan ${line.pendingQuantity}: no puede entrar más.`;
    }

    if (order === null && unitCost === null) {
      return 'Indique un costo unitario válido.';
    }

    const problem = lotsError(
      { productName: product.name, pendingQuantity: units, perishable: product.perishable },
      lots,
      date,
    );

    if (problem !== null) {
      return problem;
    }

    if (lotsTotal(lots) !== units) {
      return `Los lotes suman ${lotsTotal(lots)}, pero entran ${units}.`;
    }

    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const found = validate();

    setError(found);

    if (found !== null || units === null) {
      return;
    }

    setBusy(true);

    try {
      const receiptLots = toReceiptLots(product, lots);

      if (order === null) {
        await kardexService.registerEntry(product.id, {
          supplierId,
          invoiceNumber: invoice.trim(),
          documentDate: date,
          quantity: units,
          unitCost: unitCost ?? '0.00',
          lots: receiptLots,
        });
      } else {
        await purchaseOrdersService.receive(order.id, {
          invoiceNumber: invoice.trim(),
          receivedOn: date,
          loadNow: true,
          items: [{ productId: product.id, quantity: units, lots: receiptLots }],
        });
      }

      onSaved(
        `Ingreso registrado: +${units.toLocaleString('es-CR')} de ${product.name} (factura ${invoice.trim()}).`,
      );
      reset();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  const total = units === null || unitCost === null ? null : (Number(unitCost) * units).toFixed(2);

  return (
    <section className="kardex-panel" aria-label="Registrar ingreso">
      <h2 className="kardex-panel__title">
        + Ingreso ·{' '}
        {order === null ? 'Compra directa' : `Recepción ${formatOrderNumber(order.number)}`} ·{' '}
        {product.code}
      </h2>
      <form className="kardex-panel__body form" noValidate onSubmit={(event) => void save(event)}>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="entry-order">N.º pedido (si viene de uno)</label>
            <div className="field-with-action">
              <input
                id="entry-order"
                value={orderText}
                placeholder="PED-0421"
                autoComplete="off"
                disabled={order !== null}
                onChange={(event) => setOrderText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void loadOrder();
                  }
                }}
              />
              {order === null ? (
                <button type="button" className="button" onClick={() => void loadOrder()}>
                  Cargar pedido
                </button>
              ) : (
                <button type="button" className="button" onClick={reset}>
                  Quitar pedido
                </button>
              )}
            </div>
            {orderError === null ? null : (
              <p className="form__error" role="alert">
                {orderError}
              </p>
            )}
          </div>
          <div className="form__field">
            <label htmlFor="entry-invoice">N.º factura</label>
            <input
              id="entry-invoice"
              value={invoice}
              maxLength={40}
              autoComplete="off"
              onChange={(event) => setInvoice(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="entry-supplier">Proveedor</label>
            {order === null ? (
              <select
                id="entry-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Elija el proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            ) : (
              <input id="entry-supplier" value={order.supplierName} disabled />
            )}
          </div>
          <div className="form__field">
            <label htmlFor="entry-date">Fecha</label>
            <input
              id="entry-date"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="entry-quantity">
              Cantidad{line === null ? '' : ` (faltan ${line.pendingQuantity})`}
            </label>
            <input
              id="entry-quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => changeQuantity(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="entry-cost">Costo unit.</label>
            <input
              id="entry-cost"
              inputMode="decimal"
              className="input--money"
              value={cost}
              disabled={order !== null}
              onChange={(event) => setCost(event.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table" aria-label="Lotes del ingreso">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Vencimiento</th>
                <th className="table__number">Cantidad</th>
                <th>
                  <span className="visually-hidden">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot, index) => (
                <tr key={index}>
                  <td>
                    <input
                      aria-label={`Lote ${index + 1}`}
                      value={lot.lotNumber}
                      maxLength={40}
                      autoComplete="off"
                      placeholder={product.perishable ? '' : 'N.º de factura'}
                      onChange={(event) =>
                        setLots((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, lotNumber: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    {product.perishable ? (
                      <input
                        type="date"
                        aria-label={`Vence el lote ${index + 1}`}
                        min={date}
                        value={lot.expirationDate}
                        onChange={(event) =>
                          setLots((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, expirationDate: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    ) : (
                      <span className="muted">No vence</span>
                    )}
                  </td>
                  <td className="table__number">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      aria-label={`Unidades del lote ${index + 1}`}
                      value={lot.quantity}
                      onChange={(event) =>
                        setLots((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, quantity: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    {lots.length > 1 ? (
                      <button
                        type="button"
                        className="button"
                        aria-label={`Quitar el lote ${index + 1}`}
                        onClick={() =>
                          setLots((current) => current.filter((_, position) => position !== index))
                        }
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setLots((current) => [
                        ...current,
                        emptyLot(Math.max(0, (units ?? 0) - lotsTotal(current))),
                      ])
                    }
                  >
                    + Agregar lote
                  </button>
                </td>
                <td className="table__number" aria-label="Suma de los lotes">
                  {lotsTotal(lots).toLocaleString('es-CR')} / {(units ?? 0).toLocaleString('es-CR')}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {error === null ? null : (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}

        <div className="kardex-panel__footer">
          <div className="kardex-panel__figures" role="status">
            <span>
              Saldo: <strong>{product.stock.toLocaleString('es-CR')}</strong> →{' '}
              <strong className="flow-in">
                {(product.stock + (units ?? 0)).toLocaleString('es-CR')}
              </strong>
            </span>
            <span>
              Total al costo: <strong>{total === null ? '—' : formatMoney(total)}</strong>
            </span>
          </div>
          <div className="form__actions">
            {order === null ? null : (
              <button type="button" className="button" onClick={() => setWholeOrder(true)}>
                Registrar todo el pedido {formatOrderNumber(order.number)}
              </button>
            )}
            <button type="button" className="button" onClick={reset}>
              Limpiar
            </button>
            <button type="submit" className="button button--in" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar ingreso'}
            </button>
          </div>
        </div>
      </form>

      {order === null || !wholeOrder ? null : (
        <ReceiveOrderModal
          order={order}
          busy={busy}
          onSubmit={async (payload, file) => {
            try {
              const updated = await purchaseOrdersService.receive(order.id, payload);
              const receipt = updated.receipts.find(
                (candidate) => candidate.invoiceNumber === payload.invoiceNumber,
              );

              if (file !== null && receipt !== undefined) {
                await purchaseOrdersService.attachInvoice(order.id, receipt.id, file);
              }

              onSaved(
                `Entrega ${payload.invoiceNumber} del pedido ${formatOrderNumber(order.number)} registrada.`,
              );
              reset();
              setWholeOrder(false);

              return null;
            } catch (failure) {
              return describeError(failure);
            }
          }}
          onClose={() => setWholeOrder(false)}
        />
      )}
    </section>
  );
}
