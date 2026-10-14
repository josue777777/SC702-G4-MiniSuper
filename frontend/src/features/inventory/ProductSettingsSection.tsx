import { ExpirationList } from './ExpirationList';
import { ProductSettingsForm } from './ProductSettingsForm';
import { useProductSettings } from './use-product-settings';

/** Sección de Inventario para mínimos (HU-08) y vencimientos (HU-09). */
export function ProductSettingsSection() {
  const {
    phase,
    products,
    expirations,
    message,
    notice,
    busy,
    reload,
    saveMinStock,
    saveExpirationDate,
    dismissNotice,
  } = useProductSettings();

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

      {phase === 'loading' ? <p className="card muted">Cargando mínimos y vencimientos…</p> : null}

      {phase === 'failed' ? (
        <section className="card">
          <header className="card__header">
            <h2>No se pudieron cargar los mínimos y vencimientos</h2>
            <button type="button" className="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </header>
          <p className="muted">{message}</p>
        </section>
      ) : null}

      {phase === 'ready' ? (
        <>
          <ProductSettingsForm
            products={products}
            busy={busy}
            onSaveMinStock={saveMinStock}
            onSaveExpirationDate={saveExpirationDate}
          />
          <ExpirationList alerts={expirations} showFilter />
        </>
      ) : null}
    </>
  );
}
