import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavIcon } from '../../layouts/NavIcon';
import type { PosNotice } from './use-pos';

interface ScannerBarProps {
  busy: boolean;
  /** Resultado de la última lectura («Agregado: …», «No se encontró…»). */
  notice: PosNotice | null;
  onScan: (code: string) => Promise<void>;
}

/** Id del campo: el atajo F2 de la caja lo usa para volver a él. */
export const SCANNER_INPUT_ID = 'pos-code';

/**
 * Entrada del código (HU-16). Un lector USB tipo teclado escribe aquí y envía
 * Enter; también se puede escribir a mano como contingencia. El campo recupera el
 * foco después de cada lectura para escanear producto tras producto.
 *
 * Es lo primero que se ve en la caja: grande, con el ícono del código de barras
 * y el estado del lector, como en un punto de venta. El resultado de cada
 * lectura aparece en esa misma línea, debajo del campo: así el carrito no se
 * mueve con cada escaneo.
 */
export function ScannerBar({ busy, notice, onScan }: ScannerBarProps) {
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const value = code;

    setCode('');
    await onScan(value.trim().length > 0 && value.trim().length < 4 ? '' : value);
    inputRef.current?.focus();
  }

  return (
    <form className="pos__scanner" onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor={SCANNER_INPUT_ID}>Código de barras o código del producto</label>
      <div className="pos__scanner-row">
        <span className="pos__scanner-icon" aria-hidden="true">
          <NavIcon name="barcode" size={22} />
        </span>
        <input
          id={SCANNER_INPUT_ID}
          ref={inputRef}
          value={code}
          maxLength={64}
          autoComplete="off"
          placeholder="Escanee o escriba el código y presione Enter"
          onChange={(event) => setCode(event.target.value)}
        />
        <button type="submit" className="button button--dark" disabled={busy}>
          {busy ? 'Buscando…' : 'Agregar'}
        </button>
      </div>
      <p className="pos__scanner-hint">
        {busy ? (
          <span className="pos__ready">Buscando producto…</span>
        ) : notice === null ? (
          <span className="pos__ready">Lector listo</span>
        ) : (
          <span className={`pos__feedback pos__feedback--${notice.kind}`} role="status">
            {notice.text}
          </span>
        )}
        <span>
          <kbd>F2</kbd> volver al código · <kbd>F9</kbd> finalizar venta
        </span>
      </p>
    </form>
  );
}
