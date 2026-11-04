import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { productsService } from '../../services/products.service';
import { reportsService } from '../../services/reports.service';
import type { ReferenceOption } from '../../types/products';
import type {
  InventoryReportOptions,
  InventoryReportSection,
  InventoryReportSummary,
} from '../../types/reports';
import { formatMoney } from '../products/money';
import { saveBlob } from '../products/use-catalog-export';
import {
  EXPIRATION_FILTERS,
  loadPreferences,
  REPORT_COLUMNS,
  REPORT_SORTS,
  savePreferences,
  visibleColumns,
  type ReportPreferences,
  type ExpirationFilter,
  type InventorySections,
  type ReportSort,
} from './inventory-report';
import { InventoryPdfPreview } from './InventoryPdfPreview';
import { InventoryReportDetail } from './InventoryReportDetail';
import { ReportActions } from './ReportActions';
import { ReportChartView } from './ReportChartView';
import { ReportCustomizeModal } from './ReportCustomizeModal';

interface InventoryStockReportProps {
  /** Categoría con la que abre (por ejemplo, la que estaba filtrada en Inventario). */
  initialCategoryId: string;
}

type SummaryView =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; summary: InventoryReportSummary; options: InventoryReportOptions };

const SECTION_KEYS: InventoryReportSection[] = ['products', 'expirations', 'lowStock'];

/**
 * Reporte de inventario dentro de Reportes (HU-25, con stock bajo de HU-08 y
 * vencimientos de HU-09). Es el que antes se abría con «Imprimir reporte» en
 * Inventario, ahora con las mismas acciones que el resto (HU-40):
 *
 * - Personalizar: columnas y hoja (se recuerdan en este navegador).
 * - PDF: vista previa con «Imprimir / Guardar PDF».
 * - Excel: el mismo reporte (categoría, orden, columnas y secciones), una hoja
 *   por sección.
 *
 * Siempre productos ACTIVOS: es el inventario disponible para vender.
 *
 * Igual que los reportes comerciales, la pantalla recibe solo el RESUMEN
 * (totales, gráficos y cuántas filas hay); las filas llegan de a una página al
 * abrir «Ver detalle», y el PDF las pide todas. Así, con miles de productos la
 * pantalla sigue liviana.
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
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [categories, setCategories] = useState<ReferenceOption[]>([]);
  const [view, setView] = useState<SummaryView>({ phase: 'loading' });

  useEffect(() => savePreferences(preferences), [preferences]);

  useEffect(() => {
    productsService
      .getFormOptions()
      .then((options) => setCategories(options.categories))
      .catch(() => setCategories([]));
  }, []);

  const chosen = SECTION_KEYS.filter((key) => sections[key]);
  const nothingChosen = chosen.length === 0;
  const chosenKey = chosen.join(',');
  // Los filtros del reporte; mismo objeto mientras no cambien (lo usan las consultas).
  const options = useMemo<InventoryReportOptions>(
    () => ({
      categoryId,
      sort: preferences.sort,
      // Sin secciones igual se piden los totales (con productos), para el resumen.
      sections:
        chosenKey === '' ? ['products'] : (chosenKey.split(',') as InventoryReportSection[]),
      expirations: expirationFilter,
    }),
    [categoryId, preferences.sort, chosenKey, expirationFilter],
  );

  // Cada cambio de filtro vuelve a pedir el resumen; una respuesta vieja se descarta.
  useEffect(() => {
    let active = true;

    setView({ phase: 'loading' });
    reportsService
      .inventorySummary(options)
      .then((summary) => {
        if (active) setView({ phase: 'ready', summary, options });
      })
      .catch((error: unknown) => {
        if (active) {
          setView({
            phase: 'failed',
            message: error instanceof ApiError ? error.message : 'No se pudieron cargar los datos.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [options]);

  const categoryName = categories.find((category) => category.id === categoryId)?.name;
  const scope = categoryName === undefined ? 'todas las categorías' : `categoría ${categoryName}`;
  const columns = visibleColumns(preferences.columns);
  const ready = view.phase === 'ready' ? view : null;
  const counts = ready?.summary.counts;
  const isEmpty =
    counts === undefined ||
    ((!sections.products || counts.products === 0) &&
      (!sections.expirations || (counts.expirations ?? 0) === 0) &&
      (!sections.lowStock || (counts.lowStock ?? 0) === 0));
  const isGrouped = grouped && categoryId === '';

  async function exportExcel(): Promise<void> {
    setExporting(true);
    setNotice(null);

    try {
      const { blob, fileName } = await reportsService.exportInventory({
        categoryId,
        sort: preferences.sort,
        columns: columns.map((column) => column.key),
        sections: chosen,
        expirations: expirationFilter,
        grouped: isGrouped,
      });

      saveBlob(blob, fileName);
      setNotice({ kind: 'success', text: `Reporte exportado: ${fileName}` });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : 'No se pudo exportar el reporte.',
      });
    } finally {
      setExporting(false);
    }
  }

  function toggle(section: keyof InventorySections): void {
    setSections((current) => ({ ...current, [section]: !current[section] }));
  }

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
              {categories.map((category) => (
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
              view.phase !== 'ready'
                ? 'Cargando datos…'
                : nothingChosen
                  ? 'Marque al menos una sección.'
                  : isEmpty
                    ? 'Sin datos: no hay nada que exportar con estos filtros.'
                    : null
            }
            exportingExcel={exporting}
            onPdf={() => setPreviewing(true)}
            onExcel={() => void exportExcel()}
            onCustomize={() => setCustomizing(true)}
          />
        </header>

        {notice === null ? null : (
          <div
            className={`alert ${notice.kind === 'success' ? 'alert--success' : 'alert--error'}`}
            role={notice.kind === 'success' ? 'status' : 'alert'}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              className="alert__close"
              aria-label="Cerrar aviso"
              onClick={() => setNotice(null)}
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
            <li>
              El PDF y el Excel llevan el detalle completo, con las columnas y secciones elegidas.
            </li>
          </ul>
        </details>

        {view.phase === 'loading' ? (
          <p className="muted" role="status">
            Cargando inventario…
          </p>
        ) : null}
        {view.phase === 'failed' ? (
          <p className="alert alert--error" role="alert">
            {view.message}
          </p>
        ) : null}
        {nothingChosen ? <p className="muted">Marque al menos una sección.</p> : null}
        {ready === null ? null : (
          <>
            {/* Primero el resumen; la lista completa sale en el PDF y el Excel. */}
            <div className="report-totals" aria-label="Resumen del inventario">
              <div className="stat-tile stat-tile--primary">
                <span className="stat-tile__label">Valor del inventario (al costo)</span>
                <strong className="stat-tile__value">
                  {formatMoney(ready.summary.totals.value)}
                </strong>
              </div>
              <div className="report-totals__secondary">
                <div className="stat-tile stat-tile--secondary">
                  <span className="stat-tile__label">Productos activos</span>
                  <strong className="stat-tile__value">{ready.summary.totals.count}</strong>
                </div>
                <div className="stat-tile stat-tile--secondary">
                  <span className="stat-tile__label">Unidades en stock</span>
                  <strong className="stat-tile__value">{ready.summary.totals.units}</strong>
                </div>
                {ready.summary.counts.lowStock === null ? null : (
                  <div className="stat-tile stat-tile--secondary">
                    <span className="stat-tile__label">En stock bajo</span>
                    <strong className="stat-tile__value">{ready.summary.counts.lowStock}</strong>
                  </div>
                )}
                {ready.summary.counts.expirations === null ? null : (
                  <div className="stat-tile stat-tile--secondary">
                    <span className="stat-tile__label">{EXPIRATION_FILTERS[expirationFilter]}</span>
                    <strong className="stat-tile__value">{ready.summary.counts.expirations}</strong>
                  </div>
                )}
              </div>
            </div>
            {ready.summary.charts.length === 0 ? null : (
              <div className="report-charts">
                {ready.summary.charts.map((chart) => (
                  <ReportChartView key={chart.id} chart={chart} />
                ))}
              </div>
            )}

            {nothingChosen ? null : (
              <InventoryReportDetail
                key={ready.summary.generatedAt}
                summary={ready.summary}
                options={ready.options}
                columns={columns}
                scopeText={scope}
                grouped={isGrouped && sections.products}
              />
            )}
          </>
        )}
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

      {previewing && ready !== null ? (
        <InventoryPdfPreview
          summary={ready.summary}
          options={ready.options}
          sections={sections}
          scope={scope}
          columns={columns}
          grouped={isGrouped}
          expirationFilter={expirationFilter}
          orientation={preferences.orientation}
          onExcel={() => void exportExcel()}
          onClose={() => setPreviewing(false)}
        />
      ) : null}
    </>
  );
}
