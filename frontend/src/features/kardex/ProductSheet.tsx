import type { KardexProduct } from '../../types/kardex';
import { UNITS_OF_MEASURE } from '../../types/products';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';
import { stockStatus } from './kardex-format';

/** Datos de la ficha, en el orden en que se leen. */
function details(product: KardexProduct | null): [string, string][] {
  if (product === null) {
    return [
      'Producto',
      'Descripción',
      'Código de barras',
      'Categoría',
      'Unidad',
      'Proveedor principal',
      'Stock mínimo',
      'Stock máximo',
      'Vencimiento',
    ].map((label) => [label, '—']);
  }

  return [
    ['Producto', product.code],
    ['Descripción', product.name],
    ['Código de barras', product.barcode ?? 'Sin código de barras'],
    ['Categoría', product.categoryName],
    ['Unidad', `${UNITS_OF_MEASURE[product.unit]} (${product.unit})`],
    ['Proveedor principal', product.supplierName ?? 'Sin proveedor'],
    [
      'Stock mínimo',
      product.minStock === 0 ? 'Sin mínimo' : product.minStock.toLocaleString('es-CR'),
    ],
    [
      'Stock máximo',
      product.maxStock === 0 ? 'Sin máximo' : product.maxStock.toLocaleString('es-CR'),
    ],
    [
      'Vencimiento',
      !product.perishable
        ? 'No vence'
        : product.expirationDate === null
          ? 'Sin fecha'
          : formatDateOnly(product.expirationDate),
    ],
  ];
}

/**
 * Ficha del producto en Movimientos (HU-31), con las mismas piezas que el
 * resto del sistema: tarjetas para las cifras (existencias, precio, costo) y
 * la lista de datos. «Producto» es el código y «Descripción» el nombre.
 *
 * Las existencias llevan su estado en palabra («Bien», «Bajo», «Agotado»,
 * «Sobre el máximo»): el color solo marca estados (docs/PANTALLAS.md).
 *
 * Sin producto (`product = null`) se ve la misma ficha con «—», para que la
 * pantalla muestre desde el inicio qué se va a ver.
 */
export function ProductSheet({ product }: { product: KardexProduct | null }) {
  const status = product === null ? null : stockStatus(product);

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

      <div className="stat-grid" aria-label="Datos principales">
        <div className="stat-tile">
          <span className="stat-tile__label">Existencias</span>
          <strong className="stat-tile__value" aria-label="Stock actual">
            {product === null ? '—' : product.stock.toLocaleString('es-CR')}
          </strong>
          {status === null ? null : (
            <span className="stat-tile__detail">
              <span className={`badge badge--${status.tone}`}>{status.label}</span>
            </span>
          )}
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Precio de venta</span>
          <strong className="stat-tile__value">
            {product === null ? '—' : formatMoney(product.price)}
          </strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Costo</span>
          <strong className="stat-tile__value">
            {product === null ? '—' : formatMoney(product.cost)}
          </strong>
        </div>
      </div>

      <dl className="kardex-details">
        {details(product).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
