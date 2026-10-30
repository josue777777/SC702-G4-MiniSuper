import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import type { InventoryCountPayload } from '../../types/inventory';
import type { Product } from '../../types/products';
import { describeDifference, parseCountedQuantity } from './inventory-count';
import { hasValidGtinCheckDigit, useWedgeScanner } from '../sales/barcode-scanner';

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
  const [scanCode, setScanCode] = useState('');
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const product = products.find((candidate) => candidate.id === productId);
  const parsed = parseCountedQuantity(counted);
  const preview =
    product !== undefined && parsed.ok
      ? describeDifference(parsed.quantity - product.stock)
      : undefined;

  const identifyCode = useCallback(
    (rawCode: string): void => {
      const code = rawCode.trim();

      setScanCode('');

      if (code === '' || !/^[A-Za-z0-9._-]{4,64}$/.test(code) || !hasValidGtinCheckDigit(code)) {
        setScanMessage('Lectura incompleta o dañada. Escanee de nuevo el código.');
        return;
      }

      const match = products.find(
        (candidate) => candidate.code === code || candidate.barcode === code,
      );

      if (match === undefined) {
        setScanMessage(
          `No se encontró el código «${code}». Registre el producto en el catálogo antes de contar su inventario.`,
        );
        return;
      }

      setProductId(match.id);
      setError(undefined);
      setScanMessage(`Producto identificado: ${match.name}.`);
    },
    [products],
  );

  useWedgeScanner(identifyCode);

  function handleScanSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    identifyCode(scanCode);
  }

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
          No hay productos activos para contar. Registre uno en el catálogo de productos de arriba.
        </p>
      ) : (
        <>
          <form className="pos__scanner" onSubmit={handleScanSubmit}>
            <label htmlFor="count-barcode">Identificar producto con lector</label>
            <div className="pos__scanner-row">
              <input
                id="count-barcode"
                autoFocus
                value={scanCode}
                maxLength={64}
                autoComplete="off"
                placeholder="Escanee el código y presione Enter"
                onChange={(event) => {
                  setScanCode(event.target.value);
                  setScanMessage(null);
                }}
              />
              <button type="submit" className="button button--dark" disabled={busy}>
                Identificar
              </button>
            </div>
            {scanMessage === null ? null : (
              <p
                className={
                  scanMessage.startsWith('Producto identificado') ? 'muted hint' : 'form__error'
                }
                role="status"
              >
                {scanMessage}
              </p>
            )}
          </form>
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
                Al confirmar, el stock de {product.name} pasará de {product.stock} a{' '}
                {parsed.quantity} y el ajuste quedará registrado con fecha y hora. Un conteo
                confirmado no se puede editar.
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
        </>
      )}
    </section>
  );
}
