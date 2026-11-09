import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { customersService } from '../../services/sales.service';
import type { Customer } from '../../types/sales';
import { formatMoney } from '../products/money';
import { CustomerAccount } from './CustomerAccount';

/**
 * Clientes (HU-18, HU-19): crear un cliente, buscarlo por nombre, ver su saldo
 * (ventas a crédito − abonos) y abrir su cuenta para consultar sus fiados y
 * registrar abonos. Editar y desactivar clientes todavía no existe.
 */
export function CustomersSection() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const needle = query.trim().toLowerCase();
  const visible =
    customers === null
      ? null
      : customers.filter(
          (customer) =>
            needle === '' ||
            customer.name.toLowerCase().includes(needle) ||
            (customer.phone ?? '').includes(needle),
        );

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
          <>
            <input
              type="search"
              className="customers-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente por nombre"
              aria-label="Buscar cliente por nombre"
              maxLength={120}
            />
            {visible !== null && visible.length === 0 ? (
              <p className="muted" role="status">
                Ningún cliente coincide con «{query.trim()}».
              </p>
            ) : (
              <div className="table-wrapper">
                <table className="table" aria-label="Clientes">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th className="table__number">Deuda (fiado)</th>
                      <th>
                        <span className="visually-hidden">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(visible ?? []).map((customer) => (
                      <tr
                        key={customer.id}
                        className={customer.id === selectedId ? 'table__row--selected' : undefined}
                        aria-selected={customer.id === selectedId}
                      >
                        <td>{customer.name}</td>
                        <td>{customer.phone ?? '—'}</td>
                        <td className="table__number">{formatMoney(customer.balance)}</td>
                        <td>
                          <button
                            type="button"
                            className="button"
                            aria-label={`Ver cuenta de ${customer.name}`}
                            onClick={() => setSelectedId(customer.id)}
                          >
                            Ver cuenta
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>

      {/* HU-19: la cuenta del cliente elegido (deuda, fiados, abonos); el saldo siempre viene del servidor. */}
      {selectedId === null ? null : (
        <CustomerAccount key={selectedId} customerId={selectedId} onChanged={() => void load()} />
      )}
    </>
  );
}
