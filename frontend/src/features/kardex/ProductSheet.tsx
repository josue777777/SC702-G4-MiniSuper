import type { ReactNode } from 'react';
import type { KardexAmounts, KardexProduct } from '../../types/kardex';
import { UNITS_OF_MEASURE } from '../../types/products';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { FlowAmount } from './FlowAmount';
import { stockStatus } from './kardex-format';

/** Un bloque de la ficha: etiqueta pequeña arriba y el dato debajo. */
function Block({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  /** Ocupa dos columnas (producto, descripción, historial). */
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'kardex-block kardex-block--wide' : 'kardex-block'}>
      <dt className="kardex-block__label">{label}</dt>
      <dd className="kardex-block__value">{children}</dd>
    </div>
  );
}

interface ProductSheetProps {
  product: KardexProduct | null;
  /** Resumen de todo el historial; `null` mientras llega. */
  summary: KardexAmounts | null;
}

/**
 * Ficha del producto en Movimientos (HU-31): cada dato en su propio bloque,
 * con el diseño del sistema (etiqueta pequeña, borde fino, esquinas
 * redondeadas). Ningún dato manda sobre los demás:
 *
 * 1. **Producto**: el código, el código de barras y la categoría.
 * 2. **Descripción** (el nombre), unidad, proveedor principal, precio, costo
 *    y vencimiento.
 * 3. **Existencias** con el aviso pequeño de su estado («Bien», «Bajo»,
 *    «Agotado», «Sobre el máximo»: color de estado y palabra), stock mínimo,
 *    stock máximo y el historial («Entró +30 · Salió −12 · 9 movimientos»).
 *
 * Sin producto (`product = null`) se ven los mismos bloques con «—».
 */
export function ProductSheet({ product, summary }: ProductSheetProps) {
  const status = product === null ? null : stockStatus(product);
  const dash = '—';

  return (
    <section
      className="card"
      aria-label={product === null ? 'Ficha del producto' : `Ficha de ${product.name}`}
    >
      <header className="card__header">
        {product === null ? (
          <>
            <h2>Ningún producto elegido</h2>
            <span className="card__header-end muted">
              Busque un código, un nombre o escanee el código de barras
            </span>
          </>
        ) : (
          <h2>
            {product.name}{' '}
            <span className={`badge ${product.isActive ? 'badge--ok' : 'badge--muted'}`}>
              {product.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </h2>
        )}
      </header>

      <dl className="kardex-sheet">
        <Block label="Producto" wide>
          {product === null ? (
            dash
          ) : (
            <>
              <strong>{product.code}</strong>
              <span className="muted">
                {' '}
                · {product.barcode ?? 'Sin código de barras'} · {product.categoryName}
              </span>
            </>
          )}
        </Block>
        <Block label="Descripción" wide>
          {product === null ? dash : product.name}
        </Block>

        <Block label="Unidad">
          {product === null ? dash : `${UNITS_OF_MEASURE[product.unit]} (${product.unit})`}
        </Block>
        <Block label="Proveedor principal">
          {product === null ? dash : (product.supplierName ?? 'Sin proveedor')}
        </Block>
        <Block label="Precio de venta">
          {product === null ? dash : formatMoney(product.price)}
        </Block>
        <Block label="Costo">{product === null ? dash : formatMoney(product.cost)}</Block>

        <Block label="Existencias">
          <span className="kardex-block__row">
            <strong aria-label="Stock actual">
              {product === null ? dash : product.stock.toLocaleString('es-CR')}
            </strong>
            {status === null ? null : (
              <span className={`badge badge--${status.tone}`}>{status.label}</span>
            )}
          </span>
        </Block>
        <Block label="Stock mínimo">
          {product === null
            ? dash
            : product.minStock === 0
              ? 'Sin mínimo'
              : product.minStock.toLocaleString('es-CR')}
        </Block>
        <Block label="Stock máximo">
          {product === null
            ? dash
            : product.maxStock === 0
              ? 'Sin máximo'
              : product.maxStock.toLocaleString('es-CR')}
        </Block>
        <Block label="Vencimiento">
          {product === null
            ? dash
            : !product.perishable
              ? 'No vence'
              : product.expirationDate === null
                ? 'Sin fecha'
                : formatDateOnly(product.expirationDate)}
        </Block>

        <Block label="Historial" wide>
          {product === null || summary === null ? (
            dash
          ) : (
            <span
              className="kardex-block__row kardex-block__row--together"
              aria-label="Resumen del historial"
            >
              <span>
                Entró <FlowAmount value={summary.entries} direction="in" signed />
              </span>
              <span>
                Salió <FlowAmount value={summary.exits} direction="out" signed />
              </span>
              <span className="muted">
                {summary.count.toLocaleString('es-CR')}{' '}
                {summary.count === 1 ? 'movimiento' : 'movimientos'}
              </span>
            </span>
          )}
        </Block>
      </dl>
    </section>
  );
}
