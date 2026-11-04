import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import { productsService } from '../../services/products.service';
import type { ExpirationAlert, LowStockAlert } from '../../types/inventory';
import type { Product, ReferenceOption } from '../../types/products';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { useCatalogExport } from '../products/use-catalog-export';
import {
  EXPIRATION_FILTERS,
  groupByCategory,
  inventoryTotals,
  stockStatus,
  valueByCategory,
  loadPreferences,
  REPORT_COLUMNS,
  REPORT_SORTS,
  savePreferences,
  sortProducts,
  visibleColumns,
  type ProductGroup,
  type ReportPreferences,
  type ExpirationFilter,
  type InventorySections,
  type ReportSort,
} from './inventory-report';
import { InventoryReportDocument } from './InventoryReportDocument';
import { ReportActions } from './ReportActions';
import { ReportChartView } from './ReportChartView';
import { ReportCustomizeModal } from './ReportCustomizeModal';
import { printReport } from './report-preferences';

interface InventoryStockReportProps {
  /** Categoría con la que abre (por ejemplo, la que estaba filtrada en Inventario). */
  initialCategoryId: string;
}

interface ReportData {
  phase: 'loading' | 'ready' | 'failed';
  products: Product[];
  expirations: ExpirationAlert[];
  lowStock: LowStockAlert[];
  categories: ReferenceOption[];
  message?: string;
}

/**
 * Reporte de inventario dentro de Reportes (HU-25, con stock bajo de HU-08 y
 * vencimientos de HU-09). Es el que antes se abría con «Imprimir reporte» en
 * Inventario, ahora con las mismas acciones que el resto (HU-40):
 *
 * - Personalizar: columnas y hoja (se recuerdan en este navegador).
 * - PDF: vista previa con «Imprimir / Guardar PDF».
 * - Excel: el catálogo de la categoría elegida (HU-33).
 *
 * Siempre productos ACTIVOS: es el inventario disponible para vender.
 */
export function InventoryStockReport({ initialCategoryId }: InventoryStockReportProps) {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [grouped, setGrouped] = useState(false);
  const [preferences, setPreferences] = useState<ReportPreferences>(loadPreferences);
  const [sections, setSections] = useState<InventorySections>({
    products: true,
    expirations: false,
    lowStock: false,
  });
  const [expirationFilter, setExpirationFilter] = useState<ExpirationFilter>('ALL');
  const [customizing, setCustomizing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const catalog = useCatalogExport();
  const [data, setData] = useState<ReportData>({
    phase: 'loading',
    products: [],
    expirations: [],
    lowStock: [],
    categories: [],
  });

  useEffect(() => savePreferences(preferences), [preferences]);

  useEffect(() => {
    let active = true;

    Promise.all([
      productsService.list(),
      inventoryService.listExpirations(),
      inventoryService.listLowStock(),
      productsService.getFormOptions(),
    ])
      .then(([products, expirations, lowStock, options]) => {
        if (active) {
          setData({
            phase: 'ready',
            products,
            expirations,
            lowStock,
            categories: options.categories,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setData((current) => ({
            ...current,
            phase: 'failed',
            message: error instanceof ApiError ? error.message : 'No se pudieron cargar los datos.',
          }));
        }
      });

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
  const categoryName = data.categories.find((category) => category.id === categoryId)?.name;
  const scope = categoryName === undefined ? 'todas las categorías' : `categoría ${categoryName}`;
  const groups: ProductGroup[] =
    grouped && categoryId === ''
      ? groupByCategory(products)
      : [{ key: 'all', title: null, products }];
  const columns = visibleColumns(preferences.columns);
  const nothingChosen = !sections.products && !sections.expirations && !sections.lowStock;
  const isEmpty =
    (!sections.products || products.length === 0) &&
    (!sections.expirations || expirations.length === 0) &&
    (!sections.lowStock || lowStock.length === 0);

  function toggle(section: keyof InventorySections): void {
    setSections((current) => ({ ...current, [section]: !current[section] }));
  }

  const totals = inventoryTotals(products);
  const documentProps = {
    sections,
    scope,
    columns,
    products,
    groups,
    expirations,
    expirationFilter,
    lowStock,
  };
  // El PDF lleva el reporte completo, con grupos y subtotales.
  const content = <InventoryReportDocument {...documentProps} />;

  return (
    <>
      <form className="report-filters card" onSubmit={(event) => event.preventDefault()}>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="inventory-report-category">Categoría</label>
            <select
              id="inventory-report-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Todas</option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label htmlFor="inventory-report-sort">Ordenar por</label>
            <select
              id="inventory-report-sort"
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
          </div>
        </div>

        <fieldset className="report-sections">
          <legend>Secciones</legend>
          <label>
            <input
              type="checkbox"
              checked={sections.products}
              onChange={() => toggle('products')}
            />
            Productos
          </label>
          {sections.products && categoryId === '' ? (
            <label>
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
              checked={sections.expirations}
              onChange={() => toggle('expirations')}
            />
            Vencidos y por vencer
          </label>
          {sections.expirations ? (
            <select
              aria-label="Filtro de vencimientos"
              value={expirationFilter}
              onChange={(event) => setExpirationFilter(event.target.value as ExpirationFilter)}
            >
              {Object.entries(EXPIRATION_FILTERS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={sections.lowStock}
              onChange={() => toggle('lowStock')}
            />
            Stock bajo
          </label>
          <span className="muted" title="Llega con HU-38">
            Lotes: próximamente
          </span>
        </fieldset>
      </form>

      <div className="report-result">
        <header className="report-result__header">
          <div>
            <h3>Reporte de inventario</h3>
            <p className="muted">Stock actual de los productos activos de {scope}.</p>
          </div>
          <ReportActions
            title="Reporte de inventario"
            emptyReason={
              data.phase !== 'ready'
                ? 'Cargando datos…'
                : nothingChosen
                  ? 'Marque al menos una sección.'
                  : isEmpty
                    ? 'Sin datos: no hay nada que exportar con estos filtros.'
                    : null
            }
            exportingExcel={catalog.exporting}
            onPdf={() => setPreviewing(true)}
            onExcel={() => void catalog.exportCatalog(categoryId)}
            onCustomize={() => setCustomizing(true)}
          />
        </header>

        {catalog.notice === null ? null : (
          <div
            className={`alert ${catalog.notice.kind === 'success' ? 'alert--success' : 'alert--error'}`}
            role={catalog.notice.kind === 'success' ? 'status' : 'alert'}
          >
            <span>{catalog.notice.text}</span>
            <button
              type="button"
              className="alert__close"
              aria-label="Cerrar aviso"
              onClick={catalog.dismiss}
            >
              ×
            </button>
          </div>
        )}

        <details className="disclosure report-result__help">
          <summary>ⓘ Qué incluye</summary>
          <ul>
            <li>Solo productos activos: es el inventario disponible para vender.</li>
            <li>Vencimientos y stock bajo respetan la misma categoría.</li>
            <li>El Excel descarga el catálogo de la categoría elegida.</li>
          </ul>
        </details>

        {data.phase === 'loading' ? (
          <p className="muted" role="status">
            Cargando inventario…
          </p>
        ) : null}
        {data.phase === 'failed' ? (
          <p className="alert alert--error" role="alert">
            {data.message}
          </p>
        ) : null}
        {nothingChosen ? <p className="muted">Marque al menos una sección.</p> : null}
        {data.phase === 'ready' ? (
          <>
            {/* Primero el resumen; la lista completa sale en el PDF y el Excel. */}
            <div className="report-totals" aria-label="Resumen del inventario">
              <div className="stat-tile stat-tile--primary">
                <span className="stat-tile__label">Valor del inventario (al costo)</span>
                <strong className="stat-tile__value">{formatMoney(totals.value)}</strong>
              </div>
              <div className="report-totals__secondary">
                <div className="stat-tile stat-tile--secondary">
                  <span className="stat-tile__label">Productos activos</span>
                  <strong className="stat-tile__value">{totals.count}</strong>
                </div>
                <div className="stat-tile stat-tile--secondary">
                  <span className="stat-tile__label">Unidades en stock</span>
                  <strong className="stat-tile__value">{totals.units}</strong>
                </div>
                {sections.lowStock ? (
                  <div className="stat-tile stat-tile--secondary">
                    <span className="stat-tile__label">En stock bajo</span>
                    <strong className="stat-tile__value">{lowStock.length}</strong>
                  </div>
                ) : null}
                {sections.expirations ? (
                  <div className="stat-tile stat-tile--secondary">
                    <span className="stat-tile__label">{EXPIRATION_FILTERS[expirationFilter]}</span>
                    <strong className="stat-tile__value">{expirations.length}</strong>
                  </div>
                ) : null}
              </div>
            </div>
            {products.length === 0 ? null : (
              <div className="report-charts">
                <ReportChartView
                  chart={{
                    id: 'inventory-value',
                    title: 'Valor del inventario por categoría',
                    subtitle: 'Stock × precio de compra: dónde está el dinero invertido.',
                    form: 'bars',
                    unit: 'money',
                    data: valueByCategory(products),
                  }}
                />
                <ReportChartView
                  chart={{
                    id: 'inventory-status',
                    title: 'Estado del stock',
                    subtitle: 'Cuántos productos activos hay en cada situación.',
                    form: 'bars',
                    unit: 'products',
                    data: stockStatus(products),
                  }}
                />
              </div>
            )}

            <details className="disclosure report-detail">
              <summary>Ver detalle ({products.length} productos)</summary>
              <InventoryReportDocument {...documentProps} paginated />
              <p className="muted">El PDF lleva el detalle completo.</p>
            </details>
          </>
        ) : null}
      </div>

      {customizing ? (
        <ReportCustomizeModal
          columns={REPORT_COLUMNS}
          requiredKey="name"
          preferences={{
            hidden: REPORT_COLUMNS.map((column) => column.key).filter(
              (key) => !preferences.columns.includes(key),
            ),
            orientation: preferences.orientation,
          }}
          onApply={(next) => {
            setPreferences((current) => ({
              ...current,
              columns: REPORT_COLUMNS.map((column) => column.key).filter(
                (key) => key === 'name' || !next.hidden.includes(key),
              ),
              orientation: next.orientation,
            }));
            setCustomizing(false);
          }}
          onClose={() => setCustomizing(false)}
        />
      ) : null}

      {previewing ? (
        <Modal
          title="Vista previa: Reporte de inventario"
          size="wide"
          onClose={() => setPreviewing(false)}
        >
          {preferences.orientation === 'landscape' ? (
            <style>{'@media print { @page { size: landscape; } }'}</style>
          ) : null}
          <div className="form__actions report-pdf__actions">
            <button type="button" className="button button--primary" onClick={printReport}>
              🖨 Imprimir / Guardar PDF
            </button>
            <button type="button" className="button" onClick={() => setPreviewing(false)}>
              Cerrar
            </button>
          </div>
          <article className="print-area report-preview" aria-label="Documento del reporte">
            <header className="report-preview__header">
              <h1>Reporte de inventario</h1>
              <p className="muted">
                Productos activos · {scope} · generado el {formatDateTime(new Date().toISOString())}
              </p>
            </header>
            {content}
          </article>
        </Modal>
      ) : null}
    </>
  );
}
