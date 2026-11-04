import { Router } from 'express';
import { ReportsController } from '../controllers/reports.controller.js';
import { ReportsRepository } from '../repositories/reports.repository.js';
import { ReportsService } from '../services/reports.service.js';
import type { ForBusiness } from '../types/tenant.js';

/**
 * Reportes comerciales del negocio (HU-28, HU-29, HU-30). Se monta en
 * `/api/reports/commercial` con el permiso `reports.sales` (ver `routes/index.ts`):
 * los reportes de inventario (HU-25 … HU-27) usan otro permiso y otra ruta.
 */
export function createReportsRouter(repositoryFor: ForBusiness<ReportsRepository>) {
  const router = Router();
  const controller = new ReportsController(
    (businessId) => new ReportsService(repositoryFor(businessId)),
  );

  // `/options` va antes de `/:kind` para que no se tome como un tipo de reporte.
  router.get('/options', (req, res) => controller.options(req, res));
  router.get('/:kind/export', (req, res) => controller.export(req, res));
  router.get('/:kind', (req, res) => controller.get(req, res));

  return router;
}

export const reportsRouter = createReportsRouter((businessId) => new ReportsRepository(businessId));
