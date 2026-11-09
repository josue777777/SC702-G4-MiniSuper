import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import type { PurchaseOrder, PurchaseReceipt } from '../../types/purchase-orders';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatOrderNumber } from '../purchase-orders/purchase-order-form';
import { formatLotDate } from './kardex-format';

/** Mensaje de un error de la API, o uno genérico. */
function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/**
 * Los lotes de una línea en una sola frase.
 *
 * @example describeLots([{ lotNumber: 'L-B', expirationDate: '2026-12-08', quantity: 1 }]);
 * // "L-B · vence 08/12/2026 · 1"
 */
function describeLots(lots: PurchaseReceipt['items'][number]['lots']): string {
  if (lots.length === 0) {
    return '—';
  }

  return lots
    .map(
      (lot) =>
        `${lot.lotNumber} · ${lot.expirationDate === null ? 'no vence' : `vence ${formatLotDate(lot.expirationDate)}`} · ${lot.quantity.toLocaleString('es-CR')}`,
    )
    .join(' / ');
}

interface ReceiptLoadModalProps {
  orderId: string;
  receiptId: string;
  /** Cargada: el aviso para la pantalla. */
  onDone: (message: string) => void;
  /** «Cancelar»: vuelve a donde se venía (Ver pedido, o la lista de pedidos). */
  onCancel: () => void;
}

/**
 * Última verificación antes de cargar una entrega al inventario (HU-38): la
 * verificación de dos pasos de «Carga de pedido».
 *
 * La entrega ya está registrada (con la carga pendiente). Aquí se ve tal como
 * va a entrar, de 4 en 4 (regla 2): cada producto con lo que llegó y sus
 * lotes, el pedido, el proveedor y la factura. Abajo la pregunta «¿Está
 * seguro de cargar esta entrega al inventario?»:
 *
 * - «Sí, cargar al inventario» sube el stock (y sus lotes);
 * - «Cancelar» no carga nada: la entrega sigue pendiente y se vuelve atrás.
 */
export function ReceiptLoadModal({ orderId, receiptId, onDone, onCancel }: ReceiptLoadModalProps) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const receipt = order?.receipts.find((candidate) => candidate.id === receiptId) ?? null;
  const pages = usePagination(receipt?.items ?? [], receiptId, MODAL_PAGE_SIZE);
  const units = (receipt?.items ?? []).reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    purchaseOrdersService
      .get(orderId)
      .then(setOrder)
      .catch((failure: unknown) => setError(describeError(failure)));
  }, [orderId]);

  async function load(): Promise<void> {
    if (order === null || receipt === null) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await purchaseOrdersService.loadReceipt(order.id, receipt.id);
      onDone(
        `Entrega ${receipt.invoiceNumber} del pedido ${formatOrderNumber(order.number)} cargada al inventario.`,
      );
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  const title =
    order === null ? 'Carga de pedido' : `Carga de pedido · ${formatOrderNumber(order.number)}`;

  return (
    <Modal title={title} size="wide" onClose={onCancel}>
      {error === null ? null : (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      {order === null ? (
        error === null ? (
          <p className="muted" role="status">
            Abriendo la entrega…
          </p>
        ) : null
      ) : receipt === null ? (
        <p className="alert alert--error" role="alert">
          La entrega no existe en el pedido {formatOrderNumber(order.number)}.
        </p>
      ) : receipt.loadedAt !== null ? (
        <p className="alert alert--success" role="status">
          La entrega {receipt.invoiceNumber} ya está cargada al inventario.
        </p>
      ) : (
        <>
          <dl className="order-meta" aria-label="Datos de la entrega">
            <div>
              <dt>Pedido</dt>
              <dd>{formatOrderNumber(order.number)}</dd>
            </div>
            <div>
              <dt>Proveedor</dt>
              <dd>{order.supplierName}</dd>
            </div>
            <div>
              <dt>Factura</dt>
              <dd>{receipt.invoiceNumber}</dd>
            </div>
            <div>
              <dt>Llegó</dt>
              <dd>{formatDateOnly(receipt.receivedOn)}</dd>
            </div>
          </dl>

          <div className="table-wrapper">
            <table className="table" aria-label="Lo que se va a cargar">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Lotes</th>
                  <th className="table__number">Entra</th>
                </tr>
              </thead>
              <tbody>
                {pages.pageItems.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.productCode}</td>
                    <td>{item.productName}</td>
                    <td>{describeLots(item.lots)}</td>
                    <td className="table__number">
                      <span className="text-ok">+{item.quantity.toLocaleString('es-CR')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />

          <p className="alert alert--warning" role="status">
            ¿Está seguro de cargar esta entrega al inventario? Suben {units.toLocaleString('es-CR')}{' '}
            unidades de {receipt.items.length}{' '}
            {receipt.items.length === 1 ? 'producto' : 'productos'}.
          </p>
        </>
      )}

      <div className="form__actions">
        {receipt === null || receipt.loadedAt !== null ? null : (
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? 'Cargando…' : 'Sí, cargar al inventario'}
          </button>
        )}
        <button type="button" className="button" disabled={busy} onClick={onCancel}>
          {receipt !== null && receipt.loadedAt !== null ? 'Cerrar' : 'Cancelar'}
        </button>
      </div>
    </Modal>
  );
}
