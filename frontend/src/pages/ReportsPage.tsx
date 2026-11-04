import { useSearchParams } from 'react-router-dom';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { useSession } from '../features/auth/session-context';
import { CommercialReportPanel } from '../features/reports/CommercialReports';
import { InventoryStockReport } from '../features/reports/InventoryStockReport';
import type { ReportKind } from '../types/reports';

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
      ? [{ id: 'inventario' as const, label: 'Inventario', stories: 'HU-25' }]
      : []),
  ];
  const requested = params.get('reporte');
  const active: ReportTab | undefined = tabs.find((tab) => tab.id === requested)?.id ?? tabs[0]?.id;

  return (
    <PagePlaceholder
      title="Reportes"
      summary="Consulte, personalice y descargue en PDF o Excel los reportes del negocio."
      stories="HU-25, HU-26, HU-27"
      tasks={[
        'Stock actual por producto, filtrable por categoría (HU-25).',
        'Productos con stock bajo, con la cantidad actual y la mínima (HU-26).',
        'Vencidos y próximos a vencer, distinguiendo unos de otros (HU-27).',
      ]}
    >
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
    </PagePlaceholder>
  );
}
