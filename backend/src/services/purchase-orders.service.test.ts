import { describe, expect, it } from 'vitest';
import {
  COFFEE_ID,
  FakePurchaseOrdersRepository,
  INACTIVE_SUPPLIER_ID,
  MISSING_ORDER_ID,
  NOT_SUPPLIED_ID,
  OTHER_SUPPLIER_ID,
  RICE_ID,
  SUPPLIER_ID,
} from '../testing/purchase-orders.repository.fake.js';
import { calculateTotal, PurchaseOrdersService } from './purchase-orders.service.js';

/** Reglas de negocio de pedidos a proveedor (HU-22, HU-24), con el doble de repositorio. */

function setup() {
  const repository = new FakePurchaseOrdersRepository();

  return { repository, service: new PurchaseOrdersService(repository) };
}

describe('calculateTotal', () => {
  it('suma cantidad × costo sin errores de redondeo', () => {
    expect(
      calculateTotal([
        { quantity: 3, unitCost: '1000.50' },
        { quantity: 10, unitCost: '0.10' },
      ]),
    ).toBe('3002.50');
  });
});

describe('PurchaseOrdersService.createOrder (HU-24)', () => {
  it('usa el costo acordado con el proveedor y calcula el total', async () => {
    const { repository, service } = setup();

    const order = await service.createOrder({
      supplierId: SUPPLIER_ID,
      notes: null,
      items: [
        { productId: COFFEE_ID, quantity: 2 },
        { productId: RICE_ID, quantity: 5 },
      ],
    });

    expect(repository.createdPlans[0]?.items).toEqual([
      { productId: COFFEE_ID, quantity: 2, unitCost: '1000.50' },
      { productId: RICE_ID, quantity: 5, unitCost: '700.00' },
    ]);
    expect(order.total).toBe('5501.00');
    expect(order.status).toBe('PENDING');
  });

  it('responde 400 si el proveedor no existe o está inactivo', async () => {
    const { repository, service } = setup();

    await expect(
      service.createOrder({
        supplierId: INACTIVE_SUPPLIER_ID,
        notes: null,
        items: [{ productId: COFFEE_ID, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createdPlans).toEqual([]);
  });

  it('responde 400 si se pide un producto que ese proveedor no suministra', async () => {
    const { repository, service } = setup();

    await expect(
      service.createOrder({
        supplierId: SUPPLIER_ID,
        notes: null,
        items: [{ productId: NOT_SUPPLIED_ID, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createdPlans).toEqual([]);
  });
});

describe('PurchaseOrdersService historial (HU-22)', () => {
  it('lista del más reciente al más antiguo y filtra por proveedor', async () => {
    const { service } = setup();
    const first = await service.createOrder({
      supplierId: SUPPLIER_ID,
      notes: null,
      items: [{ productId: COFFEE_ID, quantity: 1 }],
    });
    const second = await service.createOrder({
      supplierId: OTHER_SUPPLIER_ID,
      notes: null,
      items: [{ productId: RICE_ID, quantity: 1 }],
    });
    const third = await service.createOrder({
      supplierId: SUPPLIER_ID,
      notes: null,
      items: [{ productId: RICE_ID, quantity: 4 }],
    });

    expect((await service.listOrders({})).map((order) => order.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
    expect(
      (await service.listOrders({ supplierId: SUPPLIER_ID })).map((order) => order.id),
    ).toEqual([third.id, first.id]);
  });

  it('un proveedor sin pedidos devuelve una lista vacía', async () => {
    const { service } = setup();

    expect(await service.listOrders({ supplierId: OTHER_SUPPLIER_ID })).toEqual([]);
  });

  it('devuelve el detalle completo o 404 si no existe', async () => {
    const { service } = setup();
    const created = await service.createOrder({
      supplierId: SUPPLIER_ID,
      notes: 'Entregar el lunes',
      items: [{ productId: COFFEE_ID, quantity: 3 }],
    });

    expect(await service.getOrder(created.id)).toMatchObject({
      notes: 'Entregar el lunes',
      items: [{ productCode: 'P001', quantity: 3, unitCost: '1000.50', subtotal: '3001.50' }],
    });
    await expect(service.getOrder(MISSING_ORDER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
