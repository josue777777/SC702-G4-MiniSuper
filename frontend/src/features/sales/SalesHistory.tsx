import { useEffect, useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { ApiError } from '../../services/api-client';
import { salesService } from '../../services/sales.service';
import type { DailySalesHistory, PaymentMethod, SaleStatus } from '../../types/sales';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';
import { SaleAdjustmentModal } from './SaleAdjustmentModal';
import { SaleDetailModal } from './SaleDetailModal';
import { SaleProductsModal } from './SaleProductsModal';
import { formatSaleTime, saleStatusLabel } from './sale-format';

/** Tono de la insignia de cada estado (el color comunica estado, siempre con su palabra). */
const STATUS_TONES: Record<SaleStatus, string> = {
  COMPLETED: 'badge--ok',
  PARTIALLY_RETURNED: 'badge--warning',
  RETURNED: 'badge--muted',
  VOID: 'badge--error',
};

/** Venta de la página, tal como llega del historial. */
type HistorySale = DailySalesHistory['sales'][number];

interface SalesHistoryProps {
  version: number;
  onOpenReceipt: (saleId: string) => void;
  onAdjustmentComplete: () => void;
}

/**
 * Historial del día (HU-20), con las mismas piezas que el resto de las tablas
 * (Pedidos, Proveedores):
 *
 * - Filtros arriba que se aplican solos (día y método de pago) y «↻ Actualizar».
 * - Los totales del día, independientes de la página y del método.
 * - Una fila por venta, en orden: N.º, hora, cliente, productos, pago, estado
 *   (insignia con su palabra) y total. En la celda de productos va el primero y,
 *   si hay más, «+N más», que abre SOLO esa lista en una ventana (regla 4: la
 *   fila no crece). El detalle completo, con «Anular o devolver», es «Ver venta»;
 *   el ticket, «Comprobante».
 * - Páginas de 15 armadas en el servidor (`Pagination`, regla 2); mientras llega
 *   otra página o filtro se ve la anterior atenuada (no salta).
 */
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
  /** Venta cuyos productos se ven («+N más»). */
  const [productsOf, setProductsOf] = useState<HistorySale | null>(null);
  /** La última página que llegó: se sigue viendo, atenuada, mientras llega la nueva. */
  const [shown, setShown] = useState<DailySalesHistory | undefined>(undefined);
  const key = `${date}/${filter}/${page}/${version}/${attempt}`;

  useEffect(() => {
    let cancelled = false;
    salesService
      .dailyHistory(date, page, filter === '' ? undefined : filter)
      .then((data) => {
        if (!cancelled) {
          setResult({ key, data });
          setShown(data);
        }
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

  const error = result?.key === key ? result.error : undefined;
  // Mientras llega lo nuevo, lo anterior (atenuado); con un error, nada.
  const data = error === undefined ? shown : undefined;
  const busy = result?.key !== key;
  const pageCount =
    data === undefined ? 1 : Math.max(1, Math.ceil(data.matchingCount / data.pageSize));
  const from =
    data === undefined || data.sales.length === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = data === undefined ? 0 : from + data.sales.length - 1;

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
            <div className={busy ? 'table-wrapper table-wrapper--busy' : 'table-wrapper'}>
              <table className="table" aria-label="Historial de ventas" aria-busy={busy}>
                <thead>
                  <tr>
                    <th>N.º</th>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Productos</th>
                    <th>Pago</th>
                    <th>Estado</th>
                    <th className="table__number">Total</th>
                    <th>
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.map((sale) => {
                    const [first] = sale.items;
                    const more = sale.items.length - 1;

                    return (
                      <tr key={sale.id}>
                        <td>
                          <strong>#{sale.number}</strong>
                        </td>
                        <td>{formatSaleTime(sale.createdAt)}</td>
                        <td>{sale.customer?.name ?? '—'}</td>
                        <td>
                          {first === undefined ? '—' : `${first.name} × ${first.quantity}`}
                          {more <= 0 ? null : (
                            <>
                              {' '}
                              <button
                                type="button"
                                className="badge badge--button"
                                aria-label={`Ver los ${sale.items.length} productos de la venta ${sale.number}`}
                                onClick={() => setProductsOf(sale)}
                              >
                                +{more} más
                              </button>
                            </>
                          )}
                        </td>
                        <td>{PAYMENT_LABELS[sale.paymentMethod]}</td>
                        <td>
                          <span className={`badge ${STATUS_TONES[sale.status]}`}>
                            {saleStatusLabel(sale.status)}
                          </span>
                        </td>
                        <td className="table__number">
                          <strong>{formatMoney(sale.total)}</strong>
                          {sale.total === sale.originalTotal ? null : (
                            <span className="muted sales-history__original">
                              de {formatMoney(sale.originalTotal)}
                            </span>
                          )}
                        </td>
                        <td className="table__number">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="button"
                              aria-label={`Ver detalle de la venta ${sale.number}`}
                              onClick={() => setDetailSaleId(sale.id)}
                            >
                              Ver venta
                            </button>
                            <button
                              type="button"
                              className="button"
                              aria-label={`Ver comprobante de la venta ${sale.number}`}
                              onClick={() => onOpenReceipt(sale.id)}
                            >
                              🧾 Comprobante
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={data.page}
            pageCount={pageCount}
            total={data.matchingCount}
            from={from}
            to={to}
            itemLabel="ventas"
            label="Páginas del historial"
            busy={busy}
            onPage={setPage}
          />
        </>
      )}
      {productsOf === null ? null : (
        <SaleProductsModal
          saleNumber={productsOf.number}
          items={productsOf.items}
          onClose={() => setProductsOf(null)}
        />
      )}
      {detailSaleId === null ? null : (
        <SaleDetailModal
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          onOpenReceipt={onOpenReceipt}
          onAdjust={(saleId) => {
            setDetailSaleId(null);
            setAdjustmentSaleId(saleId);
          }}
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
