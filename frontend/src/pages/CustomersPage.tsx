import { PendingWork } from '../components/PendingWork';
import { CustomersSection } from '../features/customers/CustomersSection';
import { PageHeader } from '../components/PageHeader';

/**
 * Clientes, cuentas fiadas y abonos (HU-18, HU-19). Registrar abonos y ver la
 * cuenta de un cliente ya funcionan (HU-19), así que no figuran como pendientes. Lo
 * que falta de esta pantalla es el historial de compras del cliente (HU-36); el
 * reporte de deudas (HU-30) vive en Reportes.
 */
export function CustomersPage() {
  return (
    <>
      <PageHeader icon="users" title="Clientes">
        Contactos del negocio, control de las deudas por venta a crédito (fiado) y registro de
        abonos.
      </PageHeader>

      <CustomersSection />

      <PendingWork
        stories="HU-36"
        tasks={[
          'Historial de compras de un cliente: contado y fiado por separado, de la más reciente a la más antigua (HU-36).',
        ]}
      />
    </>
  );
}
