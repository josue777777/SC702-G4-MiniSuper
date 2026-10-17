import { describe, expect, it } from 'vitest';
import {
  buildProduct,
  CATEGORY_ID,
  FakeProductsRepository,
  OTHER_PRODUCT_ID,
  OTHER_SUPPLIER_ID,
  PRODUCT_ID,
  SUPPLIER_ID,
} from '../testing/products.repository.fake.js';
import type { CreateProductInput } from '../validators/products.validator.js';
import {
  buildStockAdjustment,
  ProductsService,
  STOCK_ADJUSTMENT_REASON,
} from './products.service.js';

/**
 * Pruebas de las reglas de negocio de HU-01, HU-02 y HU-03, SIN base de datos:
 * se inyecta el doble de repositorio de `src/testing/` y se comprueba qué
 * decide el service y qué le encarga escribir.
 *
 * Lo que el repositorio real hace con ese encargo (la transacción, el upsert del
 * proveedor principal, el borrado lógico) se valida contra PostgreSQL en la
 * prueba manual de la historia.
 */

/** Payload válido de HU-01, reutilizado por los casos. */
function buildValidInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    code: 'P001',
    name: 'Café molido 500 g',
    categoryId: CATEGORY_ID,
    price: '1500.00',
    cost: '1000.00',
    stock: 10,
    supplierId: SUPPLIER_ID,
    ...overrides,
  };
}

describe('ProductsService.createProduct (HU-01)', () => {
  it('registra el producto y deja el movimiento ENTRY del stock inicial', async () => {
    const repository = new FakeProductsRepository({ products: [] });
    const service = new ProductsService(repository);

    const created = await service.createProduct(buildValidInput({ stock: 12 }));

    expect(created.code).toBe('P001');
    expect(repository.createdPlans).toHaveLength(1);
    expect(repository.createdPlans[0]?.initialMovement).toEqual({
      type: 'ENTRY',
      quantity: 12,
      stockBefore: 0,
      stockAfter: 12,
      reason: 'Stock inicial',
    });
  });

  it('asocia el proveedor elegido como principal, con el costo del producto', async () => {
    const repository = new FakeProductsRepository({ products: [] });
    const service = new ProductsService(repository);

    await service.createProduct(buildValidInput({ cost: '2345.50' }));

    // El repositorio traduce esto a SupplierProduct(unitCost = costo, isPreferred = true).
    expect(repository.createdPlans[0]?.fields.supplierId).toBe(SUPPLIER_ID);
    expect(repository.createdPlans[0]?.fields.cost).toBe('2345.50');
  });

  it('no inventa un movimiento cuando el stock inicial es 0', async () => {
    const repository = new FakeProductsRepository({ products: [] });
    const service = new ProductsService(repository);

    await service.createProduct(buildValidInput({ stock: 0 }));

    expect(repository.createdPlans[0]?.initialMovement).toBeNull();
  });

  it('rechaza el código duplicado con 409 y el mensaje que ve el dueño', async () => {
    const repository = new FakeProductsRepository(); // ya contiene el código P001
    const service = new ProductsService(repository);

    await expect(service.createProduct(buildValidInput())).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ya existe un producto con ese código.',
    });
    expect(repository.createdPlans).toHaveLength(0);
  });

  it('rechaza una categoría inexistente o inactiva con 400', async () => {
    const repository = new FakeProductsRepository({ products: [], categories: [] });
    const service = new ProductsService(repository);

    await expect(service.createProduct(buildValidInput())).rejects.toMatchObject({
      statusCode: 400,
      message: 'La categoría indicada no existe o está inactiva.',
    });
    expect(repository.createdPlans).toHaveLength(0);
  });

  it('rechaza un proveedor inexistente o inactivo con 400 y no escribe nada', async () => {
    const repository = new FakeProductsRepository({ products: [], suppliers: [] });
    const service = new ProductsService(repository);

    await expect(service.createProduct(buildValidInput())).rejects.toMatchObject({
      statusCode: 400,
      message: 'El proveedor indicado no existe o está inactivo.',
    });
    expect(repository.createdPlans).toHaveLength(0);
  });
});

describe('ProductsService.updateProduct (HU-02)', () => {
  it('guarda el precio nuevo y lo devuelve actualizado', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);

    const updated = await service.updateProduct(
      PRODUCT_ID,
      buildValidInput({ price: '1800.00', cost: '1100.00' }),
    );

    expect(updated.price).toBe('1800.00');
    expect(repository.updatedPlans[0]?.plan.fields.price).toBe('1800.00');
  });

  it('registra un ADJUSTMENT cuando el dueño cambia el stock a mano', async () => {
    const repository = new FakeProductsRepository({ products: [buildProduct({ stock: 10 })] });
    const service = new ProductsService(repository);

    await service.updateProduct(PRODUCT_ID, buildValidInput({ stock: 15 }));

    expect(repository.updatedPlans[0]?.plan.stockMovement).toEqual({
      type: 'ADJUSTMENT',
      quantity: 5,
      stockBefore: 10,
      stockAfter: 15,
      reason: STOCK_ADJUSTMENT_REASON,
    });
  });

  it('no registra movimiento si el stock no cambió', async () => {
    const repository = new FakeProductsRepository({ products: [buildProduct({ stock: 10 })] });
    const service = new ProductsService(repository);

    await service.updateProduct(PRODUCT_ID, buildValidInput({ stock: 10 }));

    expect(repository.updatedPlans[0]?.plan.stockMovement).toBeNull();
  });

  it('deja cambiar los demás campos conservando el propio código', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);

    // Si el producto contara como duplicado de sí mismo, esto lanzaría 409.
    await expect(
      service.updateProduct(PRODUCT_ID, buildValidInput({ name: 'Café molido 250 g' })),
    ).resolves.toMatchObject({ name: 'Café molido 250 g' });
  });

  it('rechaza con 409 el código de otro producto', async () => {
    const repository = new FakeProductsRepository({
      products: [buildProduct(), buildProduct({ id: OTHER_PRODUCT_ID, code: 'P002' })],
    });
    const service = new ProductsService(repository);
    const before = await repository.findById(PRODUCT_ID);

    await expect(
      service.updateProduct(PRODUCT_ID, buildValidInput({ code: 'P002' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ya existe un producto con ese código.',
    });
    expect(repository.updatedPlans).toHaveLength(0);
    await expect(repository.findById(PRODUCT_ID)).resolves.toEqual(before);
  });

  it('al cambiar de proveedor apunta al nuevo y sincroniza el costo', async () => {
    const repository = new FakeProductsRepository({
      products: [
        buildProduct({ preferredSupplierId: SUPPLIER_ID, preferredSupplierName: 'Anterior' }),
      ],
      suppliers: [
        { id: SUPPLIER_ID, name: 'Anterior' },
        { id: OTHER_SUPPLIER_ID, name: 'Nuevo' },
      ],
    });
    const service = new ProductsService(repository);

    await service.updateProduct(
      PRODUCT_ID,
      buildValidInput({ supplierId: OTHER_SUPPLIER_ID, cost: '1200.00' }),
    );

    // El repositorio libera al proveedor anterior, marca el nuevo como preferido
    // y le pone unitCost = costo del producto.
    expect(repository.updatedPlans[0]?.plan.fields.supplierId).toBe(OTHER_SUPPLIER_ID);
    expect(repository.updatedPlans[0]?.plan.fields.cost).toBe('1200.00');
  });

  it('no encarga ningún cambio sobre las ventas ya registradas', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);

    await service.updateProduct(PRODUCT_ID, buildValidInput({ price: '1900.00' }));

    // SaleItem guarda su propio unitPrice/unitCost: editar el producto no debe
    // tocar el historial. Si alguien añade una escritura de ventas al plan, esta
    // prueba falla y obliga a revisarlo.
    expect(Object.keys(repository.updatedPlans[0]?.plan ?? {}).sort()).toEqual([
      'fields',
      'stockMovement',
    ]);
  });

  it('responde 404 si el producto no existe', async () => {
    const repository = new FakeProductsRepository({ products: [] });
    const service = new ProductsService(repository);

    await expect(service.updateProduct(PRODUCT_ID, buildValidInput())).rejects.toMatchObject({
      statusCode: 404,
      message: 'El producto no existe.',
    });
  });
});

describe('ProductsService.listProducts (filtro por categoría)', () => {
  const OTHER_CATEGORY_ID = '22222222-5555-4555-8555-555555555555';

  function buildCatalog() {
    return new FakeProductsRepository({
      products: [
        buildProduct(),
        buildProduct({ id: OTHER_PRODUCT_ID, code: 'P002', isActive: false }),
        buildProduct({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          code: 'P003',
          categoryId: OTHER_CATEGORY_ID,
        }),
      ],
    });
  }

  it('sin filtro devuelve todos, incluidos los inactivos', async () => {
    const service = new ProductsService(buildCatalog());

    await expect(service.listProducts()).resolves.toHaveLength(3);
  });

  it('con categoryId devuelve solo los activos de esa categoría', async () => {
    const service = new ProductsService(buildCatalog());

    const listed = await service.listProducts({ categoryId: CATEGORY_ID });

    expect(listed.map((product) => product.id)).toEqual([PRODUCT_ID]);
  });
});

describe('ProductsService.listProducts (búsqueda HU-05)', () => {
  const OTHER_CATEGORY_ID = '22222222-5555-4555-8555-555555555555';
  const RICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const COFFEE_BEANS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function buildCatalog() {
    return new FakeProductsRepository({
      products: [
        buildProduct({ name: 'Café molido 500 g', code: 'P001' }),
        buildProduct({
          id: OTHER_PRODUCT_ID,
          name: 'Café instantáneo',
          code: 'P002',
          isActive: false,
        }),
        buildProduct({
          id: RICE_ID,
          name: 'Arroz 1 kg',
          code: 'ARR-01',
          categoryId: OTHER_CATEGORY_ID,
        }),
        buildProduct({
          id: COFFEE_BEANS_ID,
          name: 'Café en grano',
          code: 'P010',
          categoryId: OTHER_CATEGORY_ID,
        }),
      ],
    });
  }

  it('encuentra por nombre parcial sin distinguir mayúsculas y excluye los inactivos', async () => {
    const service = new ProductsService(buildCatalog());

    const listed = await service.listProducts({ q: 'CAFÉ' });

    expect(listed.map((product) => product.id)).toEqual([PRODUCT_ID, COFFEE_BEANS_ID]);
  });

  it('encuentra por código completo sin distinguir mayúsculas', async () => {
    const service = new ProductsService(buildCatalog());

    const listed = await service.listProducts({ q: 'arr-01' });

    expect(listed.map((product) => product.id)).toEqual([RICE_ID]);
  });

  it('encuentra por fragmento del código y excluye los inactivos', async () => {
    const service = new ProductsService(buildCatalog());

    const listed = await service.listProducts({ q: 'P0' });

    expect(listed.map((product) => product.id)).toEqual([PRODUCT_ID, COFFEE_BEANS_ID]);
  });

  it('combina la búsqueda con el filtro de categoría', async () => {
    const service = new ProductsService(buildCatalog());

    const listed = await service.listProducts({ q: 'café', categoryId: OTHER_CATEGORY_ID });

    expect(listed.map((product) => product.id)).toEqual([COFFEE_BEANS_ID]);
  });

  it('devuelve una lista vacía si nada coincide', async () => {
    const service = new ProductsService(buildCatalog());

    await expect(service.listProducts({ q: 'leche' })).resolves.toEqual([]);
  });
});

describe('ProductsService.deactivateProduct (HU-03)', () => {
  it('desactiva con baja lógica: isActive pasa a false', async () => {
    const repository = new FakeProductsRepository({ products: [buildProduct()] });
    const service = new ProductsService(repository);

    const deactivated = await service.deactivateProduct(PRODUCT_ID);

    expect(deactivated.isActive).toBe(false);
    expect(repository.deactivatedIds).toEqual([PRODUCT_ID]);
  });

  it('es idempotente: si ya estaba inactivo no vuelve a escribir', async () => {
    const repository = new FakeProductsRepository({
      products: [buildProduct({ isActive: false })],
    });
    const service = new ProductsService(repository);

    const result = await service.deactivateProduct(PRODUCT_ID);

    expect(result.isActive).toBe(false);
    expect(repository.deactivatedIds).toHaveLength(0);
  });

  it('no elimina el producto: sigue existiendo para el historial y los reportes', async () => {
    const repository = new FakeProductsRepository({ products: [buildProduct()] });
    const service = new ProductsService(repository);

    await service.deactivateProduct(PRODUCT_ID);

    // Nada se borró: el producto sigue en el catálogo y se lee igual que antes.
    const listed = await service.listProducts();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: PRODUCT_ID, isActive: false });
    await expect(repository.findById(PRODUCT_ID)).resolves.toMatchObject({ id: PRODUCT_ID });
  });

  it('no toca otros datos del producto al desactivarlo', async () => {
    const repository = new FakeProductsRepository({ products: [buildProduct()] });
    const service = new ProductsService(repository);
    const before = await repository.findById(PRODUCT_ID);

    const after = await service.deactivateProduct(PRODUCT_ID);

    expect({ ...after, isActive: null }).toEqual({ ...before, isActive: null });
    expect(repository.updatedPlans).toHaveLength(0);
  });

  it('responde 404 si el producto no existe', async () => {
    const repository = new FakeProductsRepository({ products: [] });
    const service = new ProductsService(repository);

    await expect(service.deactivateProduct(PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'El producto no existe.',
    });
  });
});

describe('ProductsService.getFormOptions', () => {
  it('devuelve las categorías y proveedores activos que ofrece el repositorio', async () => {
    const repository = new FakeProductsRepository({
      categories: [{ id: CATEGORY_ID, name: 'Bebidas' }],
      suppliers: [{ id: SUPPLIER_ID, name: 'Distribuidora Central' }],
    });
    const service = new ProductsService(repository);

    await expect(service.getFormOptions()).resolves.toEqual({
      categories: [{ id: CATEGORY_ID, name: 'Bebidas' }],
      suppliers: [{ id: SUPPLIER_ID, name: 'Distribuidora Central' }],
    });
  });
});

describe('buildStockAdjustment', () => {
  it('no propone movimiento cuando el stock no cambia', () => {
    expect(buildStockAdjustment(10, 10)).toBeNull();
  });

  it('propone un ADJUSTMENT con la diferencia en valor absoluto', () => {
    expect(buildStockAdjustment(10, 7)).toMatchObject({
      type: 'ADJUSTMENT',
      quantity: 3,
      stockBefore: 10,
      stockAfter: 7,
    });
  });
});

/** Primeros bytes de un PNG real, más relleno: suficiente para la firma. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

describe('ProductsService: imagen del producto (HU-01)', () => {
  it('guarda la imagen y el producto devuelve su URL', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);

    const saved = await service.setProductImage(PRODUCT_ID, {
      mimeType: 'image/png',
      data: PNG_BYTES,
    });

    expect(saved.imageUrl).toContain(`/api/products/${PRODUCT_ID}/image`);
    expect(repository.images.get(PRODUCT_ID)?.mimeType).toBe('image/png');
  });

  it('rechaza un archivo cuyo contenido no es del tipo declarado (400)', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);
    const notAnImage = new TextEncoder().encode('MZ esto es un ejecutable renombrado');

    await expect(
      service.setProductImage(PRODUCT_ID, { mimeType: 'image/png', data: notAnImage }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.images.size).toBe(0);
  });

  it('responde 404 si el producto no existe o no tiene imagen', async () => {
    const service = new ProductsService(new FakeProductsRepository());

    await expect(
      service.setProductImage(OTHER_PRODUCT_ID, { mimeType: 'image/png', data: PNG_BYTES }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getProductImage(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('quita la imagen; si no tenía, no escribe nada', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);

    expect((await service.removeProductImage(PRODUCT_ID)).imageUrl).toBeNull();

    await service.setProductImage(PRODUCT_ID, { mimeType: 'image/png', data: PNG_BYTES });
    const removed = await service.removeProductImage(PRODUCT_ID);

    expect(removed.imageUrl).toBeNull();
    expect(repository.images.has(PRODUCT_ID)).toBe(false);
  });
});

describe('ProductsService.deleteProduct (HU-03, borrar para siempre)', () => {
  it('no borra un producto activo: primero hay que desactivarlo (409)', async () => {
    const repository = new FakeProductsRepository();
    const service = new ProductsService(repository);

    await expect(service.deleteProduct(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.deletedIds).toEqual([]);
  });

  it('no borra un producto con ventas o pedidos: conserva el historial (409)', async () => {
    const repository = new FakeProductsRepository({
      products: [buildProduct({ isActive: false })],
    });
    repository.references.set(PRODUCT_ID, { sales: 2, purchaseOrders: 1 });
    const service = new ProductsService(repository);

    await expect(service.deleteProduct(PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 409,
      details: { sales: 2, purchaseOrders: 1 },
    });
    expect(repository.deletedIds).toEqual([]);
  });

  it('borra un producto desactivado sin ventas ni pedidos', async () => {
    const repository = new FakeProductsRepository({
      products: [buildProduct({ isActive: false })],
    });
    const service = new ProductsService(repository);

    await service.deleteProduct(PRODUCT_ID);

    expect(repository.deletedIds).toEqual([PRODUCT_ID]);
    expect(await repository.findById(PRODUCT_ID)).toBeNull();
  });

  it('responde 404 si el producto no existe', async () => {
    const service = new ProductsService(new FakeProductsRepository());

    await expect(service.deleteProduct(OTHER_PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
