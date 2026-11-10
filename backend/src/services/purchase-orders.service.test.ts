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
import {
  buildRestockSuggestion,
  calculateTotal,
  NO_SUGGESTIONS_MESSAGE,
  pickSupplier,
  PurchaseOrdersService,
  suggestQuantity,
} from './purchase-orders.service.js';
import type { RestockCandidate } from '../types/purchase-orders.js';

/** Reglas de negocio de pedidos a proveedor (HU-22, HU-24), con el doble de repositorio. */

function setup() {
  const repository = new FakePurchaseOrdersRepository();

  return { repository, service: new PurchaseOrdersService(repository) };
}

function candidate(overrides: Partial<RestockCandidate> & { productId: string }): RestockCandidate {
  return {
    productCode: 'P000',
    productName: 'Producto',
    stock: 2,
    minStock: 5,
    pendingQuantity: 0,
    suppliers: [],
    ...overrides,
  };
}

const CENTRAL = { supplierId: SUPPLIER_ID, supplierName: 'Distribuidora Central' };
const LACTEOS = { supplierId: OTHER_SUPPLIER_ID, supplierName: 'Lácteos del Valle' };

describe('suggestQuantity (HU-23)', () => {
  it('pide lo necesario para llegar al doble del mínimo', () => {
    expect(suggestQuantity(2, 5, 0)).toBe(8);
    expect(suggestQuantity(5, 5, 0)).toBe(5);
  });

  it('descuenta lo que ya viene en pedidos pendientes y nunca es negativo', () => {
    expect(suggestQuantity(2, 5, 3)).toBe(5);
    expect(suggestQuantity(2, 5, 20)).toBe(0);
  });
});

describe('pickSupplier (HU-23)', () => {
  it('prefiere al proveedor principal aunque sea más caro', () => {
    expect(
      pickSupplier([
        { ...LACTEOS, unitCost: '100.00', isPreferred: false },
        { ...CENTRAL, unitCost: '900.00', isPreferred: true },
      ])?.supplierId,
    ).toBe(SUPPLIER_ID);
  });

  it('sin principal, elige el más barato; sin proveedores, null', () => {
    expect(
      pickSupplier([
        { ...CENTRAL, unitCost: '700.00', isPreferred: false },
        { ...LACTEOS, unitCost: '690.00', isPreferred: false },
      ])?.supplierId,
    ).toBe(OTHER_SUPPLIER_ID);
    expect(pickSupplier([])).toBeNull();
  });
});

describe('buildRestockSuggestion (HU-23)', () => {
  it('agrupa por proveedor, calcula totales y deja al final los productos sin proveedor', () => {
    const suggestion = buildRestockSuggestion([
      candidate({
        productId: RICE_ID,
        productName: 'Arroz 1 kg',
        stock: 1,
        minStock: 4,
        suppliers: [{ ...LACTEOS, unitCost: '690.00', isPreferred: true }],
      }),
      candidate({ productId: NOT_SUPPLIED_ID, productName: 'Sal 1 kg', stock: 0, minStock: 2 }),
      candidate({
        productId: COFFEE_ID,
        productName: 'Café molido 500 g',
        stock: 3,
        minStock: 3,
        suppliers: [{ ...CENTRAL, unitCost: '1000.50', isPreferred: true }],
      }),
    ]);

    expect(suggestion.message).toBeNull();
    expect(suggestion.groups).toEqual([
      {
        supplierId: SUPPLIER_ID,
        supplierName: 'Distribuidora Central',
        total: '3001.50',
        items: [expect.objectContaining({ productId: COFFEE_ID, suggestedQuantity: 3 })],
      },
      {
        supplierId: OTHER_SUPPLIER_ID,
        supplierName: 'Lácteos del Valle',
        total: '4830.00',
        items: [expect.objectContaining({ productId: RICE_ID, suggestedQuantity: 7 })],
      },
      {
        supplierId: null,
        supplierName: null,
        total: '0.00',
        items: [
          expect.objectContaining({
            productId: NOT_SUPPLIED_ID,
            suggestedQuantity: 4,
            unitCost: null,
          }),
        ],
      },
    ]);
  });

  it('omite productos cubiertos por pedidos pendientes y avisa si no queda nada', () => {
    const suggestion = buildRestockSuggestion([
      candidate({ productId: RICE_ID, stock: 1, minStock: 4, pendingQuantity: 7 }),
    ]);

    expect(suggestion).toEqual({ groups: [], message: NO_SUGGESTIONS_MESSAGE });
  });
});

describe('PurchaseOrdersService.getRestockSuggestion (HU-23)', () => {
  it('sin productos bajo el mínimo informa que no hay sugerencias', async () => {
    const { service } = setup();

    expect(await service.getRestockSuggestion()).toEqual({
      groups: [],
      message: NO_SUGGESTIONS_MESSAGE,
    });
  });
});

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
