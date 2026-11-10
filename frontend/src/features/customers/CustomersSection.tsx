import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../components/list-search';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import { ApiError } from '../../services/api-client';
import { customersService } from '../../services/sales.service';
import type { Customer } from '../../types/sales';
import { formatMoney } from '../products/money';
import { CustomerAccountModal } from './CustomerAccountModal';
import { CustomerPaymentFlow } from './CustomerPaymentFlow';
import { paymentMessage } from './credit-format';

/**
 * Qué ventana hay abierta sobre la lista (HU-19): la cuenta de un cliente o el
 * formulario de abono. `from` dice quién pidió el abono, para que «Cancelar»
 * vuelva ahí (docs/PANTALLAS.md: la persona decide a dónde va).
 */
type Dialog =
  | { kind: 'account'; customer: Customer }
  | { kind: 'pay'; customer: Customer; from: 'list' | 'account' };

/**
 * Clientes (HU-18, HU-19): crear un cliente, ver los activos y su saldo (ventas a
 * crédito − abonos). Cada fila tiene dos acciones a la vista: «Registrar abono»
 * (el pago, directo) y «Ver cuenta» (fiados, abonos y compras asociadas). Editar
 * y desactivar clientes todavía no existe.
 *
 * La pantalla es de consulta: lista con buscador y páginas. Los formularios y la
 * cuenta no ocupan espacio hasta que se piden, y se abren en una ventana (ver
 * docs/PANTALLAS.md).
 */
export function CustomersSection() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Confirmación del último abono: en la lista, o en la cuenta si el abono se pidió desde ahí.
  const [paidNotice, setPaidNotice] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      (customers ?? []).filter((customer) => matchesSearch(search, customer.name, customer.phone)),
    [customers, search],
  );
  const pages = usePagination(visible, search);

  function openForm(): void {
    setName('');
    setPhone('');
    setFormError(null);
    setCreated(null);
    setPaidNotice(null);
    setFormOpen(true);
  }

  function openDialog(next: Dialog): void {
    setPaidNotice(null);
    setDialog(next);
  }

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

  function closeForm(): void {
    // Mientras guarda no se cierra: el resultado debe verse.
    if (!busy) {
      setFormOpen(false);
    }
  }

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

      setFormOpen(false);
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
      {/* Tres columnas: la lista no se estira a todo el ancho (docs/PANTALLAS.md). */}
      <div className="list-narrow">
        <div className="toolbar">
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o teléfono"
            label="Buscar clientes"
          />
          <button
            type="button"
            className="button button--primary"
            disabled={customers === null}
            onClick={openForm}
          >
            + Nuevo cliente
          </button>
        </div>

        {created === null ? null : (
          <p className="alert alert--success" role="status">
            {created}
            <button
              type="button"
              className="alert__close"
              onClick={() => setCreated(null)}
              aria-label="Cerrar aviso"
            >
              ×
            </button>
          </p>
        )}

        {paidNotice === null || dialog?.kind === 'account' ? null : (
          <p className="alert alert--success" role="status">
            {paidNotice}
            <button
              type="button"
              className="alert__close"
              onClick={() => setPaidNotice(null)}
              aria-label="Cerrar aviso"
            >
              ×
            </button>
          </p>
        )}

        {formOpen ? (
          <Modal title="Nuevo cliente" onClose={closeForm}>
            <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
              <div className="form__grid">
                <div className="form__field">
                  <label htmlFor="customer-name">Nombre</label>
                  <input
                    id="customer-name"
                    value={name}
                    maxLength={120}
                    autoComplete="off"
                    autoFocus
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
              <div className="form__actions">
                <button type="submit" className="button button--primary" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar cliente'}
                </button>
                <button type="button" className="button" disabled={busy} onClick={closeForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </Modal>
        ) : null}

        <section className="card">
          <header className="card__header">
            <h2>Clientes y saldos</h2>
            {customers === null ? null : (
              <span className="muted">
                {search === ''
                  ? `${customers.length} cliente(s)`
                  : `${visible.length} de ${customers.length} cliente(s)`}
              </span>
            )}
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
            <p className="muted">Todavía no hay clientes registrados. Use «+ Nuevo cliente».</p>
          ) : null}
          {customers !== null && customers.length > 0 && visible.length === 0 ? (
            <p className="muted">Ningún cliente coincide con «{search}».</p>
          ) : null}

          {visible.length > 0 ? (
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
                  {pages.pageItems.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.phone ?? '—'}</td>
                      <td className="table__number">{formatMoney(customer.balance)}</td>
                      <td>
                        <div className="row-actions">
                          {/* Apagado y no oculto: se ve que existe y por qué no se puede. */}
                          <button
                            type="button"
                            className="button button--primary"
                            aria-label={`Registrar abono a ${customer.name}`}
                            disabled={Number(customer.balance) <= 0}
                            title={
                              Number(customer.balance) <= 0
                                ? 'Este cliente no tiene deuda.'
                                : undefined
                            }
                            onClick={() => openDialog({ kind: 'pay', customer, from: 'list' })}
                          >
                            Registrar abono
                          </button>
                          <button
                            type="button"
                            className="button"
                            aria-label={`Ver cuenta de ${customer.name}`}
                            onClick={() => openDialog({ kind: 'account', customer })}
                          >
                            Ver cuenta
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Pagination {...pages} itemLabel="clientes" onPage={pages.setPage} />
        </section>
      </div>

      {/* HU-19: la cuenta del cliente y el abono, en ventanas; el saldo siempre viene del servidor. */}
      {dialog?.kind === 'account' ? (
        <CustomerAccountModal
          customer={dialog.customer}
          notice={paidNotice}
          onDismissNotice={() => setPaidNotice(null)}
          onPay={() => openDialog({ kind: 'pay', customer: dialog.customer, from: 'account' })}
          onClose={() => {
            setPaidNotice(null);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'pay' ? (
        <CustomerPaymentFlow
          customer={dialog.customer}
          // «Cancelar» vuelve a donde se pidió el abono: la cuenta o la lista.
          onClose={() =>
            setDialog(
              dialog.from === 'account' ? { kind: 'account', customer: dialog.customer } : null,
            )
          }
          onPaid={(result) => {
            setPaidNotice(paymentMessage(result));
            setDialog(
              dialog.from === 'account' ? { kind: 'account', customer: dialog.customer } : null,
            );
            void load();
          }}
        />
      ) : null}
    </>
  );
}
