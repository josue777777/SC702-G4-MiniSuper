import type { CategoriesRepository } from '../repositories/categories.repository.js';
import type { CategoryDto } from '../types/categories.js';
import { HttpError } from '../utils/http-error.js';
import type { CreateCategoryInput } from '../validators/categories.validator.js';

const DUPLICATE_MESSAGE = 'La categoría ya está registrada.';

/** Reglas de negocio de las categorías (HU-04). */
export class CategoriesService {
  constructor(private readonly repository: CategoriesRepository) {}

  async listCategories(): Promise<CategoryDto[]> {
    return this.repository.list();
  }

  /** Crea una categoría activa; el nombre no puede repetirse. */
  async createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
    if (await this.repository.existsByName(input.name)) {
      throw HttpError.conflict(DUPLICATE_MESSAGE);
    }

    const created = await this.repository.create(input);

    if (created === null) {
      throw HttpError.conflict(DUPLICATE_MESSAGE);
    }

    return created;
  }
}
