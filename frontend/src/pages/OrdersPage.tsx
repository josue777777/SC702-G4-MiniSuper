import { useSearchParams } from 'react-router-dom';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { OrdersSection } from '../features/purchase-orders/OrdersSection';
import { SuppliersSection } from '../features/suppliers/SuppliersSection';

type OrdersTab = 'pedidos' | 'proveedores';

const TABS: { id: OrdersTab; label: string; stories: string }[] = [
  { id: 'pedidos', label: 'Pedidos', stories: 'HU-22, HU-24' },
  { id: 'proveedores', label: 'Proveedores', stories: 'HU-21' },
];

/**
 * Pedidos: los pedidos a los proveedores y los proveedores a quienes se les
 * compra, en dos pestañas (docs/PANTALLAS.md, reglas 6 y 11). Se usan juntos y
 * con el mismo permiso; Proveedores, sola, era una pantalla casi vacía.
 *
 * La pestaña vive en la dirección (`?seccion=proveedores`): se puede enlazar
 * directo, y la dirección vieja `/suppliers` lleva a ella.
 */
export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const active: OrdersTab = params.get('seccion') === 'proveedores' ? 'proveedores' : 'pedidos';

  return (
    <PagePlaceholder
      icon="truck"
      title="Pedidos"
      summary="Los pedidos a los proveedores y los proveedores a quienes se les compra."
      stories="HU-23, HU-38, HU-39"
      tasks={[
        'Mostrar los productos con stock por debajo del mínimo y su proveedor sugerido (HU-23).',
        'Permitir ajustar la cantidad sugerida antes de confirmar el pedido (HU-23).',
        'Al llegar la mercadería, registrar la entrada en Movimientos (con o sin pedido) y dejar el pedido como recibido, actualizando el stock y los lotes (HU-38).',
        'Comparar el costo de un mismo producto entre sus proveedores (HU-39).',
      ]}
    >
      <div className="tabs" role="tablist" aria-label="Secciones de pedidos">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`orders-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`orders-panel-${tab.id}`}
            title={tab.stories}
            className={active === tab.id ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => setParams(tab.id === 'pedidos' ? {} : { seccion: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="tabs__panel"
        role="tabpanel"
        id={`orders-panel-${active}`}
        aria-labelledby={`orders-tab-${active}`}
      >
        {active === 'pedidos' ? <OrdersSection /> : <SuppliersSection />}
      </div>
    </PagePlaceholder>
  );
}
