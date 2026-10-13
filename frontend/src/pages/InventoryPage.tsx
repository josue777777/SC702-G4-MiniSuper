import { useState } from 'react';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { PhysicalCountSection } from '../features/inventory/PhysicalCountSection';
import { ProductSettingsSection } from '../features/inventory/ProductSettingsSection';

/** Control de inventario (HU-06 … HU-10). */
export function InventoryPage() {
  /**
   * Un conteo cambia el stock que muestra la sección de mínimos: al confirmar
   * uno se cambia esta `key` y la sección se vuelve a cargar con datos frescos.
   */
  const [settingsVersion, setSettingsVersion] = useState(0);

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
      {/* HU-10: conteo de inventario físico. */}
      <PhysicalCountSection
        onCountRegistered={() => setSettingsVersion((version) => version + 1)}
      />

      {/* HU-08 y HU-09: stock mínimo y fecha de vencimiento. */}
      <ProductSettingsSection key={settingsVersion} />
    </PagePlaceholder>
  );
}
