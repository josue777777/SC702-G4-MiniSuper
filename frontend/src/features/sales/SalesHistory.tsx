import { useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { salesService } from '../../services/sales.service';
import type { PaymentMethod, SaleSummary } from '../../types/sales';
import { formatDateTime } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { PAYMENT_LABELS } from './payment-labels';
import { SaleAdjustmentModal } from './SaleAdjustmentModal';

interface SalesHistoryProps {
  /** Cambia tras cada venta confirmada para recargar el historial. */
  version: number;
  /** Abre el comprobante de una venta del historial (HU-34). */
  onOpenReceipt: (saleId: string) => void;
  /** Recarga el historial luego de modificar una venta. */
  onAdjustmentComplete: () => void;
}

/** Historial mínimo de ventas con filtro por método de pago (HU-17). El módulo completo es HU-20. */
export function SalesHistory({ version, onOpenReceipt, onAdjustmentComplete }: SalesHistoryProps) {
  const [filter, setFilter] = useState<PaymentMethod | ''>('');
  const [sales, setSales] = useState<SaleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentSaleId, setAdjustmentSaleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    salesService
      .list(filter === '' ? undefined : filter)
      .then((rows) => {
        if (!cancelled) {
          setSales(rows);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar el historial.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filter, version]);

  return (
    <section className="card">
      <header className="card__header">
        <h2>Historial de ventas</h2>
        <span className="card__header-end">
          <label className="toolbar__filter">
            Método de pago{' '}
            <select
              aria-label="Filtrar por método de pago"
              value={filter}
              onChange={(event) => setFilter(event.target.value as PaymentMethod | '')}
            >
              <option value="">Todos</option>
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
        </span>
      </header>

      {error === null ? null : (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {sales === null && error === null ? <p className="muted">Cargando ventas…</p> : null}

      {sales !== null && sales.length === 0 ? (
        <p className="muted">
          {filter === ''
            ? 'Todavía no hay ventas registradas.'
            : `No hay ventas pagadas con ${PAYMENT_LABELS[filter].toLowerCase()}.`}
        </p>
      ) : null}

      {sales !== null && sales.length > 0 ? (
        <div className="table-wrapper">
          <table className="table" aria-label="Historial de ventas">
            <thead>
              <tr>
                <th>Venta</th>
                <th>Fecha y hora</th>
                <th>Método de pago</th>
                <th>Estado</th>
                <th>Cliente</th>
                <th className="table__number">Productos</th>
                <th className="table__number">Total</th>
                <th>
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.number}</td>
                  <td>{formatDateTime(sale.createdAt)}</td>
                  <td>{PAYMENT_LABELS[sale.paymentMethod]}</td>
                  <td>{saleStatusLabel(sale.status)}</td>
                  <td>{sale.customerName ?? '—'}</td>
                  <td className="table__number">{sale.itemCount}</td>
                  <td className="table__number">{formatMoney(sale.total)}</td>
                  <td>
                    <div className="row-actions">
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
      ) : null}
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

function saleStatusLabel(status: SaleSummary['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'Completada';
    case 'PARTIALLY_RETURNED':
      return 'Con devolución';
    case 'RETURNED':
      return 'Devuelta';
    case 'VOID':
      return 'Anulada';
  }
}
