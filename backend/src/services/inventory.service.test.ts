import { describe, expect, it } from 'vitest';
import {
  COUNT_PRODUCT_ID,
  FakeInventoryRepository,
  MISSING_PRODUCT_ID,
} from '../testing/inventory.repository.fake.js';
import { HttpError } from '../utils/http-error.js';
import {
  classifyExpiration,
  InventoryService,
  isLowStock,
  PHYSICAL_COUNT_REASON,
} from './inventory.service.js';

/**
 * Reglas de negocio del conteo de inventario físico (HU-10), probadas con el
 * doble de repositorio: sin base de datos ni HTTP.
 */

function setup() {
  const repository = new FakeInventoryRepository();
  const service = new InventoryService(repository);

  return { repository, service };
}

describe('InventoryService.registerCount', () => {
  it('registra un ADJUSTMENT con el stock antes y después cuando falta mercadería', async () => {
    const { repository, service } = setup();

    const count = await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 8 });

    expect(repository.createdPlans).toEqual([
      {
        productId: COUNT_PRODUCT_ID,
        movement: {
          type: 'ADJUSTMENT',
          quantity: 2,
          stockBefore: 10,
          stockAfter: 8,
          reason: PHYSICAL_COUNT_REASON,
        },
      },
    ]);
    expect(count.systemStock).toBe(10);
    expect(count.countedQuantity).toBe(8);
    expect(count.difference).toBe(-2);
  });

  it('muestra una diferencia positiva cuando sobra mercadería', async () => {
    const { repository, service } = setup();

    const count = await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 13 });

    expect(repository.createdPlans[0]?.movement.quantity).toBe(3);
    expect(count.difference).toBe(3);
  });

  it('actualiza el stock del producto a la cantidad contada', async () => {
    const { repository, service } = setup();

    await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 8 });

    expect(repository.products[0]?.stock).toBe(8);
  });

  it('guarda el conteo aunque coincida con el sistema, con cantidad 0', async () => {
    const { repository, service } = setup();

    const count = await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 10 });

    expect(repository.createdPlans[0]?.movement).toMatchObject({
      quantity: 0,
      stockBefore: 10,
      stockAfter: 10,
    });
    expect(count.difference).toBe(0);
  });

  it('responde 404 si el producto no existe y no escribe nada', async () => {
    const { repository, service } = setup();

    const promise = service.registerCount({ productId: MISSING_PRODUCT_ID, countedQuantity: 5 });

    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.createdPlans).toEqual([]);
  });
});

describe('InventoryService.listCounts', () => {
  it('devuelve solo los conteos físicos, del más reciente al más antiguo', async () => {
    const { repository, service } = setup();

    // Un ajuste hecho desde la edición de producto (HU-02) no es un conteo.
    repository.seedMovement('Ajuste desde edición de producto', {
      id: 'edit-adjustment',
      productId: COUNT_PRODUCT_ID,
      productCode: 'P001',
      productName: 'Café molido 500 g',
      systemStock: 5,
      countedQuantity: 10,
      difference: 5,
      createdAt: '2026-10-05T15:00:00.000Z',
    });

    const first = await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 8 });
    const second = await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 7 });

    expect(await service.listCounts()).toEqual([second, first]);
  });
});

describe('isLowStock (HU-08)', () => {
  it('alerta cuando el stock llega al mínimo o baja de él', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(2, 5)).toBe(true);
  });

  it('no alerta cuando el stock está por encima del mínimo', () => {
    expect(isLowStock(6, 5)).toBe(false);
  });

  it('no genera alertas falsas si el producto no tiene mínimo definido', () => {
    expect(isLowStock(0, 0)).toBe(false);
  });
});

describe('InventoryService.listLowStockAlerts (HU-08)', () => {
  function serviceWith(products: ConstructorParameters<typeof FakeInventoryRepository>[0]) {
    const repository = new FakeInventoryRepository(products);

    return { repository, service: new InventoryService(repository) };
  }

  it('devuelve solo los productos activos con stock igual o menor al mínimo', async () => {
    const { service } = serviceWith([
      { id: 'a', code: 'A', name: 'Arroz', stock: 3, minStock: 5 },
      { id: 'b', code: 'B', name: 'Café', stock: 5, minStock: 5 },
      { id: 'c', code: 'C', name: 'Frijoles', stock: 9, minStock: 5 },
      { id: 'd', code: 'D', name: 'Sal', stock: 0 },
      { id: 'e', code: 'E', name: 'Té', stock: 1, minStock: 5, isActive: false },
    ]);

    const alerts = await service.listLowStockAlerts();

    expect(alerts.map((alert) => alert.productCode)).toEqual(['A', 'B']);
    expect(alerts[0]).toEqual({
      productId: 'a',
      productCode: 'A',
      productName: 'Arroz',
      stock: 3,
      minStock: 5,
    });
  });

  it('la alerta desaparece al reponer el stock con un conteo físico', async () => {
    const { service } = serviceWith([
      { id: COUNT_PRODUCT_ID, code: 'P001', name: 'Café molido 500 g', stock: 2, minStock: 5 },
    ]);

    expect(await service.listLowStockAlerts()).toHaveLength(1);

    await service.registerCount({ productId: COUNT_PRODUCT_ID, countedQuantity: 20 });

    expect(await service.listLowStockAlerts()).toEqual([]);
  });
});

/** Día fijo para las pruebas de vencimiento. */
const TODAY = '2026-10-13';

describe('InventoryService.updateMinStock (HU-08)', () => {
  it('define el mínimo y hace aparecer la alerta si el stock ya está en ese nivel', async () => {
    const { service } = setup();

    const settings = await service.updateMinStock(COUNT_PRODUCT_ID, { minStock: 10 });

    expect(settings.minStock).toBe(10);
    expect(await service.listLowStockAlerts()).toHaveLength(1);
  });

  it('con mínimo 0 deja de alertar', async () => {
    const { service } = setup();
    await service.updateMinStock(COUNT_PRODUCT_ID, { minStock: 10 });

    await service.updateMinStock(COUNT_PRODUCT_ID, { minStock: 0 });

    expect(await service.listLowStockAlerts()).toEqual([]);
  });

  it('responde 404 si el producto no existe', async () => {
    const { service } = setup();

    await expect(service.updateMinStock(MISSING_PRODUCT_ID, { minStock: 3 })).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });
});

describe('classifyExpiration (HU-09)', () => {
  it('marca vencido, próximo a vencer (menos de 15 días) o nada', () => {
    expect(classifyExpiration(-1)).toBe('EXPIRED');
    expect(classifyExpiration(0)).toBe('EXPIRING_SOON');
    expect(classifyExpiration(14)).toBe('EXPIRING_SOON');
    expect(classifyExpiration(15)).toBeNull();
  });
});

describe('InventoryService.updateExpirationDate (HU-09)', () => {
  function serviceAtToday(expirationDate: string | null = null) {
    const repository = new FakeInventoryRepository([
      { id: COUNT_PRODUCT_ID, code: 'P001', name: 'Leche 1 L', stock: 10, expirationDate },
    ]);

    return { repository, service: new InventoryService(repository, () => TODAY) };
  }

  it('guarda una fecha futura', async () => {
    const { service } = serviceAtToday();

    const settings = await service.updateExpirationDate(COUNT_PRODUCT_ID, {
      expirationDate: '2026-11-01',
    });

    expect(settings.expirationDate).toBe('2026-11-01');
  });

  it('rechaza con 400 una fecha de hoy o pasada', async () => {
    const { service } = serviceAtToday();

    for (const expirationDate of [TODAY, '2026-10-01']) {
      await expect(
        service.updateExpirationDate(COUNT_PRODUCT_ID, { expirationDate }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('permite dejar el campo vacío (null) sin error', async () => {
    const { service } = serviceAtToday('2026-11-01');

    const settings = await service.updateExpirationDate(COUNT_PRODUCT_ID, { expirationDate: null });

    expect(settings.expirationDate).toBeNull();
  });

  it('acepta volver a guardar la misma fecha aunque ya haya pasado', async () => {
    const { service } = serviceAtToday('2026-10-01');

    await expect(
      service.updateExpirationDate(COUNT_PRODUCT_ID, { expirationDate: '2026-10-01' }),
    ).resolves.toMatchObject({ expirationDate: '2026-10-01' });
  });

  it('responde 404 si el producto no existe', async () => {
    const { service } = serviceAtToday();

    await expect(
      service.updateExpirationDate(MISSING_PRODUCT_ID, { expirationDate: '2026-11-01' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('InventoryService.listExpirations (HU-09)', () => {
  it('lista vencidos y próximos a vencer, del más urgente al menos urgente', async () => {
    const repository = new FakeInventoryRepository([
      { id: 'a', code: 'A', name: 'Yogur', stock: 4, expirationDate: '2026-10-20' },
      { id: 'b', code: 'B', name: 'Pan', stock: 2, expirationDate: '2026-10-10' },
      { id: 'c', code: 'C', name: 'Atún', stock: 9, expirationDate: '2027-05-01' },
      { id: 'd', code: 'D', name: 'Sal', stock: 7 },
      {
        id: 'e',
        code: 'E',
        name: 'Queso',
        stock: 1,
        expirationDate: '2026-10-12',
        isActive: false,
      },
    ]);
    const service = new InventoryService(repository, () => TODAY);

    const alerts = await service.listExpirations();

    expect(alerts).toEqual([
      {
        productId: 'b',
        productCode: 'B',
        productName: 'Pan',
        stock: 2,
        expirationDate: '2026-10-10',
        daysLeft: -3,
        status: 'EXPIRED',
      },
      {
        productId: 'a',
        productCode: 'A',
        productName: 'Yogur',
        stock: 4,
        expirationDate: '2026-10-20',
        daysLeft: 7,
        status: 'EXPIRING_SOON',
      },
    ]);
  });
});
