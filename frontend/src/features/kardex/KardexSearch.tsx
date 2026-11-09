import { useState } from 'react';
import { ProductPickerModal } from './ProductPickerModal';

/**
 * Barra de búsqueda de Movimientos (HU-31): el botón «🔍 Buscar producto» abre
 * la ventana con todos los productos, paginados de 4 en 4, donde se busca por
 * código, nombre o código de barras y se filtra por categoría
 * (`ProductPickerModal`). Afuera no hay más filtros: todo está en la ventana.
 * Con un producto abierto, al lado va «Limpiar» (el mismo botón de
 * Inventario), que vuelve a la vista sin producto.
 */
export function KardexSearch({
  onPick,
  onClear,
}: {
  onPick: (productId: string) => void;
  /** Si se da (hay un producto abierto), junto a «Buscar producto» va «Limpiar». */
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="kardex-search" role="search" aria-label="Buscar producto">
      <button type="button" className="button button--primary" onClick={() => setOpen(true)}>
        🔍 Buscar producto
      </button>
      {onClear === undefined ? null : (
        <button type="button" className="button" onClick={onClear}>
          Limpiar
        </button>
      )}

      {open ? (
        <ProductPickerModal
          onPick={(productId) => {
            setOpen(false);
            onPick(productId);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
