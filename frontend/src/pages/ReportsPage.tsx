import { useSearchParams } from 'react-router-dom';
import { useSession } from '../features/auth/session-context';
import { CommercialReportPanel } from '../features/reports/CommercialReports';
import { InventoryStockReport } from '../features/reports/InventoryStockReport';
import type { ReportKind } from '../types/reports';
import { PageHeader } from '../components/PageHeader';

type ReportTab = ReportKind | 'inventario';

const COMMERCIAL_TABS: { id: ReportKind; label: string; stories: string }[] = [
  { id: 'sales', label: 'Ventas', stories: 'HU-28' },
  { id: 'profits', label: 'Ganancias', stories: 'HU-29' },
  { id: 'top-products', label: 'Más vendidos', stories: 'HU-30' },
  { id: 'customer-debts', label: 'Deudas de clientes', stories: 'HU-30' },
];

/**
 * Reportes del negocio, todos con las mismas acciones (HU-40): personalizar
 * columnas, descargar en PDF y en Excel.
 *
 * - Comerciales (HU-28 … HU-30): con el permiso `reports.sales`.
 * - Inventario (HU-25, con stock bajo y vencimientos): con `reports.inventory`;
 *   es el reporte que antes se abría desde Inventario.
 * - Conteos (HU-10): los conteos físicos del período, también con
 *   `reports.inventory`. Antes era un historial plegado dentro de la ventana
 *   de conteo; aquí se filtra, se resume y se descarga como los demás.
 *
 * La pestaña vive en la dirección (`?reporte=inventario&categoria=…`): así el
 * botón de Inventario abre directo el reporte de su categoría.
 */
export function ReportsPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const tabs: { id: ReportTab; label: string; stories: string }[] = [
    ...(can('reports.sales') ? COMMERCIAL_TABS : []),
    ...(can('reports.inventory')
      ? [
          { id: 'inventario' as const, label: 'Inventario', stories: 'HU-25' },
          { id: 'physical-counts' as const, label: 'Conteos', stories: 'HU-10' },
        ]
      : []),
  ];
  const requested = params.get('reporte');
  const active: ReportTab | undefined = tabs.find((tab) => tab.id === requested)?.id ?? tabs[0]?.id;

  return (
    <>
      <PageHeader icon="reports" title="Reportes">
        Consulte, personalice y descargue en PDF o Excel los reportes del negocio.
      </PageHeader>

      {active === undefined ? (
        <p className="card muted">Todavía no hay reportes disponibles para su rol.</p>
      ) : (
        <section className="card reports" aria-label="Reportes del negocio">
          <div className="tabs" role="tablist" aria-label="Reportes">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`report-tab-${tab.id}`}
                aria-selected={active === tab.id}
                aria-controls="report-panel"
                title={tab.stories}
                className={`tabs__tab${active === tab.id ? ' tabs__tab--active' : ''}`}
                onClick={() => setParams(tab.id === tabs[0]?.id ? {} : { reporte: tab.id })}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            id="report-panel"
            role="tabpanel"
            aria-labelledby={`report-tab-${active}`}
            className="tabs__panel"
          >
            {active === 'inventario' ? (
              <InventoryStockReport initialCategoryId={params.get('categoria') ?? ''} />
            ) : (
              <CommercialReportPanel kind={active} />
            )}
          </div>
        </section>
      )}
    </>
  );
}
