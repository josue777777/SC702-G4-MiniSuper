import type { ProductsRepository } from '../repositories/products.repository.js';
import type {
  CreateProductPlan,
  ProductDto,
  ReferenceOption,
  UpdateProductPlan,
} from '../types/products.js';

/**
 * Doble de repositorio del módulo de productos, compartido por los tests.
 *
 * Vive en `src/testing/` y se excluye del build: es soporte de pruebas, no
 * código de producción. Sustituye a Prisma para poder comprobar las reglas de
 * negocio (duplicados, movimientos de stock, proveedor principal…) sin levantar
 * una base de datos.
 *
 * Además del comportamiento, guarda los "planes" que el service le encarga, que
 * es lo que las pruebas observan: qué se decidió escribir y con qué datos.
 */

/** Identificadores válidos (UUID) para los casos de prueba. */
export const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
export const NEW_PRODUCT_ID = '11111111-1111-4111-8111-111111111119';
export const OTHER_PRODUCT_ID = '11111111-2222-4222-8222-222222222222';
export const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
export const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';
export const OTHER_SUPPLIER_ID = '33333333-4444-4444-8444-444444444444';

/** Producto mínimo válido, para no repetir todos los campos en cada prueba. */
export function buildProduct(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: PRODUCT_ID,
    code: 'P001',
    name: 'Café molido 500 g',
    categoryId: CATEGORY_ID,
    categoryName: 'Bebidas',
    price: '1500.00',
    cost: '1000.00',
    stock: 10,
    isActive: true,
    preferredSupplierId: SUPPLIER_ID,
    preferredSupplierName: 'Distribuidora Central',
    ...overrides,
  };
}

export interface FakeProductsState {
  products?: ProductDto[];
  categories?: ReferenceOption[];
  suppliers?: ReferenceOption[];
}

/**
 * Implementa la interfaz pública de `ProductsRepository`. Se escriben a mano
 * los diez métodos para que, si el contrato cambia, la compilación de los tests
 * lo delate en lugar de pasar por alto el método nuevo.
 */
export class FakeProductsRepository implements ProductsRepository {
  /** Planes de creación recibidos, en orden. */
  readonly createdPlans: CreateProductPlan[] = [];
  /** Planes de edición recibidos, en orden. */
  readonly updatedPlans: { id: string; plan: UpdateProductPlan }[] = [];
  /** Ids que se mandaron a desactivar (si está vacío, no se escribió nada). */
  readonly deactivatedIds: string[] = [];

  private readonly products: ProductDto[];
  private readonly categories: ReferenceOption[];
  private readonly suppliers: ReferenceOption[];

  constructor(state: FakeProductsState = {}) {
    this.products = [...(state.products ?? [buildProduct()])];
    this.categories = [...(state.categories ?? [{ id: CATEGORY_ID, name: 'Bebidas' }])];
    this.suppliers = [...(state.suppliers ?? [{ id: SUPPLIER_ID, name: 'Distribuidora Central' }])];
  }

  list(): Promise<ProductDto[]> {
    return Promise.resolve([...this.products]);
  }

  findById(id: string): Promise<ProductDto | null> {
    return Promise.resolve(this.products.find((product) => product.id === id) ?? null);
  }

  existsByCode(code: string, exceptProductId?: string): Promise<boolean> {
    return Promise.resolve(
      this.products.some((product) => product.code === code && product.id !== exceptProductId),
    );
  }

  findActiveCategory(categoryId: string): Promise<ReferenceOption | null> {
    return Promise.resolve(this.categories.find((category) => category.id === categoryId) ?? null);
  }

  findActiveSupplier(supplierId: string): Promise<ReferenceOption | null> {
    return Promise.resolve(this.suppliers.find((supplier) => supplier.id === supplierId) ?? null);
  }

  listActiveCategories(): Promise<ReferenceOption[]> {
    return Promise.resolve([...this.categories]);
  }

  listActiveSuppliers(): Promise<ReferenceOption[]> {
    return Promise.resolve([...this.suppliers]);
  }

  createProduct(plan: CreateProductPlan): Promise<ProductDto> {
    this.createdPlans.push(plan);

    const created = buildProduct({
      id: NEW_PRODUCT_ID,
      code: plan.fields.code,
      name: plan.fields.name,
      categoryId: plan.fields.categoryId,
      price: plan.fields.price,
      cost: plan.fields.cost,
      stock: plan.fields.stock,
      isActive: true,
      preferredSupplierId: plan.fields.supplierId,
      preferredSupplierName:
        this.suppliers.find((supplier) => supplier.id === plan.fields.supplierId)?.name ?? null,
    });

    this.products.push(created);

    return Promise.resolve(created);
  }

  updateProduct(id: string, plan: UpdateProductPlan): Promise<ProductDto> {
    this.updatedPlans.push({ id, plan });

    const index = this.products.findIndex((product) => product.id === id);
    const current = this.products[index];

    if (current === undefined) {
      return Promise.reject(new Error(`El doble no tiene un producto con id ${id}.`));
    }

    const updated: ProductDto = {
      ...current,
      code: plan.fields.code,
      name: plan.fields.name,
      categoryId: plan.fields.categoryId,
      price: plan.fields.price,
      cost: plan.fields.cost,
      stock: plan.fields.stock,
      preferredSupplierId: plan.fields.supplierId,
      preferredSupplierName:
        this.suppliers.find((supplier) => supplier.id === plan.fields.supplierId)?.name ?? null,
    };

    this.products[index] = updated;

    return Promise.resolve(updated);
  }

  deactivate(id: string): Promise<ProductDto> {
    this.deactivatedIds.push(id);

    const index = this.products.findIndex((product) => product.id === id);
    const current = this.products[index];

    if (current === undefined) {
      return Promise.reject(new Error(`El doble no tiene un producto con id ${id}.`));
    }

    const deactivated: ProductDto = { ...current, isActive: false };

    this.products[index] = deactivated;

    return Promise.resolve(deactivated);
  }
}
