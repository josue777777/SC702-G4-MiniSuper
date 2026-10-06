import { InventoryCountForm } from './InventoryCountForm';
import { InventoryCountHistory } from './InventoryCountHistory';
import { useInventoryCounts } from './use-inventory-counts';

/**
 * Sección de conteo físico (HU-10): formulario arriba, historial abajo.
 *
 * Vive como una sección aparte para que `InventoryPage` solo la componga: la
 * misma página recibirá después las historias HU-06 … HU-09.
 */
export function PhysicalCountSection() {
  const { phase, products, counts, message, notice, busy, reload, registerCount, dismissNotice } =
    useInventoryCounts();

  return (
    <>
      {notice === null ? null : (
        <p className={`alert alert--${notice.kind}`} role="status">
          {notice.text}
          <button
            type="button"
            className="alert__close"
            onClick={dismissNotice}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      {phase === 'loading' ? <p className="card muted">Cargando inventario…</p> : null}

      {phase === 'failed' ? (
        <section className="card">
          <header className="card__header">
            <h2>No se pudo cargar el inventario</h2>
            <button type="button" className="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </header>
          <p className="badge badge--error">Sin conexión con el servidor</p>
          <p className="muted">{message}</p>
        </section>
      ) : null}

      {phase === 'ready' ? (
        <>
          <InventoryCountForm products={products} busy={busy} onConfirm={registerCount} />
          <InventoryCountHistory counts={counts} />
        </>
      ) : null}
    </>
  );
}
