import { useState } from 'react';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { PhysicalCountSection } from '../features/inventory/PhysicalCountSection';
import { ProductSettingsSection } from '../features/inventory/ProductSettingsSection';
import { ProductsSection } from '../features/products/ProductsSection';

/** Control de inventario (HU-01 … HU-10): catálogo de productos y control de stock. */
export function InventoryPage() {
  /**
   * Un cambio en productos o un conteo cambian los datos de las demás secciones:
   * estas versiones se incrementan para que se vuelvan a cargar con datos frescos.
   */
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [countVersion, setCountVersion] = useState(0);
  const [productsVersion, setProductsVersion] = useState(0);

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
      summary="Stock actual, lectura de código de barras, mínimos, fechas de vencimiento y movimientos."
      stories="HU-06, HU-07"
      tasks={[
        'Reconocer el código leído por el lector y cargar el producto, o avisar si no está registrado (HU-06).',
        'Generar un código único para los productos que no tienen, imprimible o exportable (HU-07).',
      ]}
    >
      {/* HU-01 … HU-05: catálogo de productos (antes en su propia pantalla). */}
      <ProductsSection onProductsChanged={handleProductsChanged} refreshKey={productsVersion} />

      {/* HU-10: conteo de inventario físico. */}
      <PhysicalCountSection
        key={`count-${countVersion}`}
        onCountRegistered={handleCountRegistered}
      />

      {/* HU-08 y HU-09: stock mínimo y fecha de vencimiento. */}
      <ProductSettingsSection key={`settings-${settingsVersion}`} />
    </PagePlaceholder>
  );
}
