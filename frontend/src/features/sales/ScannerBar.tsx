import { useEffect, useRef, useState, type FormEvent } from 'react';

interface ScannerBarProps {
  busy: boolean;
  onScan: (code: string) => Promise<void>;
}

/**
 * Entrada del código (HU-16). Un lector USB tipo teclado escribe aquí y envía
 * Enter; también se puede escribir a mano como contingencia. El campo recupera el
 * foco después de cada lectura para escanear producto tras producto.
 */
export function ScannerBar({ busy, onScan }: ScannerBarProps) {
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
      <label htmlFor="pos-code">Código de barras o código del producto</label>
      <div className="pos__scanner-row">
        <input
          id="pos-code"
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
    </form>
  );
}
