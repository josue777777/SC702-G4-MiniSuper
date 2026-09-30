import { BackendStatusCard } from '../components/BackendStatusCard';
import { PagePlaceholder } from '../components/PagePlaceholder';

/**
 * Pantalla inicial: estado del sistema y alertas que necesitan atención hoy.
 *
 * Hoy muestra el estado real del backend y de la base de datos; cuando existan
 * los datos, aquí se listarán los productos con stock bajo (HU-08), los
 * próximos a vencer (HU-09) y el pedido sugerido (HU-23).
 */
export function DashboardPage() {
  return (
    <>
      <header className="page-header">
        <h1>Panel de control</h1>
        <p>Resumen del negocio y alertas del día.</p>
      </header>

      <BackendStatusCard />

      <PagePlaceholder
        title="Alertas del panel"
        summary="Listas rápidas de lo que necesita atención hoy."
        stories="HU-08, HU-09, HU-20, HU-23"
        tasks={[
          'Productos con stock igual o por debajo del mínimo definido (HU-08).',
          'Productos próximos a vencer según la fecha configurada (HU-09).',
          'Total vendido hoy, con ventas cobradas y venta a crédito (HU-20).',
          'Pedido sugerido a partir de los productos con stock bajo (HU-23).',
        ]}
      />
    </>
  );
}
