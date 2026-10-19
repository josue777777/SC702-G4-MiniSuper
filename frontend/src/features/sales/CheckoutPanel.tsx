import type { Customer, CustomerPayload, PaymentMethod } from '../../types/sales';
import { formatMoney } from '../products/money';
import { CustomerPicker } from './CustomerPicker';
import { PAYMENT_LABELS } from './payment-labels';

interface CheckoutPanelProps {
  total: string;
  hasItems: boolean;
  method: PaymentMethod | null;
  cashReceived: string;
  cashValid: boolean;
  change: string | null;
  customers: Customer[];
  customerId: string;
  selectedCustomer: Customer | null;
  submitting: boolean;
  canConfirm: boolean;
  error: string | null;
  onMethod: (method: PaymentMethod) => void;
  onCash: (value: string) => void;
  onCustomer: (id: string) => void;
  onCreateCustomer: (payload: CustomerPayload) => Promise<string | null>;
  onConfirm: () => void;
}

/**
 * Cobro (HU-17, HU-18): método de pago explícito (sin opción por defecto),
 * efectivo con monto recibido y cambio, y fiado con cliente identificado.
 */
export function CheckoutPanel(props: CheckoutPanelProps) {
  const { method, cashReceived, cashValid, change, total, hasItems } = props;
  const cashTouched = cashReceived.trim() !== '';

  return (
    <section className="card pos__checkout" aria-label="Cobro">
      <header className="card__header">
        <h2>Cobro</h2>
      </header>

      <p className="pos__total">
        <span>Total a cobrar</span>
        <strong>{formatMoney(total)}</strong>
      </p>

      <fieldset className="pos__methods">
        <legend>Método de pago</legend>
        {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((option) => (
          <label key={option} className="pos__method">
            <input
              type="radio"
              name="payment-method"
              value={option}
              checked={method === option}
              disabled={props.submitting}
              onChange={() => props.onMethod(option)}
            />
            {PAYMENT_LABELS[option]}
          </label>
        ))}
      </fieldset>

      {method === 'CASH' ? (
        <div className="form__field">
          <label htmlFor="pos-cash">Monto recibido</label>
          <input
            id="pos-cash"
            inputMode="decimal"
            value={cashReceived}
            autoComplete="off"
            placeholder="0.00"
            onChange={(event) => props.onCash(event.target.value)}
          />
          {cashTouched && !cashValid && hasItems ? (
            <p className="form__error" role="alert">
              El monto recibido debe ser un importe válido y no menor al total.
            </p>
          ) : null}
          {change === null ? null : (
            <p className="pos__change" role="status">
              Cambio a devolver: <strong>{formatMoney(change)}</strong>
            </p>
          )}
        </div>
      ) : null}

      {method === 'CREDIT' ? (
        <CustomerPicker
          customers={props.customers}
          customerId={props.customerId}
          selected={props.selectedCustomer}
          total={total}
          onSelect={props.onCustomer}
          onCreate={props.onCreateCustomer}
        />
      ) : null}

      {props.error === null ? null : (
        <div className="alert alert--error" role="alert">
          {props.error}
        </div>
      )}

      {method === null && hasItems ? (
        <p className="muted hint">Seleccione el método de pago para finalizar la venta.</p>
      ) : null}

      <button
        type="button"
        className="button button--primary button--block"
        disabled={!props.canConfirm}
        onClick={props.onConfirm}
      >
        {props.submitting ? 'Registrando venta…' : 'Finalizar venta'}
      </button>
    </section>
  );
}
