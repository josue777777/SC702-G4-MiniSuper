import type { KardexProduct } from '../../types/kardex';
import { formatDateOnly } from '../inventory/inventory-count';
import { formatMoney } from '../products/money';

/**
 * Ficha vacía, mientras no se elige un producto: los mismos datos con «—»,
 * para que la pantalla muestre desde el inicio qué se va a ver (no un hueco).
 */
export function EmptyProductSheet() {
  const tiles = ['Stock actual', 'Precio de venta', 'Costo'];
  const details = ['Código', 'Código de barras', 'Categoría', 'Proveedor principal', 'Vencimiento'];

  return (
    <section className="card kardex-sheet--empty" aria-label="Ficha del producto">
      <header className="card__header">
        <h2>Ningún producto elegido</h2>
        <span className="card__header-end muted">
          Busque un código, un nombre o escanee el código de barras
        </span>
      </header>
      <div className="stat-grid" aria-label="Datos principales">
        {tiles.map((label) => (
          <div key={label} className="stat-tile">
            <span className="stat-tile__label">{label}</span>
            <strong className="stat-tile__value">—</strong>
          </div>
        ))}
      </div>
      <dl className="kardex-details">
        {details.map((label) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>—</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Ficha del producto (HU-31): lo que lo identifica, su precio, su costo, su proveedor y su stock. */
export function ProductSheet({ product }: { product: KardexProduct }) {
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

      <div className="stat-grid" aria-label="Datos principales">
        <div className="stat-tile">
          <span className="stat-tile__label">Stock actual</span>
          <strong className="stat-tile__value">{product.stock.toLocaleString('es-CR')}</strong>
          {product.minStock > 0 ? (
            <span className="stat-tile__detail">
              Mínimo: {product.minStock.toLocaleString('es-CR')}
            </span>
          ) : null}
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Precio de venta</span>
          <strong className="stat-tile__value">{formatMoney(product.price)}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Costo</span>
          <strong className="stat-tile__value">{formatMoney(product.cost)}</strong>
        </div>
      </div>

      <dl className="kardex-details">
        <div>
          <dt>Código</dt>
          <dd>{product.code}</dd>
        </div>
        <div>
          <dt>Código de barras</dt>
          <dd>{product.barcode ?? 'Sin código de barras'}</dd>
        </div>
        <div>
          <dt>Categoría</dt>
          <dd>{product.categoryName}</dd>
        </div>
        <div>
          <dt>Proveedor principal</dt>
          <dd>{product.supplierName ?? 'Sin proveedor'}</dd>
        </div>
        {product.expirationDate === null ? null : (
          <div>
            <dt>Vencimiento</dt>
            <dd>{formatDateOnly(product.expirationDate)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
