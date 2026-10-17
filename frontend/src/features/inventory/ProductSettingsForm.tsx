import { useState, type ChangeEvent } from 'react';
import type { ProductStockSettings } from '../../types/inventory';
import { formatDateOnly, parseMinStock, todayDateOnly } from './inventory-count';

interface ProductSettingsFormProps {
  products: ProductStockSettings[];
  busy: boolean;
  onSaveMinStock: (productId: string, minStock: number) => Promise<boolean>;
  onSaveExpirationDate: (productId: string, expirationDate: string | null) => Promise<boolean>;
}

/**
 * Mínimo de stock (HU-08) y fecha de vencimiento (HU-09) de un producto.
 *
 * Cada dato se guarda con su propio botón porque son historias distintas: un
 * producto puede tener mínimo y no vencer, o vencer y no tener mínimo. La
 * fecha es opcional y, si se pone o se cambia, tiene que ser futura.
 */
export function ProductSettingsForm({
  products,
  busy,
  onSaveMinStock,
  onSaveExpirationDate,
}: ProductSettingsFormProps) {
  const [productId, setProductId] = useState('');
  const [minStock, setMinStock] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [minError, setMinError] = useState<string | undefined>(undefined);
  const [dateError, setDateError] = useState<string | undefined>(undefined);

  const product = products.find((candidate) => candidate.productId === productId);
  const today = todayDateOnly();

  function selectProduct(id: string): void {
    const selected = products.find((candidate) => candidate.productId === id);

    setProductId(id);
    setMinStock(selected === undefined ? '' : String(selected.minStock));
    setExpirationDate(selected?.expirationDate ?? '');
    setMinError(undefined);
    setDateError(undefined);
  }

  async function handleSaveMinStock(): Promise<void> {
    if (product === undefined) {
      return;
    }

    const parsed = parseMinStock(minStock);

    if (!parsed.ok) {
      setMinError(parsed.error);
      return;
    }

    setMinError(undefined);
    await onSaveMinStock(product.productId, parsed.quantity);
  }

  async function handleSaveExpirationDate(clear: boolean): Promise<void> {
    if (product === undefined) {
      return;
    }

    const value = clear ? null : expirationDate === '' ? null : expirationDate;

    if (value !== null && value !== product.expirationDate && value <= today) {
      setDateError('La fecha de vencimiento debe ser posterior a hoy.');
      return;
    }

    setDateError(undefined);

    if ((await onSaveExpirationDate(product.productId, value)) && clear) {
      setExpirationDate('');
    }
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Mínimos y vencimientos</h2>
      </header>

      {products.length === 0 ? (
        <p className="muted">
          No hay productos activos. Registre uno en el catálogo de productos de arriba.
        </p>
      ) : (
        <div className="form">
          <div className="form__grid">
            <div className="form__field">
              <label htmlFor="settings-product">Producto</label>
              <select
                id="settings-product"
                value={productId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  selectProduct(event.target.value)
                }
              >
                <option value="">Seleccione…</option>
                {products.map((option) => (
                  <option key={option.productId} value={option.productId}>
                    {option.productCode} — {option.productName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form__field">
              <label htmlFor="settings-stock">Stock actual</label>
              <input id="settings-stock" value={product?.stock ?? '—'} disabled />
            </div>
          </div>

          {product === undefined ? null : (
            <div className="form__grid settings__grid">
              <div className="form__field">
                <label htmlFor="settings-min">Stock mínimo (0 = sin alerta)</label>
                <input
                  id="settings-min"
                  type="number"
                  min="0"
                  step="1"
                  value={minStock}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setMinStock(event.target.value);
                    setMinError(undefined);
                  }}
                />
                {minError === undefined ? null : <p className="form__error">{minError}</p>}
                <div className="row-actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void handleSaveMinStock()}
                  >
                    Guardar mínimo
                  </button>
                </div>
              </div>

              <div className="form__field">
                <label htmlFor="settings-expiration">Fecha de vencimiento (opcional)</label>
                <input
                  id="settings-expiration"
                  type="date"
                  min={today}
                  value={expirationDate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setExpirationDate(event.target.value);
                    setDateError(undefined);
                  }}
                />
                {dateError === undefined ? null : <p className="form__error">{dateError}</p>}
                {product.expirationDate === null ? (
                  <p className="muted hint">Este producto no tiene fecha de vencimiento.</p>
                ) : (
                  <p className="muted hint">Guardada: {formatDateOnly(product.expirationDate)}</p>
                )}
                <div className="row-actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void handleSaveExpirationDate(false)}
                  >
                    Guardar vencimiento
                  </button>
                  {product.expirationDate === null ? null : (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void handleSaveExpirationDate(true)}
                    >
                      Quitar fecha
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
