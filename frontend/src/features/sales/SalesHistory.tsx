import { useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { salesService } from '../../services/sales.service';
import type { DailySalesHistory, PaymentMethod } from '../../types/sales';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';
import { SaleAdjustmentModal } from './SaleAdjustmentModal';
import { SaleDetailModal } from './SaleDetailModal';
import { formatSaleDateTime, saleStatusLabel } from './sale-format';

interface SalesHistoryProps {
  version: number;
  onOpenReceipt: (saleId: string) => void;
  onAdjustmentComplete: () => void;
}

/** Historial diario del negocio, con totales independientes de la página y el método. */
export function SalesHistory({ version, onOpenReceipt, onAdjustmentComplete }: SalesHistoryProps) {
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }),
  );
  const [filter, setFilter] = useState<PaymentMethod | ''>('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: DailySalesHistory;
    error?: string;
  } | null>(null);
  const [adjustmentSaleId, setAdjustmentSaleId] = useState<string | null>(null);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const key = `${date}/${filter}/${page}/${version}/${attempt}`;

  useEffect(() => {
    let cancelled = false;
    salesService
      .dailyHistory(date, page, filter === '' ? undefined : filter)
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setResult({
            key,
            error: caught instanceof ApiError ? caught.message : 'No se pudo cargar el historial.',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [date, page, filter, key]);

  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;

  return (
    <section className="card" aria-labelledby="sales-history-title">
      <header className="card__header">
        <h2 id="sales-history-title">Historial de ventas</h2>
        <div className="row-actions">
          <label className="toolbar__filter">
            <span>Día (Costa Rica)</span>
            <input
              type="date"
              aria-label="Día del historial"
              value={date}
              required
              onChange={(event) => {
                if (event.target.value) {
                  setDate(event.target.value);
                  setPage(1);
                }
              }}
            />
          </label>
          <label className="toolbar__filter">
            <span>Método de pago</span>
            <select
              aria-label="Filtrar por método de pago"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as PaymentMethod | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button"
            aria-label="Actualizar historial"
            title="Volver a consultar el día"
            onClick={() => setAttempt(attempt + 1)}
          >
            ↻ Actualizar
          </button>
        </div>
      </header>
      {error === undefined ? null : (
        <div className="alert alert--error" role="alert">
          {error}{' '}
          <button type="button" className="button" onClick={() => setAttempt(attempt + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {data === undefined && error === undefined ? (
        <p className="muted" role="status">
          Cargando ventas…
        </p>
      ) : null}
      {data === undefined ? null : (
        <>
          <div className="sales-history-totals" role="status" aria-label="Totales del día">
            <p>
              Total efectivo vendido del día: <strong>{formatMoney(data.day.total)}</strong>
            </p>
            <p>
              Total original: {formatMoney(data.day.originalTotal)} · {data.day.saleCount} ventas
              registradas
            </p>
            {/* La explicación se abre a pedido: se lee una vez y después solo ocupa espacio. */}
            <details className="disclosure">
              <summary>ⓘ Qué incluye este total</summary>
              <p className="muted">
                El total efectivo descuenta devoluciones y anulaciones, e incluye fiados; no
                equivale a dinero cobrado. Los totales abarcan todo el día, sin depender del filtro
                ni de la página.
              </p>
            </details>
          </div>
          {data.sales.length === 0 ? (
            <p className="muted">
              {filter === ''
                ? 'No hay ventas registradas en este día.'
                : `No hay ventas pagadas con ${PAYMENT_LABELS[filter].toLowerCase()} en este día.`}
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table" aria-label="Historial de ventas">
                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Fecha y hora (CR)</th>
                    <th>Productos × cantidad</th>
                    <th>Pago</th>
                    <th>Estado</th>
                    <th>Cliente</th>
                    <th className="table__number">Total original</th>
                    <th className="table__number">Total efectivo</th>
                    <th>
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>#{sale.number}</td>
                      <td>{formatSaleDateTime(sale.createdAt)}</td>
                      <td>
                        {sale.items.map((item) => (
                          <div key={item.id}>
                            {item.name} × {item.quantity}
                          </div>
                        ))}
                      </td>
                      <td>{PAYMENT_LABELS[sale.paymentMethod]}</td>
                      <td>{saleStatusLabel(sale.status)}</td>
                      <td>{sale.customer?.name ?? '—'}</td>
                      <td className="table__number">{formatMoney(sale.originalTotal)}</td>
                      <td className="table__number">{formatMoney(sale.total)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button"
                            aria-label={`Ver detalle de la venta ${sale.number}`}
                            onClick={() => setDetailSaleId(sale.id)}
                          >
                            Detalle
                          </button>
                          <button
                            type="button"
                            className="button"
                            aria-label={`Ver comprobante de la venta ${sale.number}`}
                            onClick={() => onOpenReceipt(sale.id)}
                          >
                            Comprobante
                          </button>
                          <button
                            type="button"
                            className="button"
                            aria-label={`${sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED' ? 'Anular o devolver' : 'Ver ajustes de'} la venta ${sale.number}`}
                            onClick={() => setAdjustmentSaleId(sale.id)}
                          >
                            {sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED'
                              ? 'Anular/devolver'
                              : 'Ver ajustes'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="form__actions" aria-label="Páginas del historial">
            <button
              type="button"
              className="button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {Math.max(1, Math.ceil(data.matchingCount / data.pageSize))} ·{' '}
              {data.matchingCount} ventas coincidentes
            </span>
            <button
              type="button"
              className="button"
              disabled={page * data.pageSize >= data.matchingCount}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
      {detailSaleId === null ? null : (
        <SaleDetailModal
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          onOpenReceipt={onOpenReceipt}
        />
      )}
      {adjustmentSaleId === null ? null : (
        <SaleAdjustmentModal
          saleId={adjustmentSaleId}
          onClose={() => setAdjustmentSaleId(null)}
          onSaved={() => {
            setAdjustmentSaleId(null);
            onAdjustmentComplete();
          }}
        />
      )}
    </section>
  );
}
