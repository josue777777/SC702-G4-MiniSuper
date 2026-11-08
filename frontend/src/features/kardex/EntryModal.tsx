import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { kardexService } from '../../services/kardex.service';
import { suppliersService } from '../../services/suppliers.service';
import type { KardexProduct } from '../../types/kardex';
import type { Supplier } from '../../types/suppliers';
import { formatMoney } from '../products/money';
import {
  emptyLot,
  lotsError,
  lotsTotal,
  parseUnits,
  toReceiptLots,
  type LotDraft,
} from '../purchase-orders/receipt-lots';
import { todayInBusinessZone } from '../reports/report-filters';

/** Costo escrito → «4850.00», o `null` si no es un monto válido. */
function parseCost(text: string): string | null {
  const clean = text.trim().replace(',', '.');

  return /^\d{1,10}(\.\d{1,2})?$/.test(clean) ? Number(clean).toFixed(2) : null;
}

interface EntryModalProps {
  product: KardexProduct;
  /** Guardado: el aviso para la pantalla (y se recargan ficha e historial). */
  onSaved: (message: string) => void;
  onClose: () => void;
}

/**
 * «+ Ingreso» (HU-38): entrada INDIVIDUAL de un producto sin pedido previo,
 * una compra directa al proveedor. Lo que llega con un pedido va por «Carga
 * de pedido», que trae todos sus productos a la vez.
 *
 * Se anota la factura (la referencia), el proveedor, la fecha, la cantidad,
 * el costo unitario y los lotes (de 4 en 4, regla 2). Sin factura o con 0
 * unidades no se guarda. Si el producto vence, cada lote lleva su fecha; si
 * no, sin lote escrito el lote es la factura. Los lotes suman la cantidad.
 */
export function EntryModal({ product, onSaved, onClose }: EntryModalProps) {
  const today = todayInBusinessZone();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoice, setInvoice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState(product.cost);
  const [lots, setLots] = useState<LotDraft[]>([emptyLot()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const indexed = lots.map((lot, index) => ({ lot, index }));
  const pages = usePagination(indexed, product.id, MODAL_PAGE_SIZE);
  const units = parseUnits(quantity);
  const unitCost = parseCost(cost);

  useEffect(() => {
    suppliersService
      .list()
      .then((list) => setSuppliers(list.filter((supplier) => supplier.isActive)))
      .catch(() => setSuppliers([]));
  }, []);

  function changeQuantity(text: string): void {
    setQuantity(text);
    // Con un solo lote, el lote es todo lo que entra.
    setLots((current) =>
      current.length === 1 && current[0] !== undefined
        ? [{ ...current[0], quantity: text }]
        : current,
    );
  }

  function changeLot(index: number, field: keyof LotDraft, value: string): void {
    setLots((current) =>
      current.map((lot, position) => (position === index ? { ...lot, [field]: value } : lot)),
    );
  }

  function validate(): string | null {
    if (invoice.trim() === '') {
      return 'Indique el número de factura (la referencia del ingreso).';
    }

    if (supplierId === '') {
      return 'Elija el proveedor.';
    }

    if (date === '' || date > today) {
      return 'Indique la fecha de la factura (no puede ser futura).';
    }

    if (units === null || units <= 0) {
      return 'La cantidad debe ser mayor que 0.';
    }

    if (unitCost === null) {
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

    return lotsTotal(lots) === units
      ? null
      : `Los lotes suman ${lotsTotal(lots)}, pero entran ${units}.`;
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const found = validate();

    setError(found);

    if (found !== null || units === null || unitCost === null) {
      return;
    }

    setBusy(true);

    try {
      await kardexService.registerEntry(product.id, {
        supplierId,
        invoiceNumber: invoice.trim(),
        documentDate: date,
        quantity: units,
        unitCost,
        lots: toReceiptLots(product, lots),
      });
      onSaved(
        `Ingreso registrado: +${units.toLocaleString('es-CR')} de ${product.name} (factura ${invoice.trim()}).`,
      );
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Ocurrió un error inesperado. Intente de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  const total = units === null || unitCost === null ? null : (Number(unitCost) * units).toFixed(2);

  return (
    <Modal title={`Ingreso · ${product.code} ${product.name}`} size="wide" onClose={onClose}>
      <form
        className="form"
        noValidate
        // Al corregir cualquier dato, el aviso anterior ya no aplica.
        onChange={() => setError(null)}
        onSubmit={(event) => void save(event)}
      >
        <p className="muted">
          Compra directa, sin pedido. Lo que llega con un pedido se registra en «Carga de pedido».
        </p>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="entry-invoice">N.º factura</label>
            <input
              id="entry-invoice"
              value={invoice}
              maxLength={40}
              autoComplete="off"
              data-autofocus
              onChange={(event) => setInvoice(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="entry-supplier">Proveedor</label>
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
          </div>
          <div className="form__field">
            <label htmlFor="entry-date">Fecha de la factura</label>
            <input
              id="entry-date"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="entry-quantity">Cantidad</label>
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
            <label htmlFor="entry-cost">Costo unitario (₡)</label>
            <input
              id="entry-cost"
              inputMode="decimal"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table" aria-label="Lotes del ingreso">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Vence</th>
                <th className="table__number">Unidades</th>
                <th>
                  <span className="visually-hidden">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.pageItems.map(({ lot, index }) => (
                <tr key={index}>
                  <td>
                    <input
                      aria-label={`Lote ${index + 1}`}
                      value={lot.lotNumber}
                      maxLength={40}
                      autoComplete="off"
                      placeholder={product.perishable ? '' : 'N.º de factura'}
                      onChange={(event) => changeLot(index, 'lotNumber', event.target.value)}
                    />
                  </td>
                  <td>
                    {product.perishable ? (
                      <input
                        type="date"
                        aria-label={`Vence el lote ${index + 1}`}
                        min={date}
                        value={lot.expirationDate}
                        onChange={(event) => changeLot(index, 'expirationDate', event.target.value)}
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
                      onChange={(event) => changeLot(index, 'quantity', event.target.value)}
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
                        Quitar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pages} itemLabel="lotes" onPage={pages.setPage} />
        <div className="form__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              setLots((current) => [
                emptyLot(Math.max(0, (units ?? 0) - lotsTotal(current))),
                ...current,
              ]);
              pages.setPage(1);
            }}
          >
            + Agregar lote
          </button>
          <span className="muted" aria-label="Suma de los lotes">
            Los lotes suman {lotsTotal(lots).toLocaleString('es-CR')} de{' '}
            {(units ?? 0).toLocaleString('es-CR')}.
          </span>
        </div>

        <p className="muted" role="status">
          Stock: {product.stock.toLocaleString('es-CR')} →{' '}
          <strong>{(product.stock + (units ?? 0)).toLocaleString('es-CR')}</strong> · Total al
          costo: <strong>{total === null ? '—' : formatMoney(total)}</strong>
        </p>

        {error === null ? null : (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar ingreso'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
