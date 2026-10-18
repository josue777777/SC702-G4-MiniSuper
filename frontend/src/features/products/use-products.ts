import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import { productsService } from '../../services/products.service';
import type {
  Product,
  ProductFormOptions,
  ProductImageChange,
  ProductPayload,
  ProductSettingsChange,
} from '../../types/products';

/**
 * Estado de la pantalla de productos (HU-01, HU-02, HU-03, HU-05).
 *
 * Reúne en un solo sitio el catálogo, las opciones de los formularios, el
 * indicador de trabajo y el aviso que se muestra al usuario, para que la página
 * y los componentes solo se ocupen de pintar. No hay gestor de estado global:
 * este hook es el dueño del estado de esta pantalla y nada más.
 */

/** Aviso posterior a una acción: éxito o error, en lenguaje del dueño. */
export interface Notice {
  kind: 'success' | 'warning' | 'error';
  text: string;
}

interface ProductsState {
  phase: 'loading' | 'ready' | 'failed';
  products: Product[];
  options: ProductFormOptions;
  /** Explica el fallo de carga cuando `phase` es 'failed'. */
  message?: string;
}

const EMPTY_OPTIONS: ProductFormOptions = { categories: [], suppliers: [] };

/** Traduce cualquier fallo a un mensaje comprensible en pantalla. */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'Ocurrió un error inesperado. Intente de nuevo.';
}

export function useProducts() {
  const [state, setState] = useState<ProductsState>({
    phase: 'loading',
    products: [],
    options: EMPTY_OPTIONS,
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  /** Categoría del filtro; cadena vacía significa "todas". */
  const [categoryFilter, setCategoryFilter] = useState('');
  /** Búsqueda confirmada (HU-05), ya recortada; cadena vacía significa "sin búsqueda". */
  const [searchTerm, setSearchTermState] = useState('');
  /**
   * Número de la última carga pedida. Si el dueño cambia el filtro o busca otra
   * vez antes de que llegue la respuesta anterior, la respuesta vieja se descarta
   * para no pisar los resultados nuevos.
   */
  const latestLoad = useRef(0);

  const setSearchTerm = useCallback((value: string) => setSearchTermState(value.trim()), []);

  /**
   * Carga catálogo y opciones de formulario en paralelo.
   *
   * Si ya había datos en pantalla no se vuelve a mostrar el estado de carga: al
   * refrescar después de una acción conviene seguir viendo la tabla en lugar de
   * que parpadee.
   */
  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;

    setState((current) =>
      current.phase === 'ready' ? current : { ...current, phase: 'loading', message: undefined },
    );

    try {
      const [products, options] = await Promise.all([
        productsService.list({
          categoryId: categoryFilter || undefined,
          search: searchTerm || undefined,
        }),
        productsService.getFormOptions(),
      ]);

      if (loadId !== latestLoad.current) {
        return;
      }

      setState({ phase: 'ready', products, options });
    } catch (error) {
      if (loadId !== latestLoad.current) {
        return;
      }

      setState({
        phase: 'failed',
        products: [],
        options: EMPTY_OPTIONS,
        message: describeError(error),
      });
    }
  }, [categoryFilter, searchTerm]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ejecuta una acción, informa al usuario y recarga el catálogo si salió bien.
   * La acción puede devolver una advertencia: lo principal se guardó, pero algo
   * secundario no (por ejemplo la imagen).
   */
  const runAction = useCallback(
    async (action: () => Promise<string | null>, successText: string): Promise<boolean> => {
      setBusy(true);
      setNotice(null);

      try {
        const warning = await action();
        setNotice(
          warning === null
            ? { kind: 'success', text: successText }
            : { kind: 'warning', text: warning },
        );
        await load();

        return true;
      } catch (error) {
        setNotice({ kind: 'error', text: describeError(error) });

        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  /**
   * Lo que se guarda DESPUÉS del producto, porque al crear se necesita su `id`:
   * la imagen (HU-01) y el mínimo y vencimiento (HU-08, HU-09). Si algo falla,
   * el producto ya quedó guardado: se avisa en vez de dejar el formulario
   * abierto (reenviarlo daría "código duplicado").
   */
  const applyExtras = useCallback(
    async (
      id: string,
      image: ProductImageChange,
      settings: ProductSettingsChange,
    ): Promise<string | null> => {
      const failures: string[] = [];

      try {
        if (image.kind === 'set') {
          await productsService.uploadImage(id, image.file);
        } else if (image.kind === 'remove') {
          await productsService.removeImage(id);
        }
      } catch (error) {
        failures.push(`la imagen (${describeError(error)})`);
      }

      try {
        if (settings.minStock !== undefined) {
          await inventoryService.updateMinStock(id, settings.minStock);
        }

        if (settings.expirationDate !== undefined) {
          await inventoryService.updateExpirationDate(id, settings.expirationDate);
        }
      } catch (error) {
        failures.push(`el mínimo o el vencimiento (${describeError(error)})`);
      }

      return failures.length === 0
        ? null
        : `El producto se guardó, pero no ${failures.join(' ni ')}. Puede intentarlo de nuevo con «Modificar».`;
    },
    [],
  );

  /** HU-01. Devuelve `true` si se guardó: el formulario se cierra solo entonces. */
  const createProduct = useCallback(
    (
      payload: ProductPayload,
      image: ProductImageChange = { kind: 'keep' },
      settings: ProductSettingsChange = {},
    ) =>
      runAction(async () => {
        const created = await productsService.create(payload);

        return applyExtras(created.id, image, settings);
      }, 'Producto registrado correctamente.'),
    [runAction, applyExtras],
  );

  /** HU-02. */
  const updateProduct = useCallback(
    (
      id: string,
      payload: ProductPayload,
      image: ProductImageChange = { kind: 'keep' },
      settings: ProductSettingsChange = {},
    ) =>
      runAction(async () => {
        await productsService.update(id, payload);

        return applyExtras(id, image, settings);
      }, 'Producto actualizado correctamente.'),
    [runAction, applyExtras],
  );

  /** HU-03. */
  const deactivateProduct = useCallback(
    (id: string) =>
      runAction(async () => {
        await productsService.deactivate(id);

        return null;
      }, 'Producto desactivado correctamente.'),
    [runAction],
  );

  /** HU-03: volver a activar un producto desactivado. */
  const activateProduct = useCallback(
    (id: string) =>
      runAction(async () => {
        await productsService.activate(id);

        return null;
      }, 'Producto activado: vuelve a estar disponible para la venta.'),
    [runAction],
  );

  /** HU-03: borrar para siempre (más adelante, solo el administrador). */
  const deleteProduct = useCallback(
    (id: string) =>
      runAction(async () => {
        await productsService.remove(id);

        return null;
      }, 'Producto borrado definitivamente.'),
    [runAction],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  /** HU-04. Al recargar, `options.categories` incluye la categoría nueva. */
  const afterCategoryCreated = useCallback(async () => {
    setNotice({ kind: 'success', text: 'Categoría creada correctamente.' });
    await load();
  }, [load]);

  return {
    ...state,
    notice,
    busy,
    categoryFilter,
    setCategoryFilter,
    searchTerm,
    setSearchTerm,
    reload: load,
    createProduct,
    updateProduct,
    deactivateProduct,
    activateProduct,
    deleteProduct,
    afterCategoryCreated,
    dismissNotice,
  };
}
