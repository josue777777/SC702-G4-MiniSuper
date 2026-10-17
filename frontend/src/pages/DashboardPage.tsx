import { BackendStatusCard } from '../components/BackendStatusCard';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { BarList } from '../features/dashboard/BarList';
import { QuickLinks } from '../features/dashboard/QuickLinks';
import { StatTile } from '../features/dashboard/StatTile';
import { useDashboard } from '../features/dashboard/use-dashboard';
import { ExpirationAlertsCard } from '../features/inventory/ExpirationAlertsCard';
import { LowStockAlertsCard } from '../features/inventory/LowStockAlertsCard';
import { formatMoney } from '../features/products/money';

/**
 * Pantalla de inicio: resumen del negocio con datos reales (inventario,
 * pedidos y alertas), accesos rápidos y las alertas del día (HU-08, HU-09).
 * Las cifras de ventas llegan con HU-16 … HU-20 y el resumen del día con HU-37.
 */
export function DashboardPage() {
  const { phase, data, message, reload } = useDashboard();

  return (
    <PagePlaceholder
      title="Panel principal"
      summary="Resumen del negocio y lo que necesita atención hoy. Se actualiza solo."
      stories="HU-23, HU-37"
      tasks={[
        'Total vendido hoy por efectivo y tarjeta, y fiados del día (HU-37).',
        'Pedido sugerido a partir de los productos con stock bajo (HU-23).',
      ]}
    >
      {phase === 'failed' ? (
        <p className="alert alert--error" role="status">
          No se pudo actualizar el resumen: {message}{' '}
          <button type="button" className="button" onClick={() => void reload()}>
            Reintentar
          </button>
        </p>
      ) : null}

      <div className="stat-grid">
        <StatTile
          label="Inventario valorizado"
          value={data === null ? '…' : formatMoney(data.inventory.totalValue)}
          detail={data === null ? 'Calculando…' : `${data.inventory.totalUnits} unidades al costo`}
          to="/inventory"
        />
        <StatTile
          label="Productos activos"
          value={data === null ? '…' : String(data.inventory.activeProducts)}
          detail="Disponibles para la venta"
          to="/inventory"
        />
        <StatTile
          label="Pedidos pendientes"
          value={data === null ? '…' : formatMoney(data.pendingOrders.totalValue)}
          detail={
            data === null ? 'Calculando…' : `${data.pendingOrders.count} pedido(s) por recibir`
          }
          to="/orders"
        />
        <StatTile
          label="Stock bajo"
          value={data === null ? '…' : String(data.lowStockCount)}
          detail="Productos en su mínimo"
          to="/inventory"
          tone={data !== null && data.lowStockCount > 0 ? 'alert' : 'neutral'}
        />
        <StatTile
          label="Vencidos y por vencer"
          value={data === null ? '…' : String(data.expiredCount + data.expiringSoonCount)}
          detail={
            data === null
              ? 'Calculando…'
              : `${data.expiredCount} vencido(s) · ${data.expiringSoonCount} en 15 días`
          }
          to="/inventory"
          tone={
            data !== null && data.expiredCount + data.expiringSoonCount > 0 ? 'alert' : 'neutral'
          }
        />
      </div>

      <div className="dashboard-grid">
        <BarList
          title="Productos con más valor en inventario"
          subtitle="Stock × costo de los cinco primeros, y su parte del inventario total."
          data={data?.topProducts ?? []}
          emptyText={data === null ? 'Cargando…' : 'Todavía no hay productos con stock.'}
        />
        <BarList
          title="Inventario por categoría"
          subtitle="Valor al costo de cada categoría y su parte del total."
          data={data?.categories ?? []}
          emptyText={data === null ? 'Cargando…' : 'Todavía no hay productos con stock.'}
        />
      </div>

      <QuickLinks />

      <div className="dashboard-grid">
        {/* HU-08: alertas de stock bajo. */}
        <LowStockAlertsCard />

        {/* HU-09: vencidos y próximos a vencer. */}
        <ExpirationAlertsCard />
      </div>

      <BackendStatusCard />
    </PagePlaceholder>
  );
}
