import { useState } from 'react';
import { Modal } from '../components/Modal';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { PhysicalCountSection } from '../features/inventory/PhysicalCountSection';
import { ProductsSection } from '../features/products/ProductsSection';

/**
 * Ventana de inventario (HU-01 … HU-10): la lista general de productos con
 * búsqueda y filtro; en ventanas modales, crear y modificar productos (con su
 * mínimo, HU-08, y su vencimiento, HU-09), el conteo físico (HU-10) y el
 * reporte imprimible. Las cantidades del día a día no se cambian aquí: entran
 * por pedidos y ventas, y se consultan en el Kardex.
 */
export function InventoryPage() {
  const [countOpen, setCountOpen] = useState(false);
  /** Un conteo cambia el stock: al confirmarlo, la lista se vuelve a cargar. */
  const [productsVersion, setProductsVersion] = useState(0);

  return (
    <PagePlaceholder
      title="Inventario"
      summary="Lista general de productos: buscar, crear, modificar y desactivar. Las cantidades se consultan en el Kardex."
      stories="HU-06, HU-07"
      tasks={[
        'Reconocer el código leído por el lector y cargar el producto, o avisar si no está registrado (HU-06).',
        'Generar un código único para los productos que no tienen, imprimible o exportable (HU-07).',
      ]}
    >
      {/* HU-01 … HU-05: lista de productos; crear, modificar y desactivar en modales. */}
      <ProductsSection
        refreshKey={productsVersion}
        tools={
          <button type="button" className="button button--tool" onClick={() => setCountOpen(true)}>
            Conteo físico
          </button>
        }
      />

      {/* HU-10: conteo de inventario físico. */}
      {countOpen ? (
        <Modal title="Conteo físico" size="wide" onClose={() => setCountOpen(false)}>
          <PhysicalCountSection
            onCountRegistered={() => setProductsVersion((version) => version + 1)}
          />
        </Modal>
      ) : null}
    </PagePlaceholder>
  );
}
