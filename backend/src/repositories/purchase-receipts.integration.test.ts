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
 * Lotes (HU-38): cada lote se guarda aparte con su fecha, uno nuevo no cambia la
 * fecha de los anteriores y el stock es SIEMPRE la suma de los lotes, también
 * cuando baja o sube por fuera de una recepción (lo hace el disparador).
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
        'TRUNCATE "PurchaseReceiptItemLot", "ProductLot", "PurchaseReceiptItem", "PurchaseReceipt", "PurchaseOrderItem", "PurchaseOrder", "InventoryMovement", "SupplierProduct", "Supplier", "Product", "Category", "DocumentSequence" CASCADE',
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
      const product = (code: string, name: string, stock: number, perishable = false) =>
        prisma.product.create({
          data: {
            businessId: A,
            code,
            name,
            price: 1500,
            cost: 1000,
            stock,
            perishable,
            categoryId: category.id,
          },
        });
      const rice = await product('ARR', 'Arroz 1 kg', 4);
      const beans = await product('FRI', 'Frijoles 1 kg', 0);
      const milk = await product('LEC', 'Leche 1 L', 0, true);

      await prisma.supplierProduct.createMany({
        data: [
          { supplierId: supplier.id, productId: rice.id, unitCost: 980 },
          { supplierId: supplier.id, productId: beans.id, unitCost: 1200 },
          { supplierId: supplier.id, productId: milk.id, unitCost: 650 },
        ],
      });
      ids['milk'] = milk.id;
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

    it('la factura adjunta se guarda y solo la ve el negocio del pedido', async () => {
      const pdf = new Uint8Array(Buffer.from('%PDF-1.4 factura de prueba'));
      const saved = await service.attachReceiptInvoice(ids['order'] ?? '', ids['pending'] ?? '', {
        mimeType: 'application/pdf',
        name: 'F-101.pdf',
        data: pdf,
      });

      expect(saved.receipts[0]?.invoiceFile).toMatchObject({ name: 'F-101.pdf' });
      expect(
        (await service.getReceiptInvoice(ids['order'] ?? '', ids['pending'] ?? '')).data,
      ).toEqual(pdf);

      const other = new PurchaseOrdersRepository(B);

      expect(await other.findReceiptInvoice(ids['order'] ?? '', ids['pending'] ?? '')).toBeNull();
      await expect(
        other.setReceiptInvoice(ids['order'] ?? '', ids['pending'] ?? '', {
          mimeType: 'application/pdf',
          name: 'x.pdf',
          data: pdf,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('otro negocio no ve ni recibe el pedido', async () => {
      const other = new PurchaseOrdersService(new PurchaseOrdersRepository(B));

      await expect(other.getOrder(ids['order'] ?? '')).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        new PurchaseOrdersRepository(B).loadReceipt(ids['order'] ?? '', ids['pending'] ?? '', 'x'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    /** Lotes del producto, del que vence primero al último. */
    async function lotsOf(id: string | undefined) {
      return prisma.productLot.findMany({
        where: { productId: id },
        orderBy: [{ expirationDate: 'asc' }, { lotNumber: 'asc' }],
        select: { lotNumber: true, expirationDate: true, quantity: true, entryMovementId: true },
      });
    }

    const day = (text: string) => new Date(`${text}T00:00:00.000Z`);

    it('lo que no vence queda en un lote con el número de factura; lo que ya había, «SIN LOTE»', async () => {
      expect(
        (await lotsOf(ids['rice'])).map((lot) => [lot.lotNumber, lot.expirationDate, lot.quantity]),
      ).toEqual([
        ['F-100', null, 7],
        ['F-101', null, 3],
        ['SIN LOTE', null, 4],
      ]);
    });

    it('un producto que vence no se recibe sin lote ni fecha', async () => {
      const order = await service.createOrder({
        supplierId: ids['supplier'] ?? '',
        notes: null,
        items: [{ productId: ids['milk'] ?? '', quantity: 15 }],
      });

      ids['milkOrder'] = order.id;

      await expect(
        service.receiveOrder(
          order.id,
          {
            invoiceNumber: 'F-200',
            receivedOn: '2099-01-10',
            loadNow: true,
            items: [{ productId: ids['milk'] ?? '', quantity: 10 }],
          },
          TODAY,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Indique el lote y la fecha de vencimiento de Leche 1 L.',
      });
      expect(await stockOf(ids['milk'])).toBe(0);
    });

    it('cada lote se guarda aparte: uno nuevo no cambia la fecha de los anteriores y el stock es la suma', async () => {
      const orderId = ids['milkOrder'] ?? '';
      const first = await service.receiveOrder(
        orderId,
        {
          invoiceNumber: 'F-200',
          receivedOn: '2099-01-10',
          loadNow: true,
          items: [
            {
              productId: ids['milk'] ?? '',
              quantity: 10,
              lots: [
                { lotNumber: 'L-1', expirationDate: '2099-02-01', quantity: 6 },
                { lotNumber: 'L-2', expirationDate: '2099-03-01', quantity: 4 },
              ],
            },
          ],
        },
        TODAY,
      );

      expect(first.receipts[0]?.items[0]?.lots).toEqual([
        { lotNumber: 'L-1', expirationDate: '2099-02-01', quantity: 6 },
        { lotNumber: 'L-2', expirationDate: '2099-03-01', quantity: 4 },
      ]);

      // La segunda entrega trae un lote que vence ANTES que los que ya había.
      await service.receiveOrder(
        orderId,
        {
          invoiceNumber: 'F-201',
          receivedOn: '2099-01-12',
          loadNow: true,
          items: [
            {
              productId: ids['milk'] ?? '',
              quantity: 5,
              lots: [{ lotNumber: 'L-3', expirationDate: '2099-01-20', quantity: 5 }],
            },
          ],
        },
        TODAY,
      );

      const lots = await lotsOf(ids['milk']);

      expect(lots.map((lot) => [lot.lotNumber, lot.expirationDate, lot.quantity])).toEqual([
        ['L-3', day('2099-01-20'), 5],
        ['L-1', day('2099-02-01'), 6],
        ['L-2', day('2099-03-01'), 4],
      ]);
      expect(await stockOf(ids['milk'])).toBe(15);

      // Cada lote apunta a la entrada del Kardex que lo trajo: L-1 y L-2 a la misma.
      expect(lots[1]?.entryMovementId).toBe(lots[2]?.entryMovementId);
      expect(lots[0]?.entryMovementId).not.toBe(lots[1]?.entryMovementId);
      expect(lots.every((lot) => lot.entryMovementId !== null)).toBe(true);

      // La fecha del producto (alertas de HU-09) es la del lote que vence primero.
      expect(
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: ids['milk'] },
            select: { expirationDate: true },
          })
        ).expirationDate,
      ).toEqual(day('2099-01-20'));
    });

    it('si el stock baja (venta, conteo), sale primero el lote que vence antes', async () => {
      await prisma.product.update({
        where: { id: ids['milk'] },
        data: { stock: { decrement: 7 } },
      });

      expect((await lotsOf(ids['milk'])).map((lot) => [lot.lotNumber, lot.quantity])).toEqual([
        ['L-3', 0],
        ['L-1', 4],
        ['L-2', 4],
      ]);
    });

    it('si sube sin lote (devolución, conteo), la diferencia queda en «SIN LOTE» y todo suma', async () => {
      await prisma.product.update({
        where: { id: ids['milk'] },
        data: { stock: { increment: 2 } },
      });

      const lots = await lotsOf(ids['milk']);

      expect(lots.find((lot) => lot.lotNumber === 'SIN LOTE')?.quantity).toBe(2);
      expect(lots.reduce((sum, lot) => sum + lot.quantity, 0)).toBe(await stockOf(ids['milk']));
    });
  },
);
