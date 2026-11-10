import { BackendStatusCard } from '../components/BackendStatusCard';
import { useSession } from '../features/auth/session-context';
import { UrgentToday } from '../features/dashboard/UrgentToday';
import { useDashboard } from '../features/dashboard/use-dashboard';
import { formatMoney } from '../features/products/money';
import { PageHeader } from '../components/PageHeader';

/**
 * Pantalla de inicio con «foco»: primero lo urgente del día (como mucho tres
 * cosas, cada una con su acción a la mano), después el resumen de ventas de
 * hoy (HU-37) y, al final, el estado del sistema. Las cifras de análisis
 * (inventario valorizado, valor por categoría…) no van aquí: viven en
 * Reportes, donde se filtran y se descargan (docs/PANTALLAS.md, regla 13).
 *
 * Las alertas de stock bajo (HU-08) y de vencimientos (HU-09) son urgencias y
 * siguen apareciendo en el panel, sin recargar.
 */
export function DashboardPage() {
  const { phase, data, message, reload, loadReceipts } = useDashboard();
  const { can } = useSession();
  const dailySales = data?.dailySales ?? null;
  const hasSalesToday = dailySales !== null && dailySales.saleCount > 0;

  return (
    <>
      <PageHeader icon="home" title="Panel principal">
        Lo que necesita atención hoy. Se actualiza solo. Para ir a cualquier parte, pulse{' '}
        <kbd>Ctrl</kbd> + <kbd>K</kbd>.
      </PageHeader>

      {phase === 'failed' ? (
        <p className="alert alert--error" role="status">
          No se pudo actualizar el resumen: {message}{' '}
          <button type="button" className="button" onClick={() => void reload()}>
            Reintentar
          </button>
        </p>
      ) : null}

      <UrgentToday urgencies={data?.urgencies ?? null} onLoadReceipts={loadReceipts} />

      {/* HU-37: solo para los roles que manejan ventas. */}
      {can('sales') ? (
        <section className="card daily-sales-summary" aria-labelledby="daily-sales-title">
          <header className="card__header">
            <h2 id="daily-sales-title">Resumen de ventas de hoy</h2>
            {dailySales === null ? null : (
              <span className="muted">
                {dailySales.saleCount} venta{dailySales.saleCount === 1 ? '' : 's'}
              </span>
            )}
          </header>
          {dailySales === null ? (
            <p className="muted" role="status">
              {phase === 'failed'
                ? 'No se pudo cargar el resumen de ventas.'
                : 'Cargando ventas de hoy…'}
            </p>
          ) : (
            <>
              <div className="daily-sales-summary__grid">
                <div className="daily-sales-summary__item">
                  <span>Total vendido</span>
                  <strong>{formatMoney(dailySales.total)}</strong>
                </div>
                <div className="daily-sales-summary__item">
                  <span>Efectivo</span>
                  <strong>{formatMoney(dailySales.cash)}</strong>
                </div>
                <div className="daily-sales-summary__item">
                  <span>Tarjeta</span>
                  <strong>{formatMoney(dailySales.card)}</strong>
                </div>
                <div className="daily-sales-summary__item">
                  <span>Fiados generados</span>
                  <strong>{formatMoney(dailySales.credit)}</strong>
                </div>
              </div>
              {!hasSalesToday ? (
                <p className="daily-sales-summary__empty" role="status">
                  Aún no se han registrado ventas hoy. Los totales se actualizarán automáticamente.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <BackendStatusCard />
    </>
  );
}
