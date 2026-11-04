import { Router, type Request, type Response } from 'express';
import { businessIdOf } from '../middleware/require-auth.middleware.js';
import { InventoryRepository } from '../repositories/inventory.repository.js';
import { ProductsRepository } from '../repositories/products.repository.js';
import {
  InventoryReportService,
  sectionRows,
  summarizeInventory,
} from '../services/inventory-report.service.js';
import { InventoryService } from '../services/inventory.service.js';
import type { ForBusiness } from '../types/tenant.js';
import { XLSX_CONTENT_TYPE } from '../utils/catalog-xlsx.js';
import { buildInventoryReportWorkbook } from '../utils/inventory-report-xlsx.js';
import { allOf, pageOf } from '../utils/paginate.js';
import {
  inventoryReportQuerySchema,
  inventoryRowsSectionSchema,
} from '../validators/inventory-report.validator.js';
import { DEFAULT_ROWS_PAGE_SIZE, rowsPageQuerySchema } from '../validators/reports.validator.js';

/**
 * Reporte de inventario (HU-25 / HU-40). El negocio sale SIEMPRE de la sesión.
 *
 *   GET /         el resumen: totales, gráficos y cuántas filas tiene cada
 *                 sección, SIN las filas
 *   GET /rows     una página de una sección (`?section=products&page=2`), o
 *                 todas sus filas con `?all=true` (solo para el PDF)
 *   GET /export   el reporte como Excel, con los filtros, columnas y secciones
 *                 elegidos en pantalla
 *
 * Mismo patrón que los reportes comerciales: la pantalla nunca recibe más que
 * el resumen y la página que se está mirando.
 */
export function createInventoryReportRouter(
  productsFor: ForBusiness<ProductsRepository>,
  inventoryFor: ForBusiness<InventoryRepository>,
  today?: () => string,
): Router {
  const router = Router();
  const serviceFor = (res: Response) => {
    const businessId = businessIdOf(res);

    return new InventoryReportService(
      productsFor(businessId),
      new InventoryService(inventoryFor(businessId), today),
    );
  };

  router.get('/', async (req: Request, res: Response) => {
    const query = inventoryReportQuerySchema.parse(req.query);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: summarizeInventory(await serviceFor(res).build(query)) });
  });

  router.get('/rows', async (req: Request, res: Response) => {
    // La sección y la página no son filtros del reporte: se separan antes de validar.
    const { section: rawSection, page, pageSize, all, ...filters } = req.query;
    const section = inventoryRowsSectionSchema.parse(rawSection);
    const paging = rowsPageQuerySchema.parse(
      Object.fromEntries(
        Object.entries({ page, pageSize, all }).filter(([, value]) => value !== undefined),
      ),
    );
    // Solo se arma la sección pedida, aunque los filtros nombren otras.
    const query = { ...inventoryReportQuerySchema.parse(filters), sections: [section] };
    const rows = sectionRows(await serviceFor(res).build(query), section);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      data:
        paging.all === undefined
          ? pageOf(rows, paging.page ?? 1, paging.pageSize ?? DEFAULT_ROWS_PAGE_SIZE)
          : allOf(rows),
    });
  });

  router.get('/export', async (req: Request, res: Response) => {
    const query = inventoryReportQuerySchema.parse(req.query);
    const content = await buildInventoryReportWorkbook(await serviceFor(res).build(query));

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
