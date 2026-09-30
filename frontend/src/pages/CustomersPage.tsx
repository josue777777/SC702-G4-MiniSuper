import { PagePlaceholder } from '../components/PagePlaceholder';

/** Clientes, cuentas fiadas y abonos (HU-18, HU-19, HU-30). */
export function CustomersPage() {
  return (
    <PagePlaceholder
      title="Clientes"
      summary="Contactos del negocio y control de las deudas por venta a crédito (fiado)."
      stories="HU-18, HU-19, HU-30"
      tasks={[
        'Alta y edición del cliente que recibe una venta a crédito (HU-18).',
        'Ver la deuda actual del cliente: ventas a crédito acumuladas menos abonos (HU-19).',
        'Registrar el pago de un fiado con monto y fecha (HU-19).',
        'Marcar la cuenta como saldada cuando el abono cubre la deuda (HU-19).',
        'Listado de cuentas fiadas con cliente, monto adeudado y fecha del fiado (HU-30).',
      ]}
    />
  );
}
