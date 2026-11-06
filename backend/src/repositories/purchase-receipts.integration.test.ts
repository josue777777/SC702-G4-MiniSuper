import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { PurchaseOrdersService } from '../services/purchase-orders.service.js';
import { PurchaseOrdersRepository } from './purchase-orders.repository.js';

/**
 * Entregas con factura (HU-38) contra PostgreSQL real: lo recibido, el stock,
 * las entradas del Kardex con la factura en el motivo, la carga pendiente que
 * se confirma una sola vez (aunque dos personas la confirmen a la vez) y que
 * otro negocio no puede tocar el pedido.
 *
 * Borra datos: solo corre si DATABASE_URL apunta a una base `*_test`.
 */
const databaseName = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/none').pathname;

const A = '0b000000-0000-4000-8000-0000000000a1';
const B = '0b000000-0000-4000-8000-0000000000b2';
const TODAY = '2099-12-31';

describe.skipIf(!databaseName.endsWith('_test'))(
  'Entregas de pedidos (PostgreSQL de prueba)',
  () => {
    const service = new PurchaseOrdersService(new PurchaseOrdersRepository(A));
    const ids: Record<string, string> = {};

    async function stockOf(id: string | undefined): Promise<number> {
      return (await prisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true } }))
        .stock;
    }

    beforeAll(async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "PurchaseReceiptItem", "PurchaseReceipt", "PurchaseOrderItem", "PurchaseOrder", "InventoryMovement", "SupplierProduct", "Supplier", "Product", "Category", "DocumentSequence" CASCADE',
      );

      for (const [id, name] of [
        [A, 'Negocio A'],
        [B, 'Negocio B'],
      ] as const) {
        await prisma.business.upsert({ where: { id }, create: { id, name }, update: { name } });
      }

      const category = await prisma.category.create({ data: { businessId: A, name: 'Granos' } });
      const supplier = await prisma.supplier.create({
        data: { businessId: A, name: 'Distribuidora Central' },
      });
      const product = (code: string, name: string, stock: number) =>
        prisma.product.create({
          data: {
            businessId: A,
            code,
            name,
            price: 1500,
            cost: 1000,
            stock,
            categoryId: category.id,
          },
        });
      const rice = await product('ARR', 'Arroz 1 kg', 4);
      const beans = await product('FRI', 'Frijoles 1 kg', 0);

      await prisma.supplierProduct.createMany({
        data: [
          { supplierId: supplier.id, productId: rice.id, unitCost: 980 },
          { supplierId: supplier.id, productId: beans.id, unitCost: 1200 },
        ],
      });
      ids['supplier'] = supplier.id;
      ids['rice'] = rice.id;
      ids['beans'] = beans.id;
    });

    afterAll(async () => {
      await disconnectPrisma();
    });

    it('recibe en dos facturas: la primera se carga ya, la segunda queda pendiente', async () => {
      const order = await service.createOrder({
        supplierId: ids['supplier'] ?? '',
        notes: null,
        items: [
          { productId: ids['rice'] ?? '', quantity: 10 },
          { productId: ids['beans'] ?? '', quantity: 6 },
        ],
      });

      ids['order'] = order.id;

      const first = await service.receiveOrder(
        order.id,
        {
          invoiceNumber: 'F-100',
          receivedOn: '2099-01-10',
          loadNow: true,
          items: [
            { productId: ids['rice'] ?? '', quantity: 7 },
            { productId: ids['beans'] ?? '', quantity: 0 },
          ],
        },
        TODAY,
      );

      expect(first.status).toBe('PARTIAL');
      expect(await stockOf(ids['rice'])).toBe(11);

      const entry = await prisma.inventoryMovement.findFirstOrThrow({
        where: { productId: ids['rice'] },
      });

      expect(entry).toMatchObject({
        type: 'ENTRY',
        quantity: 7,
        stockBefore: 4,
        stockAfter: 11,
        reason: `Recepción PED-${String(order.number).padStart(4, '0')} · Factura F-100`,
        purchaseOrderId: order.id,
      });

      const second = await service.receiveOrder(
        order.id,
        {
          invoiceNumber: 'F-101',
          receivedOn: '2099-01-12',
          loadNow: false,
          items: [
            { productId: ids['rice'] ?? '', quantity: 3 },
            { productId: ids['beans'] ?? '', quantity: 6 },
          ],
        },
        TODAY,
      );

      // Llegó todo: el pedido se cierra con la fecha real de la última entrega,
      // pero el stock no cambia hasta confirmar la carga.
      expect(second).toMatchObject({
        status: 'RECEIVED',
        receivedOn: '2099-01-12',
        pendingLoads: 1,
      });
      expect(second.receipts.map((receipt) => receipt.invoiceNumber)).toEqual(['F-101', 'F-100']);
      expect(await stockOf(ids['beans'])).toBe(0);
      ids['pending'] = second.receipts[0]?.id ?? '';
    });

    it('la carga pendiente suma una sola vez aunque se confirme dos veces a la vez', async () => {
      const results = await Promise.allSettled([
        service.loadReceipt(ids['order'] ?? '', ids['pending'] ?? ''),
        service.loadReceipt(ids['order'] ?? '', ids['pending'] ?? ''),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await stockOf(ids['rice'])).toBe(14);
      expect(await stockOf(ids['beans'])).toBe(6);
      expect(await prisma.inventoryMovement.count({ where: { receiptId: ids['pending'] } })).toBe(
        2,
      );
    });

    it('otro negocio no ve ni recibe el pedido', async () => {
      const other = new PurchaseOrdersService(new PurchaseOrdersRepository(B));

      await expect(other.getOrder(ids['order'] ?? '')).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        new PurchaseOrdersRepository(B).loadReceipt(ids['order'] ?? '', ids['pending'] ?? '', 'x'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  },
);
