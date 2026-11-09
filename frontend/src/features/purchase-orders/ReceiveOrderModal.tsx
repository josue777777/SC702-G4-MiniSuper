import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { PurchaseOrder, ReceiveOrderPayload } from '../../types/purchase-orders';
import { todayInBusinessZone } from '../reports/report-filters';
import { INVOICE_ACCEPT, invoiceFileError } from './invoice-file';
import { InvoicePreview } from './InvoicePreview';
import { formatOrderNumber } from './purchase-order-form';
import { ReceiptLotsModal } from './ReceiptLotsModal';
import { emptyLot, lotsError, lotsTotal, toReceiptLots, type LotDraft } from './receipt-lots';

interface ReceiveOrderModalProps {
  order: PurchaseOrder;
  busy: boolean;
  /**
   * Guarda la entrega (y, si se eligió, adjunta la factura del proveedor);
   * devuelve el error del servidor o `null` si la entrega se guardó. Con
   * `null`, quien abrió la ventana decide a dónde se va (esta no se cierra
   * sola): `payload.loadNow` dice qué botón se tocó.
   */
  onSubmit: (payload: ReceiveOrderPayload, invoice: File | null) => Promise<string | null>;
  onClose: () => void;
}

/**
 * Registrar una entrega del proveedor (HU-38): la factura, el día REAL en que
 * llegó y lo que llegó de cada producto (de entrada, lo que falta; se corrige
 * si vino menos). Solo se listan los productos que todavía faltan.
 *
 * Al guardar se elige qué pasa con el inventario, con dos botones claros:
 * «Registrar y cargar al inventario» (pasa a la última verificación, en
 * Movimientos › «Carga de pedido») o «Registrar y dejar la carga pendiente»
 * (vuelve a la ventana de antes). «Cancelar» también vuelve a la de antes,
 * sin guardar. El pedido sigue abierto hasta que llega todo o se concluye.
 *
 * La factura del proveedor (PDF o foto) se puede adjuntar aquí mismo: se
 * muestra al lado de las cantidades, para ir leyéndola mientras se anotan. Es
 * opcional; también se adjunta después desde «Ver pedido» › Entregas.
 *
 * Lotes (HU-38): cada producto lleva su lote y, si vence, su fecha de
 * vencimiento, en la misma fila. Si llegó en varios lotes, «Partir en lotes»
 * abre una ventana solo para ese producto; la fila muestra cuántos lotes son,
 * el que vence primero y la suma. Un producto que «No vence» no pide fecha y,
 * sin lote escrito, su lote es la factura.
 *
 * @example faltan 10 cafés, llegan 6 con la factura F-120 → el pedido queda
 * «Parcial» y faltan 4.
 */
export function ReceiveOrderModal({ order, busy, onSubmit, onClose }: ReceiveOrderModalProps) {
  const today = todayInBusinessZone();
  const pending = order.items.filter((item) => item.pendingQuantity > 0);
  // De 4 en 4 (regla 2): lo escrito en cada producto se conserva al cambiar de página.
  const pages = usePagination(pending, order.id, MODAL_PAGE_SIZE);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  // Cada producto, con sus lotes; de entrada, todo lo que falta en un solo lote.
  const [lots, setLots] = useState<Record<string, LotDraft[]>>(() =>
    Object.fromEntries(pending.map((item) => [item.productId, [emptyLot(item.pendingQuantity)]])),
  );
  /** Producto cuya ventana «Partir en lotes» está abierta. */
  const [splitting, setSplitting] = useState<string | null>(null);
  const splittingItem = pending.find((item) => item.productId === splitting);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    const problem = file === null ? null : invoiceFileError(file);

    setFileError(problem);
    setInvoice(problem === null ? file : null);
  }

  function lotsOf(productId: string): LotDraft[] {
    return lots[productId] ?? [];
  }

  /** Cambia un dato del único lote de la fila. */
  function changeSingle(productId: string, field: keyof LotDraft, value: string): void {
    setLots((current) => ({
      ...current,
      [productId]: (current[productId] ?? [emptyLot()]).map((lot, index) =>
        index === 0 ? { ...lot, [field]: value } : lot,
      ),
    }));
  }

  function validate(): string | null {
    if (invoiceNumber.trim() === '') {
      return 'Indique el número de factura.';
    }

    if (receivedOn === '' || receivedOn > today) {
      return 'Indique el día en que llegó (no puede ser futuro).';
    }

    for (const item of pending) {
      const problem = lotsError(item, lotsOf(item.productId), receivedOn);

      if (problem !== null) {
        return problem;
      }
    }

    if (pending.every((item) => lotsTotal(lotsOf(item.productId)) === 0)) {
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

    const failed = await onSubmit(
      {
        invoiceNumber: invoiceNumber.trim(),
        receivedOn,
        loadNow,
        items: pending.map((item) => ({
          productId: item.productId,
          quantity: lotsTotal(lotsOf(item.productId)),
          lots: toReceiptLots(item, lotsOf(item.productId)),
        })),
      },
      invoice,
    );

    if (failed !== null) {
      setError(failed);
    }
  }

  return (
    <Modal
      title={`Registrar entrega · ${formatOrderNumber(order.number)}`}
      size="wide"
      onClose={onClose}
    >
      <div className={invoice === null ? undefined : 'invoice-split'}>
        {invoice === null ? null : <InvoicePreview file={invoice} name={invoice.name} />}
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
                data-autofocus
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

          <div className="form__field">
            <label htmlFor="receipt-file">Factura del proveedor (opcional)</label>
            <input id="receipt-file" type="file" accept={INVOICE_ACCEPT} onChange={chooseFile} />
            {fileError === null ? (
              <p className="muted hint">
                PDF o foto de la factura, hasta 5 MB. Se ve aquí al lado.
              </p>
            ) : (
              <p className="form__error" role="alert">
                {fileError}
              </p>
            )}
          </div>

          <div className="table-wrapper">
            <table className="table" aria-label="Lo que llegó">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="table__number">Falta</th>
                  <th className="table__number">Llegó</th>
                  <th>Lote</th>
                  <th>Vence</th>
                </tr>
              </thead>
              <tbody>
                {pages.pageItems.map((item) => {
                  const rowLots = lotsOf(item.productId);
                  const single = rowLots.length === 1 ? rowLots[0] : undefined;

                  return (
                    <tr key={item.productId}>
                      <td>{item.productCode}</td>
                      <td>{item.productName}</td>
                      <td className="table__number">{item.pendingQuantity}</td>
                      <td className="table__number">
                        {single === undefined ? (
                          <strong aria-label={`Llegó de ${item.productName}`}>
                            {lotsTotal(rowLots)}
                          </strong>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max={item.pendingQuantity}
                            step="1"
                            aria-label={`Llegó de ${item.productName}`}
                            value={single.quantity}
                            onChange={(event) =>
                              changeSingle(item.productId, 'quantity', event.target.value)
                            }
                          />
                        )}
                      </td>
                      <td>
                        <div className="field-with-action">
                          {single === undefined ? null : (
                            <input
                              aria-label={`Lote de ${item.productName}`}
                              value={single.lotNumber}
                              maxLength={40}
                              autoComplete="off"
                              placeholder={item.perishable ? '' : 'N.º de factura'}
                              onChange={(event) =>
                                changeSingle(item.productId, 'lotNumber', event.target.value)
                              }
                            />
                          )}
                          <button
                            type="button"
                            className="button"
                            onClick={() => setSplitting(item.productId)}
                          >
                            {single === undefined ? `${rowLots.length} lotes` : 'Partir en lotes'}
                          </button>
                        </div>
                      </td>
                      <td>
                        {!item.perishable ? (
                          <span className="muted">No vence</span>
                        ) : single === undefined ? (
                          <span>{earliestDate(rowLots)}</span>
                        ) : (
                          <input
                            type="date"
                            aria-label={`Vence el lote de ${item.productName}`}
                            min={receivedOn}
                            value={single.expirationDate}
                            onChange={(event) =>
                              changeSingle(item.productId, 'expirationDate', event.target.value)
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
          <p className="muted hint">
            Anote lo que realmente llegó; 0 si un producto no vino en esta entrega. Lo que no llegue
            sigue pendiente en el pedido. Cada producto lleva su lote y, si vence, la fecha de
            vencimiento; si vino en varios lotes, use «Partir en lotes».
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
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Registrar y dejar la carga pendiente
            </button>
            <button type="button" className="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
      {splittingItem === undefined ? null : (
        <ReceiptLotsModal
          item={splittingItem}
          lots={lotsOf(splittingItem.productId)}
          receivedOn={receivedOn}
          onDone={(next) => {
            setLots((current) => ({ ...current, [splittingItem.productId]: next }));
            setSplitting(null);
          }}
          onClose={() => setSplitting(null)}
        />
      )}
    </Modal>
  );
}

/**
 * Fecha del lote que vence primero, `DD/MM/AAAA`, o «—» si ninguno tiene.
 *
 * @example earliestDate([{ expirationDate: '2026-12-15', … }, { expirationDate: '2026-12-01', … }]); // "01/12/2026"
 */
function earliestDate(lots: LotDraft[]): string {
  const first = lots
    .map((lot) => lot.expirationDate)
    .filter((date) => date !== '')
    .sort()[0];

  return first === undefined ? '—' : first.split('-').reverse().join('/');
}
