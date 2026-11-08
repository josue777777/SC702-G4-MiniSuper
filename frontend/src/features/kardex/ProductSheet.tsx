import type { ReactNode } from 'react';
import type { KardexAmounts, KardexProduct } from '../../types/kardex';
import { UNITS_OF_MEASURE } from '../../types/products';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { signed, stockStatus } from './kardex-format';

/** Una celda de la ficha: etiqueta oscura a la izquierda, valor a la derecha. */
function Cell({
  label,
  children,
  size,
}: {
  label: string;
  children: ReactNode;
  size?: 'wide' | 'full';
}) {
  return (
    <div
      className={
        size === undefined ? 'kardex-sheet__cell' : `kardex-sheet__cell kardex-sheet__cell--${size}`
      }
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Resumen de todo el historial: «Entró +30 · Salió −12 · 9 movimientos». */
function Summary({ summary }: { summary: KardexAmounts | null }) {
  return (
    <Cell label="Historial" size="wide">
      {summary === null ? (
        <span className="muted">Entró — · Salió — · — movimientos</span>
      ) : (
        <>
          <span>
            Entró <span className="flow-in">{signed(summary.entries, 'in')}</span>
          </span>
          <span>
            Salió <span className="flow-out">{signed(summary.exits, 'out')}</span>
          </span>
          <span className="muted">
            {summary.count.toLocaleString('es-CR')}{' '}
            {summary.count === 1 ? 'movimiento' : 'movimientos'}
          </span>
        </>
      )}
    </Cell>
  );
}

/**
 * Ficha del producto en Movimientos (HU-31), como una hoja de celdas:
 * producto (código, nombre, código de barras y categoría), unidad, precio,
 * costo, proveedor principal, descripción, vencimiento, existencias con su
 * estado («Bien», «Bajo», «Agotado», «Sobre el máximo»: insignia con color Y
 * palabra), stock mínimo y máximo, y el resumen de lo que entró y salió.
 *
 * Sin producto (`product = null`) se ve la misma hoja con «—», para que la
 * pantalla muestre desde el inicio qué se va a ver.
 */
export function ProductSheet({
  product,
  summary,
}: {
  product: KardexProduct | null;
  summary: KardexAmounts | null;
}) {
  if (product === null) {
    return (
      <section className="card kardex-sheet--empty" aria-label="Ficha del producto">
        <header className="card__header">
          <h2>Ningún producto elegido</h2>
          <span className="card__header-end muted">
            Busque un código, un nombre o escanee el código de barras
          </span>
        </header>
        <dl className="kardex-sheet">
          <Cell label="Producto" size="full">
            —
          </Cell>
          {[
            'Unidad',
            'Precio de venta',
            'Costo',
            'Proveedor princ.',
            'Existencias',
            'Stock mínimo',
            'Stock máximo',
          ].map((label) => (
            <Cell key={label} label={label}>
              —
            </Cell>
          ))}
          <Summary summary={null} />
        </dl>
      </section>
    );
  }

  const status = stockStatus(product);

  return (
    <section className="card" aria-label={`Ficha de ${product.name}`}>
      <header className="card__header">
        <h2>
          {product.name}{' '}
          <span className={`badge ${product.isActive ? 'badge--ok' : 'badge--muted'}`}>
            {product.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </h2>
      </header>

      <dl className="kardex-sheet">
        <Cell label="Producto" size="full">
          <strong>{product.code}</strong> {product.name}
          <span className="muted">
            · {product.barcode ?? 'Sin código de barras'} · {product.categoryName}
          </span>
        </Cell>
        <Cell label="Unidad">
          {UNITS_OF_MEASURE[product.unit]} ({product.unit})
        </Cell>
        <Cell label="Precio de venta">{formatMoney(product.price)}</Cell>
        <Cell label="Costo">{formatMoney(product.cost)}</Cell>
        <Cell label="Proveedor princ.">{product.supplierName ?? 'Sin proveedor'}</Cell>
        <Cell label="Descripción" size="wide">
          {product.description ?? 'Sin descripción'}
        </Cell>
        <Cell label="Vencimiento">
          {product.perishable
            ? product.expirationDate === null
              ? 'Sin fecha'
              : formatDateOnly(product.expirationDate)
            : 'No vence'}
        </Cell>
        <Cell label="Existencias">
          <span className="kardex-sheet__big" aria-label="Stock actual">
            {product.stock.toLocaleString('es-CR')}
          </span>
          <span className={`badge badge--${status.tone}`}>{status.label}</span>
        </Cell>
        <Cell label="Stock mínimo">
          {product.minStock === 0 ? 'Sin mínimo' : product.minStock.toLocaleString('es-CR')}
        </Cell>
        <Cell label="Stock máximo">
          {product.maxStock === 0 ? 'Sin máximo' : product.maxStock.toLocaleString('es-CR')}
        </Cell>
        <Summary summary={summary} />
      </dl>
    </section>
  );
}
