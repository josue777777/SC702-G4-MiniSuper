import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { suppliersService } from '../../services/suppliers.service';
import { formatDateTime } from '../inventory/inventory-count';
import { useKeyedRequest } from '../kardex/use-keyed-request';
import { formatMoney } from '../products/money';

interface SupplierCostsModalProps {
  productId: string;
  productName: string;
  onClose: () => void;
}

/**
 * «Comparar costos» (HU-39): el costo de un producto con cada proveedor activo
 * que lo suministra, del más barato al más caro, para decidir a quién
 * comprarle en el próximo pedido.
 *
 * - Cada costo es el ÚLTIMO registrado (al editar el proveedor o con una
 *   compra directa) y dice cuándo se registró; se pide al abrir la ventana,
 *   así nunca muestra datos viejos.
 * - El más barato lleva «Más barato» y los demás, cuánto más cuestan.
 * - Con un solo proveedor lo dice en vez de una comparación vacía.
 * - De 4 en 4 (regla 2).
 */
export function SupplierCostsModal({ productId, productName, onClose }: SupplierCostsModalProps) {
  const costs = useKeyedRequest(
    `costs:${productId}`,
    () => suppliersService.compareCosts(productId),
    'No se pudo cargar la comparación de costos.',
  );
  const suppliers = costs.phase === 'ready' ? costs.value.suppliers : [];
  const pages = usePagination(suppliers, productId, MODAL_PAGE_SIZE);

  return (
    <Modal title={`Comparar costos · ${productName}`} onClose={onClose}>
      {costs.phase === 'loading' ? (
        <p className="muted" role="status">
          Cargando costos…
        </p>
      ) : null}

      {costs.phase === 'failed' ? (
        <p className="alert alert--error" role="alert">
          {costs.message}
        </p>
      ) : null}

      {costs.phase === 'ready' && suppliers.length === 0 ? (
        <p className="muted" role="status">
          Ningún proveedor activo suministra este producto. Asócielo en Pedidos › Proveedores.
        </p>
      ) : null}

      {costs.phase === 'ready' && suppliers.length === 1 ? (
        <p className="muted" role="status">
          Solo {suppliers[0]?.supplierName} suministra este producto: no hay con quién comparar.
        </p>
      ) : null}

      {suppliers.length > 0 ? (
        <>
          <div className="table-wrapper">
            <table className="table" aria-label="Costos por proveedor">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th className="table__number">Costo</th>
                  <th className="table__number">Diferencia</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {pages.pageItems.map((item) => (
                  <tr key={item.supplierId}>
                    <td>
                      {item.supplierName}
                      {item.isPreferred ? (
                        <>
                          {' '}
                          <span className="badge badge--muted">Principal</span>
                        </>
                      ) : null}
                    </td>
                    <td className="table__number">{formatMoney(item.unitCost)}</td>
                    <td className="table__number">
                      {item.cheapest ? (
                        <span className="badge badge--ok">Más barato</span>
                      ) : (
                        `+${formatMoney(item.difference)}`
                      )}
                    </td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pages} itemLabel="proveedores" onPage={pages.setPage} />
        </>
      ) : null}
    </Modal>
  );
}
