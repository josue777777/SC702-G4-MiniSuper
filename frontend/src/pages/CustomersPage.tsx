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

      <section className="card">
        <header className="card__header">
          <h2>Pendiente de implementar</h2>
        </header>
        <ul className="todo-list">
          <li>Editar y desactivar clientes.</li>
        </ul>
      </section>
    </>
  );
}
