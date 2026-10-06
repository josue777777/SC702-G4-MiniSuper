import { describe, expect, it } from 'vitest';
import {
  COUNT_PRODUCT_ID,
  FakeInventoryRepository,
  MISSING_PRODUCT_ID,
} from '../testing/inventory.repository.fake.js';
import { HttpError } from '../utils/http-error.js';
import { InventoryService, PHYSICAL_COUNT_REASON } from './inventory.service.js';

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
