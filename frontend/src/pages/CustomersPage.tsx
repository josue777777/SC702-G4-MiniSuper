import { CustomersSection } from '../features/customers/CustomersSection';

/** Clientes, cuentas fiadas y abonos (HU-18, HU-19, HU-30). Aquí vive el mínimo que HU-18 necesita. */
export function CustomersPage() {
  return (
    <>
      <header className="page-header">
        <h1>Clientes</h1>
        <p>Contactos del negocio y control de las deudas por venta a crédito (fiado).</p>
      </header>

      <CustomersSection />

      <section className="card">
        <header className="card__header">
          <h2>Pendiente de implementar</h2>
        </header>
        <p className="muted">Historias de usuario: HU-19, HU-30</p>
        <ul className="todo-list">
          <li>Registrar el pago (abono) de un fiado con monto y fecha (HU-19).</li>
          <li>Marcar la cuenta como saldada cuando el abono cubre la deuda (HU-19).</li>
          <li>Editar y desactivar clientes (HU-19).</li>
          <li>Listado de cuentas fiadas con cliente, monto adeudado y fecha del fiado (HU-30).</li>
        </ul>
      </section>
    </>
  );
}
