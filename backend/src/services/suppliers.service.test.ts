import { describe, expect, it } from 'vitest';
import {
  buildSupplier,
  COFFEE_ID,
  FakeSuppliersRepository,
  INACTIVE_PRODUCT_ID,
  MISSING_SUPPLIER_ID,
  RICE_ID,
  SUPPLIER_A_ID,
} from '../testing/suppliers.repository.fake.js';
import type { SupplierInput } from '../validators/suppliers.validator.js';
import { SuppliersService } from './suppliers.service.js';

/** Reglas de negocio de proveedores (HU-21), con el doble de repositorio. */

function input(overrides: Partial<SupplierInput> = {}): SupplierInput {
  return {
    name: 'Lácteos del Valle',
    contactName: null,
    phone: '8888-1111',
    email: null,
    address: null,
    notes: null,
    products: [{ productId: RICE_ID, unitCost: '700.00' }],
    ...overrides,
  };
}

function setup() {
  const repository = new FakeSuppliersRepository();

  return { repository, service: new SuppliersService(repository) };
}

describe('SuppliersService.createSupplier', () => {
  it('registra el proveedor con sus productos, que quedan disponibles para pedidos', async () => {
    const { service } = setup();

    const created = await service.createSupplier(input());

    expect(created.products).toEqual([
      expect.objectContaining({ productId: RICE_ID, unitCost: '700.00', isPreferred: false }),
    ]);
    expect((await service.listSuppliers()).map((supplier) => supplier.name)).toContain(
      'Lácteos del Valle',
    );
  });

  it('responde 409 si el nombre ya existe (sin distinguir mayúsculas)', async () => {
    const { repository, service } = setup();

    await expect(
      service.createSupplier(input({ name: 'distribuidora central' })),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.created).toEqual([]);
  });

  it('responde 400 si algún producto no existe o está inactivo', async () => {
    const { repository, service } = setup();

    await expect(
      service.createSupplier(
        input({ products: [{ productId: INACTIVE_PRODUCT_ID, unitCost: '1.00' }] }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.created).toEqual([]);
  });
});

describe('SuppliersService.updateSupplier', () => {
  it('edita los datos y agrega productos, conservando el proveedor principal', async () => {
    const { service } = setup();

    const updated = await service.updateSupplier(
      SUPPLIER_A_ID,
      input({
        name: 'Distribuidora Central S.A.',
        products: [
          { productId: COFFEE_ID, unitCost: '1050.00' },
          { productId: RICE_ID, unitCost: '700.00' },
        ],
      }),
    );

    expect(updated.name).toBe('Distribuidora Central S.A.');
    expect(updated.products).toEqual([
      expect.objectContaining({ productId: COFFEE_ID, unitCost: '1050.00', isPreferred: true }),
      expect.objectContaining({ productId: RICE_ID, isPreferred: false }),
    ]);
  });

  it('no permite quitar un producto del que es el proveedor principal (409)', async () => {
    const { repository, service } = setup();

    await expect(
      service.updateSupplier(SUPPLIER_A_ID, input({ name: 'Distribuidora Central' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Café molido 500 g'),
    });
    expect(repository.updated).toEqual([]);
  });

  it('sí permite quitar un producto que no es principal', async () => {
    const repository = new FakeSuppliersRepository([
      buildSupplier({
        products: [
          {
            productId: RICE_ID,
            productCode: 'P002',
            productName: 'Arroz 1 kg',
            unitCost: '700.00',
            isPreferred: false,
          },
        ],
      }),
    ]);
    const service = new SuppliersService(repository);

    const updated = await service.updateSupplier(
      SUPPLIER_A_ID,
      input({
        name: 'Distribuidora Central',
        products: [{ productId: COFFEE_ID, unitCost: '1.00' }],
      }),
    );

    expect(updated.products.map((product) => product.productId)).toEqual([COFFEE_ID]);
  });

  it('responde 404 si el proveedor no existe y 409 si el nombre lo usa otro', async () => {
    const { service } = setup();
    await service.createSupplier(input({ name: 'Otro Proveedor' }));

    await expect(service.updateSupplier(MISSING_SUPPLIER_ID, input())).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.updateSupplier(
        SUPPLIER_A_ID,
        input({ name: 'Otro Proveedor', products: [{ productId: COFFEE_ID, unitCost: '1.00' }] }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
