import { CustomersSection } from '../features/customers/CustomersSection';

/**
 * Clientes, cuentas fiadas y abonos (HU-18, HU-19). HU-30 (reporte de deudas) vive
 * en Reportes. Editar y desactivar clientes sigue pendiente.
 */
export function CustomersPage() {
  return (
    <>
      <header className="page-header">
        <h1>Clientes</h1>
        <p>
          Contactos del negocio, control de las deudas por venta a crédito (fiado) y registro de
          abonos.
        </p>
      </header>

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
