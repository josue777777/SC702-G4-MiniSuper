import type { ReactNode } from 'react';
import type { KardexAmounts, KardexProduct } from '../../types/kardex';
import { UNITS_OF_MEASURE } from '../../types/products';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { FlowAmount } from './FlowAmount';
import { stockStatus, type StockStatus } from './kardex-format';

/** Ancho de una celda en la ficha (de 12 columnas). */
type Span = 3 | 4 | 5 | 'full';

/** Una celda de la ficha: la etiqueta a la izquierda (oscura) y el dato a la derecha. */
function Cell({
  label,
  children,
  span = 3,
  tone,
}: {
  label: string;
  children: ReactNode;
  span?: Span;
  /** La etiqueta toma el tono de un estado (solo «Existencias»). */
  tone?: StockStatus['tone'];
}) {
  const width =
    span === 3 ? '' : span === 'full' ? ' kardex-block--full' : ` kardex-block--span-${span}`;

  return (
    <div className={`kardex-block${width}`}>
      <dt
        className={
          tone === undefined
            ? 'kardex-block__label'
            : `kardex-block__label kardex-block__label--${tone}`
        }
      >
        {label}
      </dt>
      <dd className="kardex-block__value">{children}</dd>
    </div>
  );
}

interface ProductSheetProps {
  product: KardexProduct | null;
  /** El producto está llegando: las mismas celdas con «—» y «Cargando producto…». */
  loading?: boolean;
  /** Resumen de todo el historial; `null` mientras llega. */
  summary: KardexAmounts | null;
}

/**
 * Ficha del producto en Movimientos (HU-31), en celdas: la etiqueta a la
 * izquierda en el oscuro del sistema y el dato a la derecha, en filas
 * compactas (como una hoja):
 *
 * Sin encabezado propio: el nombre ya está en «Descripción». La celda
 * «Producto» lleva la insignia «Inactivo» solo si el producto está desactivado
 * (lo normal, activo, no se marca).
 *
 * 1. **Producto**: el código, el código de barras y la categoría.
 * 2. **Unidad**, **proveedor principal** y **descripción** (el nombre).
 * 3. **Precio de venta**, **costo** y **vencimiento**.
 * 4. **Existencias** (la etiqueta en el tono de su estado y el aviso pequeño
 *    con la palabra: «Bien», «Bajo», «Agotado», «Sobre el máximo»), **stock
 *    mínimo**, **stock máximo** e **historial** («Entró +30 · Salió −12 ·
 *    9 movimientos»).
 *
 * Sin producto (`product = null`) o mientras llega (`loading`) se ven las
 * mismas celdas con «—»: la pantalla no cambia de forma.
 */
export function ProductSheet({ product, loading = false, summary }: ProductSheetProps) {
  const status = product === null ? null : stockStatus(product);
  const dash = '—';

  return (
    <section
      className="card"
      aria-label={product === null ? 'Ficha del producto' : `Ficha de ${product.name}`}
    >
      <dl className="kardex-sheet">
        <Cell label="Producto" span="full">
          {product === null ? (
            loading ? (
              <span className="muted" role="status">
                Cargando producto…
              </span>
            ) : (
              dash
            )
          ) : (
            <span>
              <strong>{product.code}</strong>
              <span className="muted">
                {' '}
                · {product.barcode ?? 'Sin código de barras'} · {product.categoryName}
              </span>
              {product.isActive ? null : (
                <>
                  {' '}
                  <span className="badge badge--muted">Inactivo</span>
                </>
              )}
            </span>
          )}
        </Cell>

        <Cell label="Unidad">
          {product === null ? dash : `${UNITS_OF_MEASURE[product.unit]} (${product.unit})`}
        </Cell>
        <Cell label="Proveedor principal" span={4}>
          {product === null ? dash : (product.supplierName ?? 'Sin proveedor')}
        </Cell>
        <Cell label="Descripción" span={5}>
          {product === null ? dash : product.name}
        </Cell>

        <Cell label="Precio de venta" span={4}>
          {product === null ? dash : formatMoney(product.price)}
        </Cell>
        <Cell label="Costo" span={4}>
          {product === null ? dash : formatMoney(product.cost)}
        </Cell>
        <Cell label="Vencimiento" span={4}>
          {product === null
            ? dash
            : !product.perishable
              ? 'No vence'
              : product.expirationDate === null
                ? 'Sin fecha'
                : formatDateOnly(product.expirationDate)}
        </Cell>

        <Cell label="Existencias" {...(status === null ? {} : { tone: status.tone })}>
          <span className="kardex-block__row">
            <strong aria-label="Stock actual">
              {product === null ? dash : product.stock.toLocaleString('es-CR')}
            </strong>
            {status === null ? null : (
              <span className={`badge badge--${status.tone}`}>{status.label}</span>
            )}
          </span>
        </Cell>
        <Cell label="Stock mínimo">
          {product === null
            ? dash
            : product.minStock === 0
              ? 'Sin mínimo'
              : product.minStock.toLocaleString('es-CR')}
        </Cell>
        <Cell label="Stock máximo">
          {product === null
            ? dash
            : product.maxStock === 0
              ? 'Sin máximo'
              : product.maxStock.toLocaleString('es-CR')}
        </Cell>
        <Cell label="Historial">
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
                {summary.count.toLocaleString('es-CR')} {summary.count === 1 ? 'mov.' : 'movs.'}
              </span>
            </span>
          )}
        </Cell>
      </dl>
    </section>
  );
}
