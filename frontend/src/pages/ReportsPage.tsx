import { PagePlaceholder } from '../components/PagePlaceholder';

/** Reportes exportables del negocio (HU-25 … HU-30). */
export function ReportsPage() {
  return (
    <PagePlaceholder
      title="Reportes"
      summary="Consultas filtrables y exportables sobre inventario, ventas, ganancias y deudas."
      stories="HU-25, HU-26, HU-27, HU-28, HU-29, HU-30"
      tasks={[
        'Stock actual por producto, filtrable por categoría (HU-25).',
        'Productos con stock bajo, con la cantidad actual y la mínima (HU-26).',
        'Vencidos y próximos a vencer, distinguiendo unos de otros (HU-27).',
        'Ventas por rango de fechas, categoría o precio, con totales y número de transacciones (HU-28).',
        'Ganancias: diferencia entre precio de venta y costo de cada producto vendido (HU-29).',
        'Productos más vendidos y deudas pendientes de clientes (HU-30).',
        'Exportación o impresión de cada reporte (HU-25 … HU-30).',
      ]}
    />
  );
}
