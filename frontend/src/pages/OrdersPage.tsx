import { PagePlaceholder } from '../components/PagePlaceholder';

/** Pedidos a proveedores: sugerencia, historial y PDF (HU-22 … HU-24). */
export function OrdersPage() {
  return (
    <PagePlaceholder
      title="Pedidos a proveedores"
      summary="Reponer mercancía con una lista sugerida y llevar el control de las compras."
      stories="HU-22, HU-23, HU-24"
      tasks={[
        'Mostrar los productos con stock por debajo del mínimo y su proveedor sugerido (HU-23).',
        'Permitir ajustar la cantidad sugerida antes de confirmar el pedido (HU-23).',
        'Listar los pedidos con fecha, productos, costo y proveedor, filtrables por proveedor (HU-22).',
        'Abrir el detalle de un pedido y marcarlo como recibido, actualizando el stock (HU-22).',
        'Generar y descargar el pedido en PDF para enviarlo o imprimirlo (HU-24).',
      ]}
    />
  );
}
