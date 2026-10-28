import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { RequestStatusBadge } from '../features/platform/RequestStatusBadge';
import { formatMoney } from '../features/products/money';
import { ApiError } from '../services/api-client';
import { platformService } from '../services/platform.service';
import type { PlanRequest } from '../types/platform';

type Filter = 'PENDING' | 'ALL';

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/**
 * Bandeja de solicitudes de los Encargados (solo Administrador): cuántos
 * usuarios más piden y el monto mensual cotizado. Al aprobar, el plan del
 * negocio sube y su Encargado crea los usuarios; al rechazar, no cambia nada.
 */
export function PlanRequestsPage() {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [requests, setRequests] = useState<PlanRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{
    request: PlanRequest;
    decision: 'approve' | 'reject';
  } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setRequests(await platformService.listRequests(filter === 'PENDING' ? 'PENDING' : undefined));
      setLoadError(null);
    } catch (error) {
      setLoadError(describeError(error));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className="page-header">
        <h1>Solicitudes</h1>
        <p>Los Encargados piden más usuarios para su negocio; aquí se aprueban o rechazan.</p>
      </header>

      <div className="toolbar" role="group" aria-label="Filtrar solicitudes">
        <button
          type="button"
          className={filter === 'PENDING' ? 'button button--primary' : 'button'}
          aria-pressed={filter === 'PENDING'}
          onClick={() => setFilter('PENDING')}
        >
          Pendientes
        </button>
        <button
          type="button"
          className={filter === 'ALL' ? 'button button--primary' : 'button'}
          aria-pressed={filter === 'ALL'}
          onClick={() => setFilter('ALL')}
        >
          Todas
        </button>
      </div>

      {notice === null ? null : (
        <p className="alert alert--success" role="status">
          {notice}
          <button
            type="button"
            className="alert__close"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      {loadError === null ? null : (
        <section className="card">
          <header className="card__header">
            <h2>No se pudieron cargar las solicitudes</h2>
            <button type="button" className="button" onClick={() => void load()}>
              Reintentar
            </button>
          </header>
          <p className="muted">{loadError}</p>
        </section>
      )}

      {requests === null && loadError === null ? (
        <p className="card muted">Cargando solicitudes…</p>
      ) : null}

      {requests === null ? null : (
        <section className="card">
          <header className="card__header">
            <h2>{filter === 'PENDING' ? 'Pendientes' : 'Todas las solicitudes'}</h2>
            <span className="muted">{requests.length} solicitud(es)</span>
          </header>
          {requests.length === 0 ? (
            <p className="muted">
              {filter === 'PENDING'
                ? 'No hay solicitudes pendientes.'
                : 'Todavía no hay solicitudes.'}
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Negocio</th>
                    <th>Usuarios</th>
                    <th>Monto mensual</th>
                    <th>Nota</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>{new Date(request.createdAt).toLocaleDateString('es-CR')}</td>
                      <td>
                        <strong>{request.businessName}</strong>
                        <div className="muted">Pide: {request.requestedBy}</div>
                      </td>
                      <td>+{request.extraUsers}</td>
                      <td>{formatMoney(request.monthlyAmount)}</td>
                      <td>{request.note ?? <span className="muted">—</span>}</td>
                      <td>
                        <RequestStatusBadge status={request.status} />
                        {request.response === null ? null : (
                          <div className="muted">{request.response}</div>
                        )}
                      </td>
                      <td>
                        {request.status === 'PENDING' ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="button button--primary"
                              onClick={() => setDeciding({ request, decision: 'approve' })}
                            >
                              Aprobar
                            </button>
                            <button
                              type="button"
                              className="button button--danger"
                              onClick={() => setDeciding({ request, decision: 'reject' })}
                            >
                              Rechazar
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {deciding === null ? null : (
        <DecideDialog
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={(decided) => {
            setDeciding(null);
            setNotice(
              decided.status === 'APPROVED'
                ? `Aprobada: «${decided.businessName}» ya puede crear ${decided.extraUsers} usuario(s) más.`
                : `Rechazada la solicitud de «${decided.businessName}».`,
            );
            void load();
          }}
        />
      )}
    </>
  );
}

/** Confirma aprobar o rechazar, con una respuesta opcional que verá el Encargado. */
function DecideDialog({
  request,
  decision,
  onClose,
  onDone,
}: {
  request: PlanRequest;
  decision: 'approve' | 'reject';
  onClose: () => void;
  onDone: (decided: PlanRequest) => void;
}) {
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approving = decision === 'approve';

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      onDone(
        await platformService.decide(
          request.id,
          decision,
          response.trim() === '' ? null : response.trim(),
        ),
      );
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={approving ? 'Aprobar solicitud' : 'Rechazar solicitud'} onClose={onClose}>
      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <p>
        {approving
          ? `El plan de «${request.businessName}» sube ${request.extraUsers} usuario(s), por ${formatMoney(request.monthlyAmount)} más al mes. Su Encargado podrá crearlos.`
          : `El plan de «${request.businessName}» no cambia.`}
      </p>
      <div className="form__field">
        <label htmlFor="decide-response">Respuesta para el Encargado (opcional)</label>
        <textarea
          id="decide-response"
          rows={2}
          maxLength={300}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
        />
      </div>
      <div className="form__actions">
        <button
          type="button"
          className={approving ? 'button button--primary' : 'button button--danger'}
          disabled={busy}
          onClick={() => void confirm()}
        >
          {approving ? 'Aprobar' : 'Rechazar'}
        </button>
        <button type="button" className="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
