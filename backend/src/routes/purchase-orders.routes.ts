import { Router } from 'express';
import { PurchaseOrdersController } from '../controllers/purchase-orders.controller.js';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository.js';
import { PurchaseOrdersService } from '../services/purchase-orders.service.js';
import type { ForBusiness } from '../types/tenant.js';
import { imageBodyParser } from '../utils/image.js';
import { MAX_INVOICE_FILE_BYTES } from '../utils/invoice-file.js';

/** Cuerpo de la factura como bytes, con tope de 5 MB (413 si se pasa). */
const invoiceBody = imageBodyParser(MAX_INVOICE_FILE_BYTES, 'La factura supera el máximo de 5 MB.');

/** Fábrica de rutas de pedidos: permite montarlas con un repositorio falso. */
export function createPurchaseOrdersRouter(
  repositoryFor: ForBusiness<PurchaseOrdersRepository>,
): Router {
  const controller = new PurchaseOrdersController(
    (businessId) => new PurchaseOrdersService(repositoryFor(businessId)),
  );
  const router = Router();

  /** Historial de pedidos, filtrable por proveedor (HU-22). */
  router.get('/', (req, res) => controller.list(req, res));
  /** Detalle de un pedido (HU-22) y datos del PDF (HU-24). */
  router.get('/:id', (req, res) => controller.getById(req, res));
  /** Registrar pedido (HU-24). */
  router.post('/', (req, res) => controller.create(req, res));
  /** Registrar una entrega con su factura (HU-38). */
  router.post('/:id/receipts', (req, res) => controller.receive(req, res));
  /** Cargar al inventario una entrega pendiente (HU-38). */
  router.post('/:id/receipts/:receiptId/load', (req, res) => controller.loadReceipt(req, res));
  /** Factura del proveedor de una entrega: adjuntar o reemplazar, y ver (HU-38). */
  router.put('/:id/receipts/:receiptId/invoice', invoiceBody, (req, res) =>
    controller.attachInvoice(req, res),
  );
  router.get('/:id/receipts/:receiptId/invoice', (req, res) => controller.getInvoice(req, res));
  /** Dar por concluido un pedido que llegó en parte (HU-38). */
  router.post('/:id/close', (req, res) => controller.close(req, res));

  return router;
}

export const purchaseOrdersRouter = createPurchaseOrdersRouter(
  (businessId) => new PurchaseOrdersRepository(businessId),
);
