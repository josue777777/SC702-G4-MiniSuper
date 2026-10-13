import type { SuppliersRepository } from '../repositories/suppliers.repository.js';
import type { SupplierDto } from '../types/suppliers.js';
import { HttpError } from '../utils/http-error.js';
import type { SupplierInput } from '../validators/suppliers.validator.js';

/** Lanza `400` si algún producto no existe o está inactivo. */
async function assertProductsAreUsable(
  repository: SuppliersRepository,
  input: SupplierInput,
): Promise<void> {
  const requested = input.products.map((product) => product.productId);
  const found = new Set(await repository.findActiveProductIds(requested));
  const missing = requested.filter((productId) => !found.has(productId));

  if (missing.length > 0) {
    throw HttpError.badRequest('Algún producto indicado no existe o está inactivo.', {
      products: ['Algún producto indicado no existe o está inactivo.'],
    });
  }
}

/**
 * Reglas de negocio de proveedores (HU-21).
 *
 * El nombre no se repite, los productos deben existir y estar activos, y desde
 * aquí no se puede quitar la relación con un producto del que el proveedor es
 * el principal: eso dejaría al producto sin proveedor principal y se cambia en
 * el formulario de productos (HU-02). Las bajas no forman parte de HU-21.
 */
export class SuppliersService {
  constructor(private readonly repository: SuppliersRepository) {}

  async listSuppliers(): Promise<SupplierDto[]> {
    return this.repository.list();
  }

  /** HU-21 — registrar proveedor con los productos que suministra. */
  async createSupplier(input: SupplierInput): Promise<SupplierDto> {
    if (await this.repository.existsByName(input.name)) {
      throw HttpError.conflict('Ya existe un proveedor con ese nombre.');
    }

    await assertProductsAreUsable(this.repository, input);

    return this.repository.create(input);
  }

  /** HU-21 — editar la información del proveedor y sus productos. */
  async updateSupplier(id: string, input: SupplierInput): Promise<SupplierDto> {
    const current = await this.repository.findById(id);

    if (current === null) {
      throw HttpError.notFound('El proveedor no existe.');
    }

    if (await this.repository.existsByName(input.name, id)) {
      throw HttpError.conflict('Ya existe un proveedor con ese nombre.');
    }

    const kept = new Set(input.products.map((product) => product.productId));
    const removedPreferred = current.products.filter(
      (product) => product.isPreferred && !kept.has(product.productId),
    );

    if (removedPreferred.length > 0) {
      const names = removedPreferred.map((product) => product.productName).join(', ');

      throw HttpError.conflict(
        `No se puede quitar ${names}: este proveedor es su proveedor principal. Cámbielo primero desde Productos.`,
      );
    }

    await assertProductsAreUsable(this.repository, input);

    return this.repository.update(id, input);
  }
}
