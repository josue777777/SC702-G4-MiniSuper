import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { KardexAmounts, KardexMovement } from '../../types/kardex';
import { formatMovementDate, formatQuantity } from './kardex-format';
import { MovementLotsModal } from './MovementLotsModal';

/** Producto de la línea, solo en la vista general (todos los productos). */
interface MovementProduct {
  id: string;
  code: string;
  name: string;
}

interface MovementsTableProps<T extends KardexMovement> {
  label: string;
  items: T[];
  /**
   * Si se da, la tabla muestra el código y el producto de cada línea (vista
   * general); el código es un enlace al kardex de ese producto.
   */
  productOf?: (movement: T) => MovementProduct;
  /** Si se da, la tabla cierra con la fila «Totales» (entradas, salidas y el stock de hoy). */
  totals?: { amounts: KardexAmounts; stock: number };
}

/**
 * Tabla de movimientos del Kardex, la misma en la ficha de un producto y en la
 * vista general (HU-31, HU-38): fecha y hora, concepto breve, documento (solo
 * el número), entrada, salida y stock final.
 *
 * - Neutra como toda tabla del sistema: entrada y salida van en su columna
 *   (el color es solo para estados, docs/PANTALLAS.md).
 * - Si la línea entró en lotes (o un egreso salió de uno), junto al concepto
 *   va su botón «N lotes», que los muestra en una ventana sin partir la tabla.
 * - En la vista general suma el código (enlace al producto) y el nombre.
 */
export function MovementsTable<T extends KardexMovement>({
  label,
  items,
  productOf,
  totals,
}: MovementsTableProps<T>) {
  /** Línea cuyos lotes se están viendo. */
  const [showingLots, setShowingLots] = useState<KardexMovement | null>(null);

  return (
    <>
      <div className="table-wrapper">
        <table className="table" aria-label={label}>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              {productOf === undefined ? null : (
                <>
                  <th>Código</th>
                  <th>Producto</th>
                </>
              )}
              <th>Concepto</th>
              <th>Documento</th>
              <th className="table__number">Entrada</th>
              <th className="table__number">Salida</th>
              <th className="table__number">Stock final</th>
            </tr>
          </thead>
          <tbody>
            {items.map((movement) => {
              const product = productOf?.(movement);

              return (
                <tr key={movement.id}>
                  <td>{formatMovementDate(movement.createdAt)}</td>
                  {product === undefined ? null : (
                    <>
                      <td>
                        <Link
                          to={`/movimientos?productId=${encodeURIComponent(product.id)}`}
                          aria-label={`Ver movimientos de ${product.code} ${product.name}`}
                        >
                          {product.code}
                        </Link>
                      </td>
                      <td>{product.name}</td>
                    </>
                  )}
                  <td>
                    {movement.concept}
                    {movement.lots.length === 0 ? null : (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="badge badge--button"
                          onClick={() => setShowingLots(movement)}
                        >
                          {movement.lots.length === 1 ? '1 lote' : `${movement.lots.length} lotes`}
                        </button>
                      </>
                    )}
                  </td>
                  <td>{movement.document ?? '—'}</td>
                  <td className="table__number">{formatQuantity(movement.entry)}</td>
                  <td className="table__number">{formatQuantity(movement.exit)}</td>
                  <td className="table__number">{movement.stockAfter.toLocaleString('es-CR')}</td>
                </tr>
              );
            })}
          </tbody>
          {totals === undefined ? null : (
            <tfoot>
              <tr>
                <td colSpan={3}>Totales</td>
                <td className="table__number">{totals.amounts.entries.toLocaleString('es-CR')}</td>
                <td className="table__number">{totals.amounts.exits.toLocaleString('es-CR')}</td>
                <td className="table__number">{totals.stock.toLocaleString('es-CR')}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showingLots === null ? null : (
        <MovementLotsModal movement={showingLots} onClose={() => setShowingLots(null)} />
      )}
    </>
  );
}
