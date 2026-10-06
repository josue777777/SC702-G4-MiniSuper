import { PagePlaceholder } from '../components/PagePlaceholder';
import { PhysicalCountSection } from '../features/inventory/PhysicalCountSection';

/** Control de inventario (HU-06 … HU-10). */
export function InventoryPage() {
  return (
    <PagePlaceholder
      title="Inventario"
      summary="Stock actual, lectura de código de barras, mínimos, fechas de vencimiento y movimientos."
      stories="HU-06, HU-07, HU-08, HU-09"
      tasks={[
        'Reconocer el código leído por el lector y cargar el producto, o avisar si no está registrado (HU-06).',
        'Generar un código único para los productos que no tienen, imprimible o exportable (HU-07).',
        'Definir la cantidad mínima por producto y mostrar la alerta correspondiente (HU-08).',
        'Registrar la fecha de vencimiento solo en los productos a los que aplica (HU-09).',
      ]}
    >
      {/* HU-10: conteo de inventario físico. */}
      <PhysicalCountSection />
    </PagePlaceholder>
  );
}
