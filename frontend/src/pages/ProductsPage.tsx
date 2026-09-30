import { PagePlaceholder } from '../components/PagePlaceholder';

/** Catálogo de productos y categorías (HU-01 … HU-05). */
export function ProductsPage() {
  return (
    <PagePlaceholder
      title="Productos"
      summary="Mantener el catálogo: crear, listar, actualizar, desactivar y agrupar por categoría."
      stories="HU-01, HU-02, HU-03, HU-04, HU-05"
      tasks={[
        'Tabla con búsqueda por nombre parcial o código exacto (HU-05).',
        'Formulario de creación con código, nombre, categoría, precio, costo, stock inicial y proveedor (HU-01).',
        'Validación de los campos numéricos antes de guardar (HU-01, HU-02).',
        'Edición de todos los campos del producto, incluido el precio (HU-02).',
        'Confirmación y desactivación sin perder el historial de ventas (HU-03).',
        'Crear y asignar categorías; filtrar el inventario por categoría (HU-04).',
      ]}
    />
  );
}
