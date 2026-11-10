import { PendingWork } from '../components/PendingWork';
import { CustomersSection } from '../features/customers/CustomersSection';
import { PageHeader } from '../components/PageHeader';

/**
 * Clientes, cuentas fiadas y abonos (HU-18, HU-19). HU-30 (reporte de deudas) vive
 * en Reportes. Editar y desactivar clientes sigue pendiente.
 */
export function CustomersPage() {
  return (
    <>
      <PageHeader icon="users" title="Clientes">
        Contactos del negocio, control de las deudas por venta a crédito (fiado) y registro de
        abonos.
      </PageHeader>

      <CustomersSection />

      <PendingWork stories="HU-19" tasks={['Editar y desactivar clientes (HU-19).']} />
    </>
  );
}
