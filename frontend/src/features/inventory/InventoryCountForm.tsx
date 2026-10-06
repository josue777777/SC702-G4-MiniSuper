import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { InventoryCountPayload } from '../../types/inventory';
import type { Product } from '../../types/products';
import { describeDifference, parseCountedQuantity } from './inventory-count';

interface InventoryCountFormProps {
  products: Product[];
  busy: boolean;
  /** Devuelve `true` si el conteo se guardó; entonces se limpia la cantidad. */
  onConfirm: (payload: InventoryCountPayload) => Promise<boolean>;
}

/**
 * Formulario de conteo físico (HU-10).
 *
 * El dueño elige el producto y escribe lo que contó; antes de confirmar ve el
 * stock del sistema y la diferencia. La diferencia se calcula aquí solo para
 * mostrarla: la que se guarda la calcula el backend.
 */
export function InventoryCountForm({ products, busy, onConfirm }: InventoryCountFormProps) {
  const [productId, setProductId] = useState('');
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const product = products.find((candidate) => candidate.id === productId);
  const parsed = parseCountedQuantity(counted);
  const preview =
    product !== undefined && parsed.ok
      ? describeDifference(parsed.quantity - product.stock)
      : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (product === undefined) {
      setError(undefined);
      return;
    }

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError(undefined);

    if (await onConfirm({ productId: product.id, countedQuantity: parsed.quantity })) {
      setCounted('');
    }
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Registrar conteo físico</h2>
      </header>

      {products.length === 0 ? (
        <p className="muted">
          No hay productos activos para contar. Registre uno en la pantalla de Productos.
        </p>
      ) : (
        <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="form__grid">
            <div className="form__field">
              <label htmlFor="count-product">Producto</label>
              <select
                id="count-product"
                value={productId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setProductId(event.target.value);
                  setError(undefined);
                }}
              >
                <option value="">Seleccione…</option>
                {products.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} — {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form__field">
              <label htmlFor="count-system">Stock en el sistema</label>
              <input id="count-system" value={product?.stock ?? '—'} disabled />
            </div>

            <div className="form__field">
              <label htmlFor="count-quantity">Cantidad contada</label>
              <input
                id="count-quantity"
                type="number"
                min="0"
                step="1"
                value={counted}
                disabled={product === undefined}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setCounted(event.target.value);
                  setError(undefined);
                }}
              />
              {error === undefined ? null : <p className="form__error">{error}</p>}
            </div>

            <div className="form__field">
              <label htmlFor="count-difference">Diferencia</label>
              <input
                id="count-difference"
                value={preview === undefined ? '—' : `${preview.value} (${preview.text})`}
                disabled
              />
            </div>
          </div>

          {preview === undefined || product === undefined || !parsed.ok ? null : (
            <p className="muted hint">
              Al confirmar, el stock de {product.name} pasará de {product.stock} a {parsed.quantity}{' '}
              y el ajuste quedará registrado con fecha y hora. Un conteo confirmado no se puede
              editar.
            </p>
          )}

          <div className="form__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={busy || product === undefined}
            >
              {busy ? 'Guardando…' : 'Confirmar conteo'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
