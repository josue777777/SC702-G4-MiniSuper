import { Router, type Request, type Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { ProductsRepository } from '../repositories/products.repository.js';
import { InventoryReportService } from '../services/inventory-report.service.js';
import { InventoryService } from '../services/inventory.service.js';
import type { ForBusiness } from '../types/tenant.js';
import { XLSX_CONTENT_TYPE } from '../utils/catalog-xlsx.js';
import { buildInventoryReportWorkbook } from '../utils/inventory-report-xlsx.js';
import { inventoryReportQuerySchema } from '../validators/inventory-report.validator.js';

/**
 * Reporte de inventario (HU-25 / HU-40). El negocio sale SIEMPRE de la sesión.
 *
 *   GET /export   el reporte como Excel, con los filtros, columnas y secciones
 *                 elegidos en pantalla
 */
export function createInventoryReportRouter(
  productsFor: ForBusiness<ProductsRepository>,
  inventoryFor: ForBusiness<InventoryRepository>,
  today?: () => string,
): Router {
  const router = Router();

  router.get('/export', async (req: Request, res: Response) => {
    const query = inventoryReportQuerySchema.parse(req.query);
    const businessId = businessIdOf(res);
    const service = new InventoryReportService(
      productsFor(businessId),
      new InventoryService(inventoryFor(businessId), today),
    );
    const content = await buildInventoryReportWorkbook(await service.build(query));

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-inventario.xlsx"');
    res.send(content);
  });

  return router;
}

export const inventoryReportRouter = createInventoryReportRouter(
  (businessId) => new ProductsRepository(businessId),
  (businessId) => new InventoryRepository(businessId),
);
