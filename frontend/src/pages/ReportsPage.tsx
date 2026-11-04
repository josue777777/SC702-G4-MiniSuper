import { PagePlaceholder } from '../components/PagePlaceholder';
import { useSession } from '../features/auth/session-context';
import { CommercialReports } from '../features/reports/CommercialReports';

/**
 * Reportes del negocio. Los comerciales (HU-28 ventas, HU-29 ganancias, HU-30
 * productos más vendidos y deudas) solo los ve quien tiene `reports.sales`; los
 * de inventario (HU-25 … HU-27) usan otro permiso y siguen pendientes.
 */
export function ReportsPage() {
  const { can } = useSession();

  return (
    <PagePlaceholder
      title="Reportes"
      summary="Consultas filtrables y exportables sobre inventario, ventas, ganancias y deudas."
      stories="HU-25, HU-26, HU-27"
      tasks={[
        'Stock actual por producto, filtrable por categoría (HU-25).',
        'Productos con stock bajo, con la cantidad actual y la mínima (HU-26).',
        'Vencidos y próximos a vencer, distinguiendo unos de otros (HU-27).',
      ]}
    >
      {can('reports.sales') ? (
        <CommercialReports />
      ) : (
        // Sin reportes comerciales (Bodega): un mensaje claro en vez de una pantalla vacía.
        <p className="card muted">Todavía no hay reportes disponibles para su rol.</p>
      )}
    </PagePlaceholder>
  );
}
