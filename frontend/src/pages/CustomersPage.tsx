import { CustomersSection } from '../features/customers/CustomersSection';
import { PageHeader } from '../components/PageHeader';

/**
 * Página de clientes, cuentas fiadas, abonos e historial de compras (HU-18,
 * HU-19 y HU-36). El reporte de deudas (HU-30) vive en Reportes.
 */
export function CustomersPage() {
  return (
    <>
      <PageHeader icon="users" title="Clientes">
        Contactos del negocio, control de las deudas por venta a crédito (fiado) y registro de
        abonos.
      </PageHeader>

      <CustomersSection />
    </>
  );
}
