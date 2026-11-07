import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import type { PurchaseOrder, PurchaseOrderSummary } from '../../types/purchase-orders';
import { formatOrderNumber } from './purchase-order-form';

interface OrderProductsModalProps {
  order: PurchaseOrderSummary;
  onClose: () => void;
}

/**
 * Solo los productos de un pedido, cuando se toca «N productos» en el historial
 * (HU-22). Se abre lo que se tocó y nada más: la lista, con lo pedido y lo
 * recibido, de 4 en 4. El pedido completo (datos, entregas, imprimir) sigue en
 * «Ver pedido» (docs/PANTALLAS.md, reglas 4 y 12).
 */
export function OrderProductsModal({ order, onClose }: OrderProductsModalProps) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const pages = usePagination(detail?.items ?? [], order.id, MODAL_PAGE_SIZE);
  const title = `Productos del pedido ${formatOrderNumber(order.number)}`;

  useEffect(() => {
    let cancelled = false;

    purchaseOrdersService
      .get(order.id)
      .then((loaded) => {
        if (!cancelled) {
          setDetail(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed(
            error instanceof ApiError ? error.message : 'No se pudieron cargar los productos.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [order.id]);

  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">
        {order.supplierName} · {order.productNames.length} productos
      </p>
      {failed === null ? null : <p className="alert alert--error">{failed}</p>}
      {detail === null && failed === null ? (
        <p className="muted" role="status">
          Cargando productos…
        </p>
      ) : null}
      {detail === null ? null : (
        <>
          <div className="table-wrapper">
            <table className="table" aria-label={title}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="table__number">Pedido</th>
                  <th className="table__number">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {pages.pageItems.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.productCode}</td>
                    <td>{item.productName}</td>
                    <td className="table__number">{item.quantity}</td>
                    <td className="table__number">{item.receivedQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
        </>
      )}
      <div className="form__actions">
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
