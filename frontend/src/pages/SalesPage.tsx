import { PagePlaceholder } from '../components/PagePlaceholder';

/** Registro de ventas de caja (HU-16, HU-17, HU-20). */
export function SalesPage() {
  return (
    <PagePlaceholder
      title="Ventas"
      summary="Cobrar una venta escaneando productos, con método de pago e historial del día."
      stories="HU-16, HU-17, HU-20"
      tasks={[
        'Agregar productos escaneando el código con el lector (HU-16).',
        'Calcular el total automáticamente al confirmar la venta (HU-16).',
        'Descontar el stock al confirmar, rechazando cantidades mayores a las disponibles (HU-16).',
        'Elegir efectivo o tarjeta y dejar constancia en la venta (HU-17).',
        'Listar las ventas del día con hora, productos, método de pago y total acumulado (HU-20).',
        'Abrir el detalle completo de una venta del historial (HU-20).',
      ]}
    />
  );
}
