import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { customersService } from '../../services/sales.service';
import type { Customer } from '../../types/sales';
import { formatMoney } from '../products/money';

/**
 * Clientes mínimos para fiar (HU-18): crear un cliente, ver los activos y su
 * saldo (ventas a crédito − abonos). Editar, desactivar y registrar abonos son
 * de HU-19 / HU-30.
 */
export function CustomersSection() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setCustomers(await customersService.list());
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'No se pudo cargar los clientes.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreated(null);

    if (name.trim() === '') {
      setFormError('Escriba el nombre del cliente.');
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      const customer = await customersService.create({ name: name.trim(), phone: phone.trim() });

      setName('');
      setPhone('');
      setCreated(`Cliente "${customer.name}" creado.`);
      await load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'No se pudo crear el cliente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <header className="card__header">
          <h2>Nuevo cliente</h2>
        </header>
        <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="form__grid">
            <div className="form__field">
              <label htmlFor="customer-name">Nombre</label>
              <input
                id="customer-name"
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="form__field">
              <label htmlFor="customer-phone">Teléfono (opcional)</label>
              <input
                id="customer-phone"
                value={phone}
                maxLength={30}
                autoComplete="off"
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          </div>
          {formError === null ? null : (
            <p className="form__error" role="alert">
              {formError}
            </p>
          )}
          {created === null ? null : (
            <p className="alert alert--success" role="status">
              {created}
            </p>
          )}
          <div className="form__actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <header className="card__header">
          <h2>Clientes y saldos</h2>
        </header>

        {loadError === null ? null : (
          <div className="alert alert--error" role="alert">
            {loadError}
          </div>
        )}
        {customers === null && loadError === null ? (
          <p className="muted">Cargando clientes…</p>
        ) : null}
        {customers !== null && customers.length === 0 ? (
          <p className="muted">Todavía no hay clientes registrados.</p>
        ) : null}

        {customers !== null && customers.length > 0 ? (
          <div className="table-wrapper">
            <table className="table" aria-label="Clientes">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th className="table__number">Deuda (fiado)</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.phone ?? '—'}</td>
                    <td className="table__number">{formatMoney(customer.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
