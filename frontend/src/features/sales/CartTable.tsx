import { NavIcon } from '../../layouts/NavIcon';
import { formatMoney } from '../products/money';
import { lineSubtotal, type CartLine } from './cart';

interface CartTableProps {
  cart: CartLine[];
  total: string;
  disabled: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}

/**
 * Carrito de la venta (HU-16): producto, cantidad, precio unitario, subtotal y
 * total.
 *
 * Como en un punto de venta: cada línea numerada, el nombre del producto
 * destacado y su código debajo, la cantidad con botones − / + (también se
 * puede escribir) y el subtotal en negrita. Lo último que se escaneó queda
 * resaltado, para confirmar de un vistazo que entró el producto correcto.
 */
export function CartTable({
  cart,
  total,
  disabled,
  onQuantity,
  onRemove,
  onClear,
}: CartTableProps) {
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);
  const lastId = cart.at(-1)?.productId;

  return (
    <section className="card pos__cart">
      <header className="card__header">
        <h2>Productos de la venta</h2>
        <span className="card__header-end">
          <span className="muted" role="status">
            {cart.length} producto(s) · {units} unidad(es)
          </span>
          {cart.length === 0 ? null : (
            <button
              type="button"
              className="button button--quiet"
              disabled={disabled}
              onClick={onClear}
            >
              Vaciar
            </button>
          )}
        </span>
      </header>

      {cart.length === 0 ? (
        <div className="pos__empty">
          <span className="pos__empty-icon" aria-hidden="true">
            <NavIcon name="barcode" size={44} />
          </span>
          <p>
            <strong>El carrito está vacío.</strong> Escanee un producto o escriba su código para
            agregarlo.
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table pos__lines-table" aria-label="Productos de la venta">
            <thead>
              <tr>
                <th className="pos__col-index">#</th>
                <th>Producto</th>
                <th className="table__number">Cantidad</th>
                <th className="table__number">Precio unitario</th>
                <th className="table__number">Subtotal</th>
                <th>
                  <span className="visually-hidden">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, index) => (
                <tr
                  key={line.productId}
                  className={line.productId === lastId ? 'pos__line--last' : undefined}
                >
                  <td className="pos__col-index">{index + 1}</td>
                  <td>
                    <strong className="pos__product">{line.name}</strong>
                    <span className="pos__code">{line.code}</span>
                  </td>
                  <td className="table__number">
                    <div className="pos__stepper">
                      <button
                        type="button"
                        disabled={disabled || line.quantity <= 1}
                        aria-label={`Restar uno a ${line.name}`}
                        onClick={() => onQuantity(line.productId, line.quantity - 1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        className="pos__qty"
                        min={1}
                        max={line.stock}
                        step={1}
                        value={line.quantity}
                        disabled={disabled}
                        aria-label={`Cantidad de ${line.name}`}
                        onChange={(event) => onQuantity(line.productId, event.target.valueAsNumber)}
                      />
                      <button
                        type="button"
                        disabled={disabled || line.quantity >= line.stock}
                        aria-label={`Sumar uno a ${line.name}`}
                        onClick={() => onQuantity(line.productId, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="table__number">{formatMoney(line.unitPrice)}</td>
                  <td className="table__number">
                    <strong>{formatMoney(lineSubtotal(line))}</strong>
                  </td>
                  <td className="table__number">
                    <button
                      type="button"
                      className="pos__remove"
                      disabled={disabled}
                      aria-label={`Quitar ${line.name}`}
                      title="Quitar"
                      onClick={() => onRemove(line.productId)}
                    >
                      <NavIcon name="trash" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4} className="table__number">
                  Total
                </th>
                <th className="table__number" data-testid="cart-total">
                  {formatMoney(total)}
                </th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
