import { describe, expect, it } from 'vitest';
import {
  FakeKardexRepository,
  KARDEX_EMPTY_PRODUCT_ID,
  KARDEX_PRODUCT_ID,
  kardexMovement,
  kardexProduct,
} from '../testing/kardex.repository.fake.js';
import { KardexService, movementAmounts } from './kardex.service.js';

/** Ficha e historial de un producto (HU-31): reglas del service con un repositorio falso. */

function build() {
  const repository = new FakeKardexRepository();

  return { repository, service: new KardexService(repository as never) };
}

const FIRST_PAGE = { page: 1, pageSize: 25 };

describe('ficha del producto', () => {
  it('muestra código, categoría, precio, costo, proveedor y stock con dinero de dos decimales', async () => {
    const { service } = build();

    expect(await service.getProduct(KARDEX_PRODUCT_ID)).toEqual({
      id: KARDEX_PRODUCT_ID,
      code: 'P001',
      barcode: '7501000000012',
      name: 'Café molido 500 g',
      categoryName: 'Bebidas',
      price: '1500.00',
      cost: '1000.50',
      supplierName: 'Distribuidora Central',
      stock: 8,
      minStock: 3,
      maxStock: 0,
      unit: 'UD',
      description: null,
      perishable: false,
      expirationDate: null,
      isActive: true,
    });
  });

  it('un producto desactivado, sin proveedor y con vencimiento también se consulta', async () => {
    const { service, repository } = build();

    repository.products.set(
      KARDEX_EMPTY_PRODUCT_ID,
      kardexProduct({
        id: KARDEX_EMPTY_PRODUCT_ID,
        isActive: false,
        barcode: null,
        supplierProducts: [],
        expirationDate: new Date('2026-12-31T00:00:00Z'),
      }),
    );

    expect(await service.getProduct(KARDEX_EMPTY_PRODUCT_ID)).toMatchObject({
      isActive: false,
      barcode: null,
      supplierName: null,
      expirationDate: '2026-12-31',
    });
  });

  it('un producto inexistente (o de otro negocio) responde 404 sin revelar nada', async () => {
    const { service } = build();

    await expect(service.getProduct('0a1b2c3d-0000-4000-8000-0000000000ff')).rejects.toMatchObject({
      statusCode: 404,
      message: 'El producto no existe.',
    });
    await expect(
      service.listMovements('0a1b2c3d-0000-4000-8000-0000000000ff', FIRST_PAGE),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('entradas y salidas de un movimiento', () => {
  const base = { id: 'm', stockBefore: 10, at: '2026-10-10T18:00:00Z' };

  it('ENTRY entra y EXIT sale con su cantidad', () => {
    expect(
      movementAmounts(kardexMovement({ ...base, type: 'ENTRY', quantity: 5, stockAfter: 15 })),
    ).toEqual({ entry: 5, exit: 0 });
    expect(
      movementAmounts(kardexMovement({ ...base, type: 'EXIT', quantity: 3, stockAfter: 7 })),
    ).toEqual({ entry: 0, exit: 3 });
  });

  it('un ajuste se clasifica por lo que realmente cambió: sube = entrada, baja = salida', () => {
    expect(
      movementAmounts(kardexMovement({ ...base, type: 'ADJUSTMENT', quantity: 4, stockAfter: 14 })),
    ).toEqual({ entry: 4, exit: 0 });
    expect(
      movementAmounts(kardexMovement({ ...base, type: 'ADJUSTMENT', quantity: 6, stockAfter: 4 })),
    ).toEqual({ entry: 0, exit: 6 });
  });

  it('un ajuste que no cambia el stock no mueve entradas ni salidas', () => {
    expect(
      movementAmounts(kardexMovement({ ...base, type: 'ADJUSTMENT', quantity: 0, stockAfter: 10 })),
    ).toEqual({ entry: 0, exit: 0 });
  });
});

describe('historial', () => {
  it('sin movimientos devuelve una página vacía, no un error', async () => {
    const { service } = build();

    expect(await service.listMovements(KARDEX_EMPTY_PRODUCT_ID, FIRST_PAGE)).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      today: { entries: 0, exits: 0, count: 0 },
    });
  });

  it('«hoy» suma solo lo de este producto en el día de Costa Rica, sin importar el filtro', async () => {
    const { service, repository } = build();

    repository.movements.set(KARDEX_PRODUCT_ID, [
      // Ayer (01/10 a las 09:00 en Costa Rica): no cuenta.
      kardexMovement({
        id: 'ayer',
        type: 'ENTRY',
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        at: '2026-10-01T15:00:00Z',
      }),
      // Hoy a las 09:00 en Costa Rica.
      kardexMovement({
        id: 'manana',
        type: 'ENTRY',
        quantity: 4,
        stockBefore: 10,
        stockAfter: 14,
        at: '2026-10-02T15:00:00Z',
      }),
      // Hoy a las 23:00 en Costa Rica (ya es 03/10 en UTC): cuenta como hoy.
      kardexMovement({
        id: 'noche',
        type: 'EXIT',
        quantity: 3,
        stockBefore: 14,
        stockAfter: 11,
        at: '2026-10-03T05:00:00Z',
      }),
    ]);

    const page = await service.listMovements(
      KARDEX_PRODUCT_ID,
      { ...FIRST_PAGE, direction: 'entries' },
      '2026-10-02',
    );

    expect(page.today).toEqual({ entries: 4, exits: 3, count: 2 });
    // El filtro sí cambia la tabla.
    expect(page.items.map((item) => item.id)).toEqual(['manana', 'ayer']);
  });

  it('ordena del más reciente al más antiguo y muestra concepto, referencia y saldos', async () => {
    const { service, repository } = build();

    repository.movements.set(KARDEX_PRODUCT_ID, [
      kardexMovement({
        id: 'a',
        type: 'ENTRY',
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        at: '2026-10-01T15:00:00Z',
        reason: 'Stock inicial',
      }),
      kardexMovement({
        id: 'c',
        type: 'ADJUSTMENT',
        quantity: 1,
        stockBefore: 7,
        stockAfter: 8,
        at: '2026-10-03T15:00:00Z',
        reason: 'Conteo físico',
      }),
      kardexMovement({
        id: 'b',
        type: 'EXIT',
        quantity: 3,
        stockBefore: 10,
        stockAfter: 7,
        at: '2026-10-02T15:00:00Z',
        reason: 'Venta #12',
        sale: { id: 'sale-12', number: 12 },
      }),
      // Entrada de un pedido: el concepto es la recepción y el documento la factura.
      kardexMovement({
        id: 'd',
        type: 'ENTRY',
        quantity: 20,
        stockBefore: 8,
        stockAfter: 28,
        at: '2026-10-04T15:00:00Z',
        reason: '   ',
        purchaseOrder: { id: 'po-7', number: 7 },
        receipt: { invoiceNumber: 'na-o1' },
        lots: [
          {
            lotNumber: 'L-1',
            expirationDate: new Date('2026-12-01T00:00:00Z'),
            receivedQuantity: 12,
          },
          { lotNumber: 'L-2', expirationDate: null, receivedQuantity: 8 },
        ],
      }),
    ]);

    const page = await service.listMovements(KARDEX_PRODUCT_ID, FIRST_PAGE);

    expect(page.items.map((item) => item.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(page.items[0]).toMatchObject({
      concept: 'Recepción PED-0007',
      document: 'na-o1',
      entry: 20,
      exit: 0,
      stockBefore: 8,
      stockAfter: 28,
      reference: { type: 'PURCHASE_ORDER', id: 'po-7', number: 7 },
      lots: [
        { lotNumber: 'L-1', expirationDate: '2026-12-01', quantity: 12 },
        { lotNumber: 'L-2', expirationDate: null, quantity: 8 },
      ],
    });
    // La venta: concepto breve y solo su número como documento.
    expect(page.items[2]).toMatchObject({
      concept: 'Venta',
      document: '12',
      lots: [],
      entry: 0,
      exit: 3,
      reference: { type: 'SALE', id: 'sale-12', number: 12 },
      createdAt: '2026-10-02T15:00:00.000Z',
    });
    expect(page.items[3]?.reference).toBeNull();
  });

  it('con la misma fecha exacta el orden es siempre el mismo (desempate por id)', async () => {
    const { service, repository } = build();

    repository.movements.set(
      KARDEX_PRODUCT_ID,
      ['a', 'c', 'b'].map((id) =>
        kardexMovement({
          id,
          type: 'EXIT',
          quantity: 1,
          stockBefore: 5,
          stockAfter: 4,
          at: '2026-10-01T15:00:00Z',
        }),
      ),
    );

    const first = await service.listMovements(KARDEX_PRODUCT_ID, FIRST_PAGE);
    const second = await service.listMovements(KARDEX_PRODUCT_ID, FIRST_PAGE);

    expect(first.items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(second.items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('pagina el historial completo sin repetir ni omitir movimientos', async () => {
    const { service, repository } = build();

    repository.movements.set(
      KARDEX_PRODUCT_ID,
      Array.from({ length: 53 }, (_, index) =>
        kardexMovement({
          id: String(index + 1).padStart(3, '0'),
          type: 'EXIT',
          quantity: 1,
          stockBefore: 100 - index,
          stockAfter: 99 - index,
          at: new Date(Date.UTC(2026, 9, 1, 12, index)).toISOString(),
        }),
      ),
    );

    const seen: string[] = [];
    const first = await service.listMovements(KARDEX_PRODUCT_ID, { page: 1, pageSize: 20 });

    expect(first).toMatchObject({ total: 53, totalPages: 3, page: 1, pageSize: 20 });

    for (let page = 1; page <= first.totalPages; page += 1) {
      const current = await service.listMovements(KARDEX_PRODUCT_ID, { page, pageSize: 20 });

      seen.push(...current.items.map((item) => item.id));
    }

    expect(seen).toHaveLength(53);
    expect(new Set(seen).size).toBe(53);
    // Más reciente primero: el 053 (el último creado) abre el historial y el 001 lo cierra.
    expect(seen[0]).toBe('053');
    expect(seen.at(-1)).toBe('001');
    // Una página más allá del final es vacía, con el total correcto.
    expect(await service.listMovements(KARDEX_PRODUCT_ID, { page: 4, pageSize: 20 })).toMatchObject(
      { items: [], total: 53 },
    );
  });

  it('«Buscar producto» pide la página que toca, con texto y categoría, y acepta una búsqueda vacía', async () => {
    const { service, repository } = build();

    repository.options = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index}`,
      code: `P00${index}`,
      barcode: null,
      name: `Producto ${index}`,
      categoryName: 'Granos',
      isActive: true,
      stock: index,
    }));

    const second = await service.searchProducts({ page: 2, pageSize: 4, search: 'pro' });

    expect(await service.searchProducts({ page: 1, pageSize: 4 })).toMatchObject({
      total: 6,
      totalPages: 2,
    });
    // La segunda página trae lo que queda, de 4 en 4.
    expect(second.items.map((item) => item.code)).toEqual(['P004', 'P005']);
    await service.searchProducts({ page: 1, pageSize: 4, categoryId: 'c1' });
    expect(repository.searches).toEqual([
      { filter: { term: 'pro', categoryId: undefined }, skip: 4, take: 4 },
      { filter: { term: '', categoryId: undefined }, skip: 0, take: 4 },
      { filter: { term: '', categoryId: 'c1' }, skip: 0, take: 4 },
    ]);
  });
});
