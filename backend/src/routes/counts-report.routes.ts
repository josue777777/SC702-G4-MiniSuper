import { Router } from 'express';
import { CountsReportController } from '../controllers/reports.controller.js';
import { BusinessRepository } from '../repositories/business.repository.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { CountsReportService } from '../services/counts-report.service.js';
import type { ForBusiness } from '../types/tenant.js';

/**
 * Reporte de conteos físicos (HU-10). Se monta en `/api/reports/counts` con el
 * permiso `reports.inventory` (Encargado y Bodega; ver `routes/index.ts`):
 *
 *   GET /         resumen del período (`?from=&to=`): totales y gráficos, sin filas
 *   GET /rows     una página del detalle, o todo con `?all=true` (para el PDF)
 *   GET /export   el mismo reporte en Excel (`?columns=` para elegir columnas)
 */
export function createCountsReportRouter(
  inventoryFor: ForBusiness<Pick<InventoryRepository, 'countsInPeriod'>>,
  businessFor: ForBusiness<Pick<BusinessRepository, 'get'>>,
): Router {
  const router = Router();
  const controller = new CountsReportController(
    (businessId) => new CountsReportService(inventoryFor(businessId), businessFor(businessId)),
  );

  router.get('/rows', (req, res) => controller.rows(req, res));
  router.get('/export', (req, res) => controller.export(req, res));
  router.get('/', (req, res) => controller.get(req, res));

  return router;
}

export const countsReportRouter = createCountsReportRouter(
  (businessId) => new InventoryRepository(businessId),
  (businessId) => new BusinessRepository(businessId),
);
