import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';
import type { Product } from '../../types/products';
import { describeExpiration, formatDateOnly, formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from './money';

type ExpirationFilter = 'ALL' | ExpirationAlert['status'];

const EXPIRATION_FILTERS: Record<ExpirationFilter, string> = {
  ALL: 'Vencidos y próximos a vencer',
  EXPIRED: 'Solo vencidos',
  EXPIRING_SOON: 'Solo próximos a vencer',
};

interface InventoryReportProps {
  /** Los productos que se están viendo en la lista (vista, categoría y búsqueda). */
  products: Product[];
  /** Qué se está viendo, para el encabezado del reporte (p. ej. «Activos · Bebidas»). */
  criteria: string;
  onClose: () => void;
}

interface Alerts {
  phase: 'loading' | 'ready' | 'failed';
  expirations: ExpirationAlert[];
  lowStock: LowStockAlert[];
  message?: string;
}

/** Imprime solo la vista previa: marca el `body` y la hoja de estilos oculta el resto. */
function printReport(): void {
  document.body.classList.add('printing-report');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'), {
    once: true,
  });
  window.print();
}

function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/**
 * Reporte imprimible del inventario: el dueño marca qué secciones incluir y ve
 * la vista previa antes de imprimir o guardar en PDF.
 *
 * - Productos: exactamente lo que se ve en la lista (vista, categoría, búsqueda).
 * - Vencidos y por vencer (HU-09), con su filtro.
 * - Stock bajo (HU-08).
 * - Lotes: llega con HU-38.
 */
export function InventoryReport({ products, criteria, onClose }: InventoryReportProps) {
  const [include, setInclude] = useState({ products: true, expirations: false, lowStock: false });
  const [expirationFilter, setExpirationFilter] = useState<ExpirationFilter>('ALL');
  const [alerts, setAlerts] = useState<Alerts>({ phase: 'loading', expirations: [], lowStock: [] });

  useEffect(() => {
    let active = true;

    Promise.all([inventoryService.listExpirations(), inventoryService.listLowStock()])
      .then(([expirations, lowStock]) => {
        if (active) {
          setAlerts({ phase: 'ready', expirations, lowStock });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setAlerts({
            phase: 'failed',
            expirations: [],
            lowStock: [],
            message:
              error instanceof ApiError
                ? error.message
                : 'No se pudieron cargar los vencimientos y el stock bajo.',
          });
        }
      });

    // Si el modal se cierra antes de que llegue la respuesta, no se toca el estado.
    return () => {
      active = false;
    };
  }, []);

  const expirations =
    expirationFilter === 'ALL'
      ? alerts.expirations
      : alerts.expirations.filter((alert) => alert.status === expirationFilter);
  const nothingChosen = !include.products && !include.expirations && !include.lowStock;
  const totalUnits = products.reduce((sum, product) => sum + product.stock, 0);
  const totalValue = (
    products.reduce((sum, product) => sum + toCents(product.cost) * product.stock, 0) / 100
  ).toFixed(2);

  function toggle(section: keyof typeof include): void {
    setInclude((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <Modal title="Imprimir reporte de inventario" size="wide" onClose={onClose}>
      {/* Opciones: no se imprimen (no están dentro de la vista previa). */}
      <fieldset className="report-options">
        <legend>¿Qué incluir en el reporte?</legend>
        <label>
          <input type="checkbox" checked={include.products} onChange={() => toggle('products')} />
          Productos de la lista <span className="muted">({criteria})</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={include.expirations}
            onChange={() => toggle('expirations')}
          />
          Vencidos y por vencer
          {include.expirations ? (
            <select
              aria-label="Filtro de vencimientos"
              value={expirationFilter}
              onChange={(event) => setExpirationFilter(event.target.value as ExpirationFilter)}
            >
              <option value="ALL">Todos</option>
              <option value="EXPIRED">Solo vencidos</option>
              <option value="EXPIRING_SOON">Solo próximos a vencer</option>
            </select>
          ) : null}
        </label>
        <label>
          <input type="checkbox" checked={include.lowStock} onChange={() => toggle('lowStock')} />
          Stock bajo
        </label>
        <label className="report-options__disabled" title="Llega con HU-38">
          <input type="checkbox" disabled />
          Lotes <span className="badge badge--muted">Próximamente (HU-38)</span>
        </label>
        <div className="report-options__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={printReport}
            disabled={nothingChosen}
          >
            🖨 Imprimir / Guardar PDF
          </button>
          {nothingChosen ? <span className="muted">Marque al menos una sección.</span> : null}
        </div>
      </fieldset>

      {/* Vista previa: es exactamente lo que se imprime. */}
      <div className="print-area report-preview">
        <header className="report-preview__header">
          <h1>Reporte de inventario</h1>
          <p className="muted">Generado el {formatDateTime(new Date().toISOString())}</p>
        </header>

        {nothingChosen ? <p className="muted">No hay secciones marcadas.</p> : null}

        {include.products ? (
          <section className="report-preview__section">
            <h2>Productos · {criteria}</h2>
            {products.length === 0 ? (
              <p className="muted">No hay productos en la lista con estos filtros.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="table__number">P. compra</th>
                    <th className="table__number">P. venta</th>
                    <th className="table__number">Stock</th>
                    <th className="table__number">Mínimo</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.code}</td>
                      <td>{product.name}</td>
                      <td>{product.categoryName}</td>
                      <td className="table__number">{formatMoney(product.cost)}</td>
                      <td className="table__number">{formatMoney(product.price)}</td>
                      <td className="table__number">{product.stock}</td>
                      <td className="table__number">
                        {product.minStock === 0 ? '—' : product.minStock}
                      </td>
                      <td>
                        {product.expirationDate === null
                          ? '—'
                          : formatDateOnly(product.expirationDate)}
                      </td>
                      <td>{product.isActive ? 'Activo' : 'Desactivado'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={5} className="table__number">
                      {products.length} producto(s) · valor al costo {formatMoney(totalValue)}
                    </th>
                    <th className="table__number">{totalUnits}</th>
                    <th colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        ) : null}

        {(include.expirations || include.lowStock) && alerts.phase === 'loading' ? (
          <p className="muted">Cargando…</p>
        ) : null}
        {(include.expirations || include.lowStock) && alerts.phase === 'failed' ? (
          <p className="alert alert--error">{alerts.message}</p>
        ) : null}

        {include.expirations && alerts.phase === 'ready' ? (
          <section className="report-preview__section">
            <h2>{EXPIRATION_FILTERS[expirationFilter]}</h2>
            {expirations.length === 0 ? (
              <p className="muted">Ningún producto en esta sección.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th className="table__number">Stock</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {expirations.map((alert) => (
                    <tr key={alert.productId}>
                      <td>{alert.productCode}</td>
                      <td>{alert.productName}</td>
                      <td className="table__number">{alert.stock}</td>
                      <td>{formatDateOnly(alert.expirationDate)}</td>
                      <td>{describeExpiration(alert.daysLeft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}

        {include.lowStock && alerts.phase === 'ready' ? (
          <section className="report-preview__section">
            <h2>Stock bajo</h2>
            {alerts.lowStock.length === 0 ? (
              <p className="muted">Ningún producto está en su mínimo de stock.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th className="table__number">Stock</th>
                    <th className="table__number">Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.lowStock.map((alert) => (
                    <tr key={alert.productId}>
                      <td>{alert.productCode}</td>
                      <td>{alert.productName}</td>
                      <td className="table__number">{alert.stock}</td>
                      <td className="table__number">{alert.minStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
