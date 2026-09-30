import { PagePlaceholder } from '../components/PagePlaceholder';

/** Alta de proveedores y catálogo de lo que suministra cada uno (HU-21). */
export function SuppliersPage() {
  return (
    <PagePlaceholder
      title="Proveedores"
      summary="Saber a quién pedirle cada producto y a qué costo se le compra."
      stories="HU-21"
      tasks={[
        'Registrar un proveedor con sus datos de contacto (HU-21).',
        'Asociar al proveedor los productos que suministra (HU-21).',
        'Guardar el costo unitario al que se le compra cada producto (HU-21, HU-22).',
        'Editar la información de un proveedor existente (HU-21).',
      ]}
    />
  );
}
