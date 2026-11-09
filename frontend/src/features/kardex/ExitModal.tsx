import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { kardexService } from '../../services/kardex.service';
import { EXIT_CONCEPTS, type KardexExitConcept, type KardexProduct } from '../../types/kardex';
import { formatMoney } from '../products/money';
import { parseUnits } from '../purchase-orders/receipt-lots';
import { todayInBusinessZone } from '../reports/report-filters';
import { formatLotDate } from './kardex-format';
import { useKeyedRequest } from './use-keyed-request';

interface ExitModalProps {
  product: KardexProduct;
  /** Cambia tras cada ingreso o egreso: vuelve a pedir los lotes. */
  version: number;
  /** Guardado: el aviso para la pantalla (y se recargan ficha e historial). */
  onSaved: (message: string) => void;
  onClose: () => void;
}

/**
 * «− Egreso» de Movimientos (HU-38): una salida que NO es venta (las ventas
 * salen solas desde la caja): vencido o descartado, traslado o devolución a
 * proveedor. Se elige el lote del que sale (con lo que tiene y cuándo vence),
 * se anota el documento y, si hace falta, un detalle. La fecha es la de hoy:
 * el kardex va en el orden en que pasan las cosas.
 *
 * Nunca deja sacar más de lo que tiene el lote; si otra persona sacó antes,
 * el servidor responde y no cambia nada. Es una ventana, como todo formulario
 * del sistema (regla 1).
 */
export function ExitModal({ product, version, onSaved, onClose }: ExitModalProps) {
  const [concept, setConcept] = useState<KardexExitConcept>('EXPIRED');
  const [document, setDocument] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lots = useKeyedRequest(
    `lots:${product.id}:${version}`,
    () => kardexService.listStockLots(product.id),
    'No se pudieron cargar los lotes del producto.',
  );
  const available = lots.phase === 'ready' ? lots.value : [];
  const lot = available.find((candidate) => candidate.id === lotId);
  const units = parseUnits(quantity);

  function validate(): string | null {
    if (document.trim() === '') {
      return 'Indique el número de documento.';
    }

    if (lot === undefined) {
      return 'Elija el lote del que sale.';
    }

    if (units === null || units <= 0) {
      return 'La cantidad debe ser mayor que 0.';
    }

    if (units > lot.quantity) {
      return `Del lote ${lot.lotNumber} quedan ${lot.quantity}: no puede salir más.`;
    }

    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const found = validate();

    setError(found);

    if (found !== null || units === null) {
      return;
    }

    setBusy(true);

    try {
      await kardexService.registerExit(product.id, {
        concept,
        documentNumber: document.trim(),
        lotId,
        quantity: units,
        ...(detail.trim() === '' ? {} : { detail: detail.trim() }),
      });
      onSaved(
        `Egreso registrado: −${units.toLocaleString('es-CR')} de ${product.name} (${EXIT_CONCEPTS[concept]}).`,
      );
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Ocurrió un error inesperado. Intente de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  const value = units === null ? null : (Number(product.cost) * units).toFixed(2);

  return (
    <Modal title={`Egreso · ${product.code} ${product.name}`} size="wide" onClose={onClose}>
      <form
        className="form"
        noValidate
        // Al corregir cualquier dato, el aviso anterior ya no aplica.
        onChange={() => setError(null)}
        onSubmit={(event) => void save(event)}
      >
        <p className="muted">Salida que no es venta: las ventas salen solas desde la caja.</p>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="exit-concept">Concepto</label>
            <select
              id="exit-concept"
              data-autofocus
              value={concept}
              onChange={(event) => setConcept(event.target.value as KardexExitConcept)}
            >
              {Object.entries(EXIT_CONCEPTS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label htmlFor="exit-document">N.º documento</label>
            <input
              id="exit-document"
              value={document}
              maxLength={40}
              autoComplete="off"
              onChange={(event) => setDocument(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="exit-date">Fecha</label>
            <input id="exit-date" type="date" value={todayInBusinessZone()} disabled />
          </div>
          <div className="form__field">
            <label htmlFor="exit-lot">Lote</label>
            <select id="exit-lot" value={lotId} onChange={(event) => setLotId(event.target.value)}>
              <option value="">
                {available.length === 0 ? 'No hay lotes con unidades' : 'Elija el lote'}
              </option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lotNumber} ·{' '}
                  {item.expirationDate === null
                    ? 'no vence'
                    : `vence ${formatLotDate(item.expirationDate)}`}{' '}
                  · {item.quantity.toLocaleString('es-CR')} disp.
                </option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label htmlFor="exit-quantity">Cantidad</label>
            <input
              id="exit-quantity"
              type="number"
              min="1"
              max={lot?.quantity}
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
        </div>
        <div className="form__field">
          <label htmlFor="exit-detail">Detalle (opcional)</label>
          <input
            id="exit-detail"
            value={detail}
            maxLength={200}
            placeholder="Ej. botellas vencidas retiradas de la góndola"
            onChange={(event) => setDetail(event.target.value)}
          />
        </div>

        {error === null ? null : (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}

        <p className="muted" role="status">
          Disponible en el lote:{' '}
          <strong>{lot === undefined ? '—' : lot.quantity.toLocaleString('es-CR')}</strong> · Stock:{' '}
          {product.stock.toLocaleString('es-CR')} →{' '}
          <strong>{Math.max(0, product.stock - (units ?? 0)).toLocaleString('es-CR')}</strong> ·
          Valor al costo: <strong>{value === null ? '—' : formatMoney(value)}</strong>
        </p>

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar egreso'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
