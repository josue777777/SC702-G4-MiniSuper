import { PagePlaceholder } from '../components/PagePlaceholder';

/**
 * Kardex: ficha de un producto con sus entradas y salidas (HU-31).
 *
 * Aquí no se cambian cantidades: se consultan los movimientos que ya dejaron
 * las ventas, las recepciones de pedidos y los conteos físicos en la tabla
 * `InventoryMovement`, que guarda el stock antes y después de cada uno (saldo).
 */
export function KardexPage() {
  return (
    <PagePlaceholder
      title="Kardex"
      summary="Entradas y salidas de cada producto, con el saldo después de cada movimiento."
      stories="HU-31"
      tasks={[
        'Elegir un producto desde la búsqueda o el listado de productos (HU-31).',
        'Mostrar la ficha del producto: código, categoría, precio, costo y proveedor (HU-31).',
        'Listar sus movimientos del más reciente al más antiguo: fecha, concepto, entra, sale y saldo (HU-31).',
        'Si el producto no tiene movimientos, indicar que no hay historial disponible (HU-31).',
      ]}
    />
  );
}
