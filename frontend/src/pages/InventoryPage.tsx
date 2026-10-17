import { useState } from 'react';
import { Modal } from '../components/Modal';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { PhysicalCountSection } from '../features/inventory/PhysicalCountSection';
import { ProductSettingsSection } from '../features/inventory/ProductSettingsSection';
import { ProductsSection } from '../features/products/ProductsSection';

/** Herramientas de la ventana de inventario que se abren en una ventana modal. */
type Tool = 'count' | 'settings';

/**
 * Ventana de inventario (HU-01 … HU-10): la lista general de productos con
 * búsqueda y filtro, y en ventanas modales crear, modificar y desactivar
 * productos, el conteo físico (HU-10) y los mínimos y vencimientos (HU-08,
 * HU-09). Las cantidades del día a día no se cambian aquí: entran por pedidos y
 * ventas, y se consultan en el Kardex.
 */
export function InventoryPage() {
  /**
   * Un cambio en productos o un conteo cambian los datos de las demás secciones:
   * estas versiones se incrementan para que se vuelvan a cargar con datos frescos.
   */
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [countVersion, setCountVersion] = useState(0);
  const [productsVersion, setProductsVersion] = useState(0);
  const [tool, setTool] = useState<Tool | null>(null);

  function handleProductsChanged(): void {
    setCountVersion((version) => version + 1);
    setSettingsVersion((version) => version + 1);
  }

  function handleCountRegistered(): void {
    setSettingsVersion((version) => version + 1);
    setProductsVersion((version) => version + 1);
  }

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
        onProductsChanged={handleProductsChanged}
        refreshKey={productsVersion}
        tools={
          <>
            <button type="button" className="button button--tool" onClick={() => setTool('count')}>
              Conteo físico
            </button>
            <button
              type="button"
              className="button button--tool"
              onClick={() => setTool('settings')}
            >
              Mínimos y vencimientos
            </button>
          </>
        }
      />

      {/* HU-10: conteo de inventario físico. */}
      {tool === 'count' ? (
        <Modal title="Conteo físico" size="wide" onClose={() => setTool(null)}>
          <PhysicalCountSection
            key={`count-${countVersion}`}
            onCountRegistered={handleCountRegistered}
          />
        </Modal>
      ) : null}

      {/* HU-08 y HU-09: stock mínimo y fecha de vencimiento. */}
      {tool === 'settings' ? (
        <Modal title="Mínimos y vencimientos" size="wide" onClose={() => setTool(null)}>
          <ProductSettingsSection key={`settings-${settingsVersion}`} />
        </Modal>
      ) : null}
    </PagePlaceholder>
  );
}
