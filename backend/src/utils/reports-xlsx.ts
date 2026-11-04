import ExcelJS from 'exceljs';
import type { ReportResult } from '../types/reports.js';
import { sanitizeCell } from './catalog-xlsx.js';
import { formatBusinessDateTime } from './dates.js';

const MONEY_FORMAT = '#,##0.00';

/** Importe exacto (`"1500.00"`) como número; vacío si la celda no aplica. */
function moneyCell(value: string | number): number | string {
  return value === '' ? '' : Number(value);
}

/**
 * Libro de Excel de un reporte comercial. Se construye desde el MISMO
 * `ReportResult` que ve la pantalla (mismos filtros, filas y totales), así lo
 * exportado no puede diferir de lo mostrado. Hoja «Resumen»: filtros, totales y
 * avisos; hoja «Datos»: las filas. Los importes son numéricos con dos
 * decimales (`Decimal(12, 2)` cabe sin pérdida en un número de 64 bits) y todo
 * texto neutraliza fórmulas (`sanitizeCell`).
 */
export async function buildReportWorkbook(report: ReportResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Resumen');

  summary.columns = [{ width: 34 }, { width: 110 }];
  summary.addRow(['Reporte', report.title]);
  summary.addRow(['Negocio', sanitizeCell(report.businessName)]);
  summary.addRow(['Generado (Costa Rica)', formatBusinessDateTime(new Date(report.generatedAt))]);

  for (const filter of report.filters) {
    summary.addRow([filter.label, sanitizeCell(filter.value)]);
  }

  for (const total of report.totals) {
    const row = summary.addRow([
      total.label,
      total.money === true ? Number(total.value) : total.value,
    ]);

    if (total.money === true) {
      row.getCell(2).numFmt = MONEY_FORMAT;
    }
  }

  // Los avisos llevan nombres de productos escritos por el usuario: se sanean igual que los filtros.
  for (const warning of report.warnings) {
    summary.addRow(['Aviso', sanitizeCell(warning)]);
  }

  for (const notice of report.notices) {
    summary.addRow(['Nota', notice]);
  }

  if (report.rows.length === 0) {
    summary.addRow(['Resultado', report.emptyMessage]);
  }

  const sheet = workbook.addWorksheet('Datos');

  sheet.columns = report.columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: column.money === true ? 20 : 30,
    ...(column.money === true ? { style: { numFmt: MONEY_FORMAT } } : {}),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of report.rows) {
    sheet.addRow(
      Object.fromEntries(
        report.columns.map((column) => {
          const value = row[column.key] ?? '';

          if (column.money === true) {
            return [column.key, moneyCell(value)];
          }

          return [column.key, typeof value === 'string' ? sanitizeCell(value) : value];
        }),
      ),
    );
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
