import type { Request, Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import type { ReportsService } from '../services/reports.service.js';
import type { ReportKind, ReportResult } from '../types/reports.js';
import type { ForBusiness } from '../types/tenant.js';
import { XLSX_CONTENT_TYPE } from '../utils/catalog-xlsx.js';
import { buildReportWorkbook } from '../utils/reports-xlsx.js';
import {
  debtsReportQuerySchema,
  periodReportQuerySchema,
  reportKindSchema,
  salesReportQuerySchema,
} from '../validators/reports.validator.js';

/**
 * Reportes comerciales (HU-28, HU-29, HU-30). El negocio sale SIEMPRE de la
 * sesión (`businessIdOf`); ningún dato del cliente puede cambiarlo.
 *
 *   GET /options        categorías para el filtro de ventas
 *   GET /:kind          el reporte (sales | profits | top-products | customer-debts)
 *   GET /:kind/export   el MISMO reporte, como Excel
 */
export class ReportsController {
  constructor(private readonly serviceFor: ForBusiness<ReportsService>) {}

  async options(_req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await this.serviceFor(businessIdOf(res)).options() });
  }

  async get(req: Request, res: Response): Promise<void> {
    const report = await this.generate(req, res);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: report });
  }

  async export(req: Request, res: Response): Promise<void> {
    const report = await this.generate(req, res);
    const content = await buildReportWorkbook(report);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${report.kind}.xlsx"`);
    res.send(content);
  }

  /** Valida los filtros propios de cada reporte y lo genera. */
  private async generate(req: Request, res: Response): Promise<ReportResult> {
    const kind: ReportKind = reportKindSchema.parse(req.params['kind']);
    const service = this.serviceFor(businessIdOf(res));

    switch (kind) {
      case 'sales':
        return service.sales(salesReportQuerySchema.parse(req.query));
      case 'profits':
        return service.profits(periodReportQuerySchema.parse(req.query));
      case 'top-products':
        return service.topProducts(periodReportQuerySchema.parse(req.query));
      case 'customer-debts':
        debtsReportQuerySchema.parse(req.query);

        return service.customerDebts();
    }
  }
}
