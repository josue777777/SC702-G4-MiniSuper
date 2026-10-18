import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import { productsService } from '../../services/products.service';
import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';
import type { Product, ReferenceOption } from '../../types/products';
import { describeExpiration, formatDateOnly, formatDateTime } from '../inventory/inventory-count';
import {
  DEFAULT_PREFERENCES,
  groupByCategory,
  loadPreferences,
  REPORT_COLUMNS,
  REPORT_SORTS,
  savePreferences,
  sortProducts,
  summarize,
  visibleColumns,
  type ProductGroup,
  type ReportColumnKey,
  type ReportPreferences,
  type ReportSort,
} from './inventory-report';

type ExpirationFilter = 'ALL' | ExpirationAlert['status'];

const EXPIRATION_FILTERS: Record<ExpirationFilter, string> = {
  ALL: 'Vencidos y próximos a vencer',
  EXPIRED: 'Solo vencidos',
  EXPIRING_SOON: 'Solo próximos a vencer',
};

interface InventoryReportProps {
  /** Categorías para el selector del reporte. */
  categories: ReferenceOption[];
  /** Categoría con la que abre: la que estaba filtrada en la lista (`''` = todas). */
  initialCategoryId: string;
  onClose: () => void;
}

interface ReportData {
  phase: 'loading' | 'ready' | 'failed';
  products: Product[];
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

/**
 * Reporte imprimible del inventario: el dueño elige la categoría y las
 * secciones, ve la vista previa y la imprime o la guarda en PDF.
 *
 * Siempre es de productos ACTIVOS: es el inventario disponible para vender; los
 * desactivados no se incluyen. Secciones: productos (opcionalmente agrupados
 * por categoría), vencidos y por vencer (HU-09) y stock bajo (HU-08). Lotes
 * llega con HU-38.
 */
export function InventoryReport({ categories, initialCategoryId, onClose }: InventoryReportProps) {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [grouped, setGrouped] = useState(false);
  /** Columnas, orden y hoja: se recuerdan en este navegador para la próxima vez. */
  const [preferences, setPreferences] = useState<ReportPreferences>(loadPreferences);
  const [include, setInclude] = useState({ products: true, expirations: false, lowStock: false });
  const [expirationFilter, setExpirationFilter] = useState<ExpirationFilter>('ALL');
  const [data, setData] = useState<ReportData>({
    phase: 'loading',
    products: [],
    expirations: [],
    lowStock: [],
  });

  useEffect(() => savePreferences(preferences), [preferences]);

  // El reporte no depende de lo que muestre la lista: carga todo y filtra aquí.
  useEffect(() => {
    let active = true;

    Promise.all([
      productsService.list(),
      inventoryService.listExpirations(),
      inventoryService.listLowStock(),
    ])
      .then(([products, expirations, lowStock]) => {
        if (active) {
          setData({ phase: 'ready', products, expirations, lowStock });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setData({
            phase: 'failed',
            products: [],
            expirations: [],
            lowStock: [],
            message: error instanceof ApiError ? error.message : 'No se pudieron cargar los datos.',
          });
        }
      });

    // Si el modal se cierra antes de que llegue la respuesta, no se toca el estado.
    return () => {
      active = false;
    };
  }, []);

  const products = sortProducts(
    data.products.filter(
      (product) => product.isActive && (categoryId === '' || product.categoryId === categoryId),
    ),
    preferences.sort,
  );
  // Vencimientos y stock bajo respetan la misma categoría.
  const inScope = new Set(products.map((product) => product.id));
  const expirations = data.expirations.filter(
    (alert) =>
      inScope.has(alert.productId) &&
      (expirationFilter === 'ALL' || alert.status === expirationFilter),
  );
  const lowStock = data.lowStock.filter((alert) => inScope.has(alert.productId));

  const categoryName = categories.find((category) => category.id === categoryId)?.name;
  const scope = categoryName === undefined ? 'todas las categorías' : `categoría ${categoryName}`;
  const groups: ProductGroup[] =
    grouped && categoryId === ''
      ? groupByCategory(products)
      : [{ key: 'all', title: null, products }];
  const columns = visibleColumns(preferences.columns);
  const nothingChosen = !include.products && !include.expirations && !include.lowStock;

  function toggle(section: keyof typeof include): void {
    setInclude((current) => ({ ...current, [section]: !current[section] }));
  }

  function toggleColumn(key: ReportColumnKey): void {
    setPreferences((current) => ({
      ...current,
      columns: current.columns.includes(key)
        ? current.columns.filter((column) => column !== key)
        : [...current.columns, key],
    }));
  }

  function renderRow(product: Product) {
    return (
      <tr key={product.id}>
        {columns.map((column) => (
          <td key={column.key} className={column.numeric ? 'table__number' : undefined}>
            {column.render(product)}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <Modal title="Imprimir reporte de inventario" size="wide" onClose={onClose}>
      {/* Opciones: no se imprimen (no están dentro de la vista previa). */}
      {/* La hoja horizontal solo aplica al imprimir este reporte. */}
      {preferences.orientation === 'landscape' ? (
        <style>{'@media print { @page { size: landscape; } }'}</style>
      ) : null}

      {/* Opciones: no se imprimen (no están dentro de la vista previa). */}
      <div className="report-options">
        <fieldset className="report-options__group">
          <legend>Contenido</legend>
          <label>
            Categoría
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted hint">Siempre productos activos.</p>
          <label>
            <input type="checkbox" checked={include.products} onChange={() => toggle('products')} />
            Productos
          </label>
          {include.products && categoryId === '' ? (
            <label className="report-options__nested">
              <input
                type="checkbox"
                checked={grouped}
                onChange={() => setGrouped((current) => !current)}
              />
              Agrupar por categoría, con subtotales
            </label>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={include.expirations}
              onChange={() => toggle('expirations')}
            />
            Vencidos y por vencer
          </label>
          {include.expirations ? (
            <label className="report-options__nested">
              <select
                aria-label="Filtro de vencimientos"
                value={expirationFilter}
                onChange={(event) => setExpirationFilter(event.target.value as ExpirationFilter)}
              >
                <option value="ALL">Vencidos y próximos a vencer</option>
                <option value="EXPIRED">Solo vencidos</option>
                <option value="EXPIRING_SOON">Solo próximos a vencer</option>
              </select>
            </label>
          ) : null}
          <label>
            <input type="checkbox" checked={include.lowStock} onChange={() => toggle('lowStock')} />
            Stock bajo
          </label>
          <label className="report-options__disabled" title="Llega con HU-38">
            <input type="checkbox" disabled />
            Lotes <span className="badge badge--muted">Próximamente (HU-38)</span>
          </label>
        </fieldset>

        <fieldset className="report-options__group" disabled={!include.products}>
          <legend>Columnas de productos</legend>
          <div className="report-options__columns">
            {REPORT_COLUMNS.map((column) => (
              <label key={column.key} title={column.required ? 'Siempre se incluye' : undefined}>
                <input
                  type="checkbox"
                  checked={column.required === true || preferences.columns.includes(column.key)}
                  disabled={column.required}
                  onChange={() => toggleColumn(column.key)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="report-options__group">
          <legend>Formato</legend>
          <label>
            Ordenar por
            <select
              value={preferences.sort}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  sort: event.target.value as ReportSort,
                }))
              }
            >
              {Object.entries(REPORT_SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="report-options__radios"
            role="radiogroup"
            aria-label="Orientación de la hoja"
          >
            Hoja
            <label>
              <input
                type="radio"
                name="report-orientation"
                checked={preferences.orientation === 'portrait'}
                onChange={() =>
                  setPreferences((current) => ({ ...current, orientation: 'portrait' }))
                }
              />
              Vertical
            </label>
            <label>
              <input
                type="radio"
                name="report-orientation"
                checked={preferences.orientation === 'landscape'}
                onChange={() =>
                  setPreferences((current) => ({ ...current, orientation: 'landscape' }))
                }
              />
              Horizontal
            </label>
          </div>
          <button
            type="button"
            className="link-button"
            onClick={() => setPreferences(DEFAULT_PREFERENCES)}
          >
            Restablecer columnas y formato
          </button>
        </fieldset>

        <div className="report-options__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={printReport}
            disabled={nothingChosen || data.phase !== 'ready'}
          >
            🖨 Imprimir / Guardar PDF
          </button>
          {nothingChosen ? <span className="muted">Marque al menos una sección.</span> : null}
          <span className="muted">Sus columnas y formato se recuerdan en este navegador.</span>
        </div>
      </div>

      {/* Vista previa: es exactamente lo que se imprime. */}
      <div className="print-area report-preview">
        <header className="report-preview__header">
          <h1>Reporte de inventario</h1>
          <p className="muted">
            Productos activos · {scope} · generado el {formatDateTime(new Date().toISOString())}
          </p>
        </header>

        {data.phase === 'loading' ? <p className="muted">Cargando…</p> : null}
        {data.phase === 'failed' ? <p className="alert alert--error">{data.message}</p> : null}
        {nothingChosen ? <p className="muted">No hay secciones marcadas.</p> : null}

        {include.products && data.phase === 'ready' ? (
          <section className="report-preview__section">
            <h2>Productos</h2>
            {products.length === 0 ? (
              <p className="muted">No hay productos activos en {scope}.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} className={column.numeric ? 'table__number' : undefined}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.key}>
                    {group.title === null ? null : (
                      <tr className="report-preview__group">
                        <th colSpan={columns.length}>{group.title}</th>
                      </tr>
                    )}
                    {group.products.map(renderRow)}
                    {/* Una sola celda a lo ancho: no se desalinea al ocultar columnas. */}
                    {group.title === null ? null : (
                      <tr className="report-preview__subtotal">
                        <td colSpan={columns.length}>
                          Subtotal {group.title}: {summarize(group.products)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <th colSpan={columns.length}>Total: {summarize(products)}</th>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        ) : null}

        {include.expirations && data.phase === 'ready' ? (
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

        {include.lowStock && data.phase === 'ready' ? (
          <section className="report-preview__section">
            <h2>Stock bajo</h2>
            {lowStock.length === 0 ? (
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
                  {lowStock.map((alert) => (
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
