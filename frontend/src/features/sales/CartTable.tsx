import { formatMoney } from '../products/money';
import { lineSubtotal, type CartLine } from './cart';

interface CartTableProps {
  cart: CartLine[];
  total: string;
  disabled: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

/** Carrito de la venta (HU-16): producto, cantidad, precio unitario, subtotal y total. */
export function CartTable({ cart, total, disabled, onQuantity, onRemove }: CartTableProps) {
  return (
    <section className="card">
      <header className="card__header">
        <h2>Carrito</h2>
        <span className="card__header-end muted" role="status">
          {cart.length} producto(s)
        </span>
      </header>

      {cart.length === 0 ? (
        <p className="muted">
          El carrito está vacío. Escanee un producto o escriba su código para agregarlo.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table" aria-label="Productos de la venta">
            <thead>
              <tr>
                <th>Código</th>
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
              {cart.map((line) => (
                <tr key={line.productId}>
                  <td>{line.code}</td>
                  <td>{line.name}</td>
                  <td className="table__number">
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
                  </td>
                  <td className="table__number">{formatMoney(line.unitPrice)}</td>
                  <td className="table__number">{formatMoney(lineSubtotal(line))}</td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      disabled={disabled}
                      aria-label={`Quitar ${line.name}`}
                      onClick={() => onRemove(line.productId)}
                    >
                      Quitar
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
