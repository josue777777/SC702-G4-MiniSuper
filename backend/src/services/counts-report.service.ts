import type { BusinessRepository } from '../repositories/business.repository.js';
import type { InventoryRepository } from '../repositories/inventory.repository.js';
import type { ReportResult } from '../types/reports.js';
import { businessDayRange, formatBusinessDateTime } from '../utils/dates.js';
import { formatCents, toCents } from '../utils/money.js';
import { PHYSICAL_COUNT_REASON } from './inventory.service.js';

/** Período del reporte (días `AAAA-MM-DD` del negocio, ambos incluidos). */
export interface CountsReportFilter {
  from: string;
  to: string;
}

/**
 * Reporte «Conteos» (HU-10): los conteos físicos de un período y lo que dejaron
 * de diferencia. Vive en Reportes (y no plegado dentro de la ventana de conteo)
 * porque es para revisar con calma: faltantes, sobrantes y su valor.
 *
 * Usa el mismo formato que los reportes comerciales (`ReportResult`), así la
 * pantalla, el gráfico, el PDF y el Excel son los mismos.
 */
export class CountsReportService {
  constructor(
    private readonly inventory: Pick<InventoryRepository, 'countsInPeriod'>,
    private readonly business: Pick<BusinessRepository, 'get'>,
  ) {}

  /**
   * @param filter Período.
   * @returns El reporte con una fila por conteo y los totales del período.
   * @example
   * // Arroz: el sistema decía 20, se contaron 18, costo ₡980:
   * //   diferencia −2 · faltante 2 · valor −₡1 960,00
   */
  async report(filter: CountsReportFilter): Promise<ReportResult> {
    const { start, end } = businessDayRange(filter.from, filter.to);
    const [counts, business] = await Promise.all([
      this.inventory.countsInPeriod(PHYSICAL_COUNT_REASON, start, end),
      this.business.get(),
    ]);
    const products = new Set<string>();
    let missing = 0;
    let surplus = 0;
    let valueCents = 0n;
    const rows = counts.map((count) => {
      const difference = count.countedQuantity - count.systemStock;
      const value = toCents(count.cost) * BigInt(difference);

      products.add(count.code);
      missing += difference < 0 ? -difference : 0;
      surplus += difference > 0 ? difference : 0;
      valueCents += value;

      return {
        date: formatBusinessDateTime(count.createdAt),
        code: count.code,
        product: count.name,
        category: count.category,
        system: count.systemStock,
        counted: count.countedQuantity,
        difference,
        missing: difference < 0 ? -difference : 0,
        value: formatCents(value),
      };
    });

    return {
      kind: 'physical-counts',
      title: 'Reporte de conteos físicos',
      businessName: business.name,
      generatedAt: new Date().toISOString(),
      filters: [
        { label: 'Desde', value: filter.from },
        { label: 'Hasta', value: filter.to },
      ],
      help: [
        'Cada fila es un conteo físico: lo que decía el sistema, lo que se contó y la diferencia.',
        'Diferencia negativa: faltaba mercadería (merma). Positiva: sobraba.',
        'El valor es la diferencia por el costo del producto.',
      ],
      warnings: [],
      notices: [
        'El valor usa el costo ACTUAL de cada producto: el sistema no guarda el costo del día del conteo.',
        'Las fechas son días de Costa Rica y ambos extremos están incluidos.',
      ],
      columns: [
        { key: 'date', label: 'Fecha y hora' },
        { key: 'code', label: 'Código' },
        { key: 'product', label: 'Producto' },
        { key: 'category', label: 'Categoría' },
        { key: 'system', label: 'Sistema' },
        { key: 'counted', label: 'Contado' },
        { key: 'difference', label: 'Diferencia' },
        { key: 'value', label: 'Valor', money: true },
      ],
      rows,
      totals: [
        {
          label: 'Valor de la diferencia',
          value: formatCents(valueCents),
          money: true,
          primary: true,
        },
        { label: 'Conteos', value: rows.length },
        { label: 'Productos contados', value: products.size },
        { label: 'Unidades faltantes', value: missing },
        { label: 'Unidades sobrantes', value: surplus },
      ],
      emptyMessage: 'No hubo conteos físicos en el período.',
    };
  }
}
