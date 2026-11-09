import { PendingWork } from '../components/PendingWork';
import { CustomersSection } from '../features/customers/CustomersSection';
import { PageHeader } from '../components/PageHeader';

/** Clientes, cuentas fiadas y abonos (HU-18, HU-19, HU-30). Aquí vive el mínimo que HU-18 necesita. */
export function CustomersPage() {
  return (
    <>
      <PageHeader icon="users" title="Clientes">
        Contactos del negocio y control de las deudas por venta a crédito (fiado).
      </PageHeader>

      <CustomersSection />

      <PendingWork
        stories="HU-19, HU-30"
        tasks={[
          'Registrar el pago (abono) de un fiado con monto y fecha (HU-19).',
          'Marcar la cuenta como saldada cuando el abono cubre la deuda (HU-19).',
          'Editar y desactivar clientes (HU-19).',
          'Listado de cuentas fiadas con cliente, monto adeudado y fecha del fiado (HU-30).',
        ]}
      />
    </>
  );
}
