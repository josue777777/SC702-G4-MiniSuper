import ExcelJS from 'exceljs';
import type { InventoryReportData } from '../services/inventory-report.service.js';
import type { ProductDto } from '../types/products.js';
import type { InventoryReportColumn } from '../validators/inventory-report.validator.js';
import { formatBusinessDateTime } from './dates.js';
import { sanitizeCell } from './catalog-xlsx.js';
import { formatCents, toCents } from './money.js';

const MONEY_FORMAT = '#,##0.00';

const SORT_LABELS: Record<InventoryReportData['query']['sort'], string> = {
  category: 'Categoría y nombre',
  code: 'Código',
  name: 'Nombre',
  stockAsc: 'Stock (de menor a mayor)',
  valueDesc: 'Valor en inventario (de mayor a menor)',
};

const EXPIRATION_LABELS = {
  ALL: 'Vencidos y próximos a vencer',
  EXPIRED: 'Solo vencidos',
  EXPIRING_SOON: 'Solo próximos a vencer',
} as const;

/** Las mismas columnas que la pantalla (y en el mismo orden). */
const COLUMNS: Record<
  InventoryReportColumn,
  { label: string; money?: boolean; width: number; cell: (product: ProductDto) => string | number }
> = {
  code: { label: 'Código', width: 14, cell: (p) => sanitizeCell(p.code) },
  name: { label: 'Producto', width: 34, cell: (p) => sanitizeCell(p.name) },
  category: { label: 'Categoría', width: 20, cell: (p) => sanitizeCell(p.categoryName) },
  cost: { label: 'P. compra', width: 14, money: true, cell: (p) => Number(p.cost) },
  price: { label: 'P. venta', width: 14, money: true, cell: (p) => Number(p.price) },
  stock: { label: 'Stock', width: 10, cell: (p) => p.stock },
  value: {
    label: 'Valor en inventario',
    width: 18,
    money: true,
    cell: (p) => Number(formatCents(toCents(p.cost) * BigInt(p.stock))),
  },
  minStock: { label: 'Mínimo', width: 10, cell: (p) => p.minStock },
  expiration: { label: 'Vence', width: 14, cell: (p) => p.expirationDate ?? '' },
};
const ORDER = Object.keys(COLUMNS) as InventoryReportColumn[];

function totals(products: ProductDto[]): { units: number; value: number } {
  const cents = products.reduce((sum, p) => sum + toCents(p.cost) * BigInt(p.stock), 0n);

  return {
    units: products.reduce((sum, p) => sum + p.stock, 0),
    value: Number(formatCents(cents)),
  };
}

/**
 * Excel del reporte de inventario (HU-25 / HU-40): una hoja «Resumen» con los
 * filtros y totales, y una hoja por sección elegida (Productos, Vencimientos,
 * Stock bajo), con las columnas que el usuario dejó activas. Importes como
 * números; textos del usuario saneados contra fórmulas.
 */
export async function buildInventoryReportWorkbook(report: InventoryReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Resumen');
  const all = totals(report.products);

  summary.columns = [{ width: 30 }, { width: 50 }];
  summary.addRow(['Reporte', 'Reporte de inventario (productos activos)']);
  summary.addRow(['Generado (Costa Rica)', formatBusinessDateTime(new Date())]);
  summary.addRow(['Categoría', sanitizeCell(report.scope)]);
  summary.addRow(['Ordenar por', SORT_LABELS[report.query.sort]]);
  summary.addRow(['Productos activos', report.products.length]);
  summary.addRow(['Unidades en stock', all.units]);
  summary.addRow(['Valor al costo', all.value]).getCell(2).numFmt = MONEY_FORMAT;

  if (report.query.sections.includes('products')) {
    const sheet = workbook.addWorksheet('Productos');
    const columns = ORDER.filter((key) => report.columns.includes(key));

    sheet.columns = columns.map((key) => ({
      header: COLUMNS[key].label,
      key,
      width: COLUMNS[key].width,
      ...(COLUMNS[key].money === true ? { style: { numFmt: MONEY_FORMAT } } : {}),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const group of report.groups) {
      if (group.title !== null) {
        sheet.addRow([sanitizeCell(group.title)]).font = { bold: true };
      }

      for (const product of group.products) {
        sheet.addRow(Object.fromEntries(columns.map((key) => [key, COLUMNS[key].cell(product)])));
      }

      if (group.title !== null) {
        const sub = totals(group.products);

        sheet.addRow([
          `Subtotal ${sanitizeCell(group.title)}: ${group.products.length} producto(s) · ${sub.units} unidad(es) · valor al costo ${sub.value.toFixed(2)}`,
        ]).font = { italic: true };
      }
    }

    sheet.addRow([
      `Total: ${report.products.length} producto(s) · ${all.units} unidad(es) · valor al costo ${all.value.toFixed(2)}`,
    ]).font = { bold: true };
  }

  if (report.expirations !== null) {
    const sheet = workbook.addWorksheet('Vencimientos');

    sheet.columns = [
      { header: 'Código', key: 'code', width: 14 },
      { header: 'Producto', key: 'name', width: 34 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Lote', key: 'lot', width: 16 },
      { header: 'Unidades del lote', key: 'lotQuantity', width: 12 },
      { header: 'Vence', key: 'date', width: 14 },
      { header: 'Estado', key: 'status', width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    summary.addRow(['Vencimientos', EXPIRATION_LABELS[report.query.expirations]]);

    for (const alert of report.expirations) {
      sheet.addRow({
        code: sanitizeCell(alert.productCode),
        name: sanitizeCell(alert.productName),
        stock: alert.stock,
        lot: sanitizeCell(alert.lotNumber),
        lotQuantity: alert.lotQuantity,
        date: alert.expirationDate,
        status:
          alert.daysLeft < 0
            ? `Vencido hace ${-alert.daysLeft} día(s)`
            : alert.daysLeft === 0
              ? 'Vence hoy'
              : `Vence en ${alert.daysLeft} día(s)`,
      });
    }
  }

  if (report.lowStock !== null) {
    const sheet = workbook.addWorksheet('Stock bajo');

    sheet.columns = [
      { header: 'Código', key: 'code', width: 14 },
      { header: 'Producto', key: 'name', width: 34 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Mínimo', key: 'min', width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const alert of report.lowStock) {
      sheet.addRow({
        code: sanitizeCell(alert.productCode),
        name: sanitizeCell(alert.productName),
        stock: alert.stock,
        min: alert.minStock,
      });
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
