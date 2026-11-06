import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { CountsReportService } from '../services/counts-report.service.js';
import type { ReportsService } from '../services/reports.service.js';
import type { ReportKind, ReportResult, ReportSummary } from '../types/reports.js';
import type { ForBusiness } from '../types/tenant.js';
import { XLSX_CONTENT_TYPE } from '../utils/catalog-xlsx.js';
import { HttpError } from '../utils/http-error.js';
import { allOf, pageOf } from '../utils/paginate.js';
import { chartsFor } from '../utils/report-charts.js';
import { buildReportWorkbook } from '../utils/reports-xlsx.js';
import {
  debtsReportQuerySchema,
  DEFAULT_ROWS_PAGE_SIZE,
  exportColumnsSchema,
  periodReportQuerySchema,
  reportKindSchema,
  rowsPageQuerySchema,
  salesReportQuerySchema,
} from '../validators/reports.validator.js';

/**
 * Reportes comerciales (HU-28, HU-29, HU-30). El negocio sale SIEMPRE de la
 * sesión (`businessIdOf`); ningún dato del cliente puede cambiarlo.
 *
 *   GET /options        categorías para el filtro de ventas
 *   GET /:kind          el resumen del reporte (sales | profits | top-products |
 *                       customer-debts): totales, avisos y gráficos, SIN filas
 *   GET /:kind/rows     una página del detalle (`?page=&pageSize=`), o todo
 *                       con `?all=true` (solo para el PDF)
 *   GET /:kind/export   el MISMO reporte, como Excel; `?columns=` exporta solo
 *                       las columnas que el usuario dejó activas (HU-40)
 *
 * Por qué el resumen no lleva filas: un año de ventas son decenas de miles de
 * líneas. Mandarlas todas para mostrar un total y dos gráficos hacía lenta la
 * pantalla aunque nadie abriera el detalle. Ahora viajan solo cuando se piden,
 * y de a una página.
 *
 * `ReportEndpoints` tiene las tres respuestas comunes; cada controlador solo
 * dice cómo se genera su reporte.
 */
export abstract class ReportEndpoints {
  /** Valida los filtros propios del reporte y lo genera, para el negocio de la sesión. */
  protected abstract generate(
    rawKind: unknown,
    query: Request['query'],
    res: Response,
  ): Promise<ReportResult>;

  async get(req: Request, res: Response): Promise<void> {
    const report = await this.generate(req.params['kind'], req.query, res);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: summaryOf(report) });
  }

  async rows(req: Request, res: Response): Promise<void> {
    // La página no es un filtro del reporte: se separa antes de validar los filtros.
    const { page: rawPage, pageSize: rawPageSize, all: rawAll, ...filters } = req.query;
    const paging = rowsPageQuerySchema.parse(
      Object.fromEntries(
        Object.entries({ page: rawPage, pageSize: rawPageSize, all: rawAll }).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    );
    const report = await this.generate(req.params['kind'], filters, res);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      data:
        paging.all === undefined
          ? pageOf(report.rows, paging.page ?? 1, paging.pageSize ?? DEFAULT_ROWS_PAGE_SIZE)
          : allOf(report.rows),
    });
  }

  async export(req: Request, res: Response): Promise<void> {
    // `columns` no es un filtro del reporte: se separa antes de validar los filtros.
    const { columns: rawColumns, ...filters } = req.query;
    const columns = exportColumnsSchema.parse(rawColumns);
    const report = await this.generate(req.params['kind'], filters, res);
    const content = await buildReportWorkbook(onlyColumns(report, columns));

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${report.kind}.xlsx"`);
    res.send(content);
  }
}

/** Los cuatro reportes comerciales, con `/:kind` en la ruta. */
export class ReportsController extends ReportEndpoints {
  constructor(private readonly serviceFor: ForBusiness<ReportsService>) {
    super();
  }

  async options(_req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await this.serviceFor(businessIdOf(res)).options() });
  }

  /** Valida los filtros propios de cada reporte y lo genera. */
  protected async generate(
    rawKind: unknown,
    query: Request['query'],
    res: Response,
  ): Promise<ReportResult> {
    const kind: ReportKind = reportKindSchema.parse(rawKind);
    const service = this.serviceFor(businessIdOf(res));

    switch (kind) {
      case 'sales':
        return service.sales(salesReportQuerySchema.parse(query));
      case 'profits':
        return service.profits(periodReportQuerySchema.parse(query));
      case 'top-products':
        return service.topProducts(periodReportQuerySchema.parse(query));
      case 'customer-debts':
        debtsReportQuerySchema.parse(query);

        return service.customerDebts();
    }
  }
}

/**
 * Reporte de conteos físicos (HU-10): un solo reporte, sin `/:kind`. Mismas
 * respuestas que los comerciales (resumen, filas, Excel) para que la pantalla
 * los muestre igual.
 */
export class CountsReportController extends ReportEndpoints {
  constructor(private readonly serviceFor: ForBusiness<CountsReportService>) {
    super();
  }

  protected generate(_kind: unknown, query: Request['query'], res: Response) {
    return this.serviceFor(businessIdOf(res)).report(periodReportQuerySchema.parse(query));
  }
}

/**
 * El reporte con solo las columnas elegidas, en el orden del reporte. Una
 * columna que no existe en ESTE reporte se rechaza: exportar algo distinto de
 * lo que se ve sería peor que avisar.
 */
function onlyColumns(report: ReportResult, keys: string[] | undefined): ReportResult {
  if (keys === undefined) {
    return report;
  }

  const known = new Set(report.columns.map((column) => column.key));
  const unknown = keys.filter((key) => !known.has(key));

  if (unknown.length > 0) {
    throw HttpError.badRequest(`Columnas que no existen en este reporte: ${unknown.join(', ')}.`);
  }

  const wanted = new Set(keys);

  return { ...report, columns: report.columns.filter((column) => wanted.has(column.key)) };
}

/** El reporte para la pantalla: todo menos las filas, más su cantidad y los gráficos. */
function summaryOf(report: ReportResult): ReportSummary {
  const { rows, ...rest } = report;

  return { ...rest, rowCount: rows.length, charts: chartsFor(report.kind, rows) };
}
