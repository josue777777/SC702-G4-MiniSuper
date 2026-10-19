import { useState, type FormEvent } from 'react';
import type { Customer, CustomerPayload } from '../../types/sales';
import { formatMoney } from '../products/money';
import { formatCents, toCents } from './cents';

interface CustomerPickerProps {
  customers: Customer[];
  customerId: string;
  selected: Customer | null;
  /** Total de la venta, para mostrar cómo quedaría la deuda. */
  total: string;
  onSelect: (id: string) => void;
  /** Devuelve un mensaje de error, o `null` si se creó. */
  onCreate: (payload: CustomerPayload) => Promise<string | null>;
}

/** Cliente del fiado (HU-18): elegir uno existente o crear uno básico, con su saldo. */
export function CustomerPicker({
  customers,
  customerId,
  selected,
  total,
  onSelect,
  onCreate,
}: CustomerPickerProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (name.trim() === '') {
      setError('Escriba el nombre del cliente.');
      return;
    }

    setBusy(true);

    const failure = await onCreate({ name: name.trim(), phone: phone.trim() });

    setBusy(false);
    setError(failure);

    if (failure === null) {
      setCreating(false);
      setName('');
      setPhone('');
    }
  }

  return (
    <div className="pos__customer">
      <div className="form__field">
        <label htmlFor="pos-customer">Cliente</label>
        <select
          id="pos-customer"
          value={customerId}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">Seleccione un cliente…</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        {customers.length === 0 ? (
          <small className="muted">Todavía no hay clientes. Cree el primero.</small>
        ) : null}
      </div>

      {selected === null ? null : (
        <dl className="pos__balance" aria-label="Saldo del cliente">
          <div>
            <dt>Deuda actual</dt>
            <dd>{formatMoney(selected.balance)}</dd>
          </div>
          <div>
            <dt>Deuda con esta venta</dt>
            <dd>{formatMoney(formatCents(toCents(selected.balance) + toCents(total)))}</dd>
          </div>
        </dl>
      )}

      {creating ? (
        <form
          className="pos__new-customer"
          onSubmit={(event) => void handleCreate(event)}
          noValidate
        >
          <div className="form__field">
            <label htmlFor="new-customer-name">Nombre del cliente</label>
            <input
              id="new-customer-name"
              value={name}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form__field">
            <label htmlFor="new-customer-phone">Teléfono (opcional)</label>
            <input
              id="new-customer-phone"
              value={phone}
              maxLength={30}
              autoComplete="off"
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          {error === null ? null : (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <div className="form__actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cliente'}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="button" onClick={() => setCreating(true)}>
          + Nuevo cliente
        </button>
      )}
    </div>
  );
}
