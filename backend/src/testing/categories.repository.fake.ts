import type { CategoriesRepository } from '../repositories/categories.repository.js';
import type { CategoryDto, CategoryWritableFields } from '../types/categories.js';
import { TEST_BUSINESS_ID } from './fake-session.js';

/** Doble de repositorio de categorías para los tests (sin base de datos). */
export class FakeCategoriesRepository implements CategoriesRepository {
  readonly businessId = TEST_BUSINESS_ID;

  /** Campos recibidos en cada creación, en orden. */
  readonly createdFields: CategoryWritableFields[] = [];

  /** Simula que otra petición ganó la carrera: `create` devuelve `null` (P2002). */
  simulateRaceOnCreate = false;

  private readonly categories: CategoryDto[];

  constructor(categories: CategoryDto[] = []) {
    this.categories = [...categories];
  }

  list(): Promise<CategoryDto[]> {
    return Promise.resolve([...this.categories]);
  }

  existsByName(name: string): Promise<boolean> {
    const wanted = name.toLowerCase();

    return Promise.resolve(
      this.categories.some((category) => category.name.toLowerCase() === wanted),
    );
  }

  create(fields: CategoryWritableFields): Promise<CategoryDto | null> {
    if (this.simulateRaceOnCreate) {
      return Promise.resolve(null);
    }

    this.createdFields.push(fields);

    const created: CategoryDto = {
      id: '44444444-4444-4444-8444-444444444444',
      name: fields.name,
      description: fields.description,
      isActive: true,
    };

    this.categories.push(created);

    return Promise.resolve(created);
  }
}
