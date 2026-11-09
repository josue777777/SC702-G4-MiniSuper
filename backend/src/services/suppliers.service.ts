import type { SuppliersRepository } from '../repositories/suppliers.repository.js';
import type {
  ProductSupplierCostsDto,
  SupplierCostDto,
  SupplierCostRow,
  SupplierDto,
} from '../types/suppliers.js';
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

/** `"4850.00"` → 485000 céntimos, para comparar y restar sin errores de coma flotante. */
function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/**
 * Proveedores de un producto del más barato al más caro (HU-39), con cuánto
 * más cuesta cada uno que el más barato. Si dos cuestan lo mismo, van por
 * nombre; los dos quedan marcados como «más barato».
 *
 * @example
 * rankSupplierCosts([
 *   { supplierName: 'Comercial del Valle', unitCost: '4970.00', … },
 *   { supplierName: 'Distribuidora Central', unitCost: '4850.00', … },
 * ]);
 * // [Distribuidora Central (más barato, diferencia "0.00"),
 * //  Comercial del Valle (diferencia "120.00")]
 */
export function rankSupplierCosts(rows: SupplierCostRow[]): SupplierCostDto[] {
  const sorted = [...rows].sort(
    (a, b) =>
      toCents(a.unitCost) - toCents(b.unitCost) || a.supplierName.localeCompare(b.supplierName),
  );
  const lowest = sorted[0] === undefined ? 0 : toCents(sorted[0].unitCost);

  return sorted.map((row) => {
    const difference = toCents(row.unitCost) - lowest;

    return {
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      unitCost: row.unitCost,
      isPreferred: row.isPreferred,
      cheapest: difference === 0,
      difference: (difference / 100).toFixed(2),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
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
        `No se puede quitar ${names}: este proveedor es su proveedor principal. Cámbielo primero desde Inventario.`,
      );
    }

    await assertProductsAreUsable(this.repository, input);

    return this.repository.update(id, input);
  }

  /**
   * HU-39 — compara el costo de un producto entre los proveedores activos que
   * lo suministran, del más barato al más caro, con el último costo
   * registrado de cada uno. Con un solo proveedor la lista trae uno (la
   * pantalla dice que no hay con quién comparar). Un producto de otro negocio
   * responde 404, igual que uno que no existe.
   */
  async compareProductCosts(productId: string): Promise<ProductSupplierCostsDto> {
    const found = await this.repository.findProductSupplierCosts(productId);

    if (found === null) {
      throw HttpError.notFound('El producto no existe.');
    }

    return { product: found.product, suppliers: rankSupplierCosts(found.costs) };
  }
}
