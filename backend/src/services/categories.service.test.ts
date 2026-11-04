import { describe, expect, it } from 'vitest';
import { FakeCategoriesRepository } from '../testing/categories.repository.fake.js';
import { CategoriesService } from './categories.service.js';

const EXISTING = {
  id: '44444444-0000-4444-8444-444444444444',
  name: 'Bebidas',
  description: null,
  isActive: true,
};

describe('CategoriesService.createCategory (HU-04)', () => {
  it('crea la categoría activa con los campos recibidos', async () => {
    const repository = new FakeCategoriesRepository();
    const service = new CategoriesService(repository);

    const created = await service.createCategory({
      name: 'Lácteos',
      description: 'Leche y quesos',
    });

    expect(created).toMatchObject({
      name: 'Lácteos',
      description: 'Leche y quesos',
      isActive: true,
    });
    expect(repository.createdFields).toEqual([{ name: 'Lácteos', description: 'Leche y quesos' }]);
  });

  it('rechaza con 409 un nombre repetido sin distinguir mayúsculas', async () => {
    const repository = new FakeCategoriesRepository([EXISTING]);
    const service = new CategoriesService(repository);

    await expect(
      service.createCategory({ name: 'bebidas', description: null }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'La categoría ya está registrada.',
    });
    expect(repository.createdFields).toHaveLength(0);
  });

  it('rechaza con 409 si otra petición se adelantó con el mismo nombre', async () => {
    const repository = new FakeCategoriesRepository();
    repository.simulateRaceOnCreate = true;
    const service = new CategoriesService(repository);

    await expect(
      service.createCategory({ name: 'Granos', description: null }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('CategoriesService.listCategories (HU-04)', () => {
  it('devuelve las categorías del repositorio', async () => {
    const service = new CategoriesService(new FakeCategoriesRepository([EXISTING]));

    await expect(service.listCategories()).resolves.toEqual([EXISTING]);
  });
});
