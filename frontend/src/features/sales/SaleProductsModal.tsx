import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import type { SaleLine } from '../../types/sales';
import { formatMoney } from '../products/money';

interface SaleProductsModalProps {
  saleNumber: number;
  items: SaleLine[];
  onClose: () => void;
}

/**
 * Solo los productos de una venta, al tocar «+N más» en el Historial del día
 * (HU-20). Se abre lo que se tocó y nada más (reglas 4 y 12, como «N
 * productos» en Pedidos): cada producto con su cantidad, lo devuelto y su
 * subtotal, de 4 en 4. La venta completa (pago, ajustes, comprobante) es «Ver
 * venta».
 */
export function SaleProductsModal({ saleNumber, items, onClose }: SaleProductsModalProps) {
  const pages = usePagination(items, String(saleNumber), MODAL_PAGE_SIZE);

  return (
    <Modal title={`Productos de la venta #${saleNumber}`} onClose={onClose}>
      <p className="muted">
        {items.length} {items.length === 1 ? 'producto' : 'productos'}
      </p>
      <div className="table-wrapper">
        <table className="table" aria-label="Productos de la venta">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th className="table__number">Cantidad</th>
              <th className="table__number">Devueltos</th>
              <th className="table__number">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td className="table__number">{item.quantity}</td>
                <td className="table__number">
                  {item.returnedQuantity === 0 ? '—' : item.returnedQuantity}
                </td>
                <td className="table__number">{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
    </Modal>
  );
}
