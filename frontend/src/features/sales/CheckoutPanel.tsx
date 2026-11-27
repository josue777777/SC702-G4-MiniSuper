import type { Customer, CustomerPayload, PaymentMethod } from '../../types/sales';
import { NavIcon } from '../../layouts/NavIcon';
import type { NavIconName } from '../../layouts/navigation';
import { formatMoney } from '../products/money';
import { cashSuggestions } from './cash-suggestions';
import { CustomerPicker } from './CustomerPicker';
import { PAYMENT_LABELS } from './payment-labels';

interface CheckoutPanelProps {
  total: string;
  /** Unidades en el carrito, para el visor («3 artículos»). */
  units: number;
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

const METHOD_ICONS: Record<PaymentMethod, NavIconName> = {
  CASH: 'cash',
  CARD: 'card',
  CREDIT: 'ledger',
};

/**
 * Cobro (HU-17, HU-18, HU-36): método de pago explícito (sin opción por
 * defecto), efectivo con monto recibido y cambio, fiado con cliente identificado
 * y cliente opcional para asociar compras de contado.
 *
 * Arma la secuencia de una caja registradora, de arriba hacia abajo: el visor
 * con el total, el método de pago en botones grandes, lo que pide ese método
 * (monto recibido con montos rápidos, o el cliente del fiado) y, al final, el
 * botón para finalizar con el total a la vista.
 */
export function CheckoutPanel(props: CheckoutPanelProps) {
  const { method, cashReceived, cashValid, change, total, hasItems, units } = props;
  const cashTouched = cashReceived.trim() !== '';

  return (
    <section className="card pos__checkout" aria-label="Cobro">
      <div className="pos__display">
        <span className="pos__display-label">Total a cobrar</span>
        <strong className="pos__display-total">{formatMoney(total)}</strong>
        <span className="pos__display-detail">
          {units === 0 ? 'Sin artículos' : `${units} artículo(s)`}
        </span>
      </div>

      <fieldset className="pos__methods">
        <legend>Método de pago</legend>
        {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((option) => (
          <label
            key={option}
            className={method === option ? 'pos__method pos__method--active' : 'pos__method'}
          >
            <input
              type="radio"
              name="payment-method"
              value={option}
              checked={method === option}
              disabled={props.submitting}
              onChange={() => props.onMethod(option)}
            />
            <NavIcon name={METHOD_ICONS[option]} size={22} />
            {PAYMENT_LABELS[option]}
          </label>
        ))}
      </fieldset>

      {method === 'CASH' ? (
        <div className="form__field pos__cash">
          <label htmlFor="pos-cash">Monto recibido</label>
          <input
            id="pos-cash"
            inputMode="decimal"
            value={cashReceived}
            autoComplete="off"
            placeholder="0.00"
            onChange={(event) => props.onCash(event.target.value)}
          />
          {hasItems ? (
            <div className="pos__quick-cash" aria-label="Montos rápidos">
              {cashSuggestions(total).map((amount, index) => (
                <button
                  key={amount}
                  type="button"
                  className="button"
                  disabled={props.submitting}
                  onClick={() => props.onCash(amount)}
                >
                  {index === 0 ? 'Exacto' : formatMoney(amount)}
                </button>
              ))}
            </div>
          ) : null}
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

      {method !== null && method !== 'CREDIT' ? (
        <div className="form__field">
          <label htmlFor="pos-customer-optional">Cliente (opcional)</label>
          <select
            id="pos-customer-optional"
            value={props.customerId}
            disabled={props.submitting}
            onChange={(event) => props.onCustomer(event.target.value)}
          >
            <option value="">Venta sin cliente asociado</option>
            {props.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <small className="muted">
            Asociar un cliente permite consultar esta compra en su historial.
          </small>
        </div>
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
        className="button button--primary button--block pos__confirm"
        disabled={!props.canConfirm}
        onClick={props.onConfirm}
      >
        {props.submitting ? 'Registrando venta…' : 'Finalizar venta'}
        {props.submitting || !hasItems ? null : (
          <span className="pos__confirm-total">{formatMoney(total)}</span>
        )}
      </button>
    </section>
  );
}
