import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { productsService } from '../../services/products.service';
import type { Product, ProductFormOptions, ProductPayload } from '../../types/products';

/**
 * Estado de la pantalla de productos (HU-01, HU-02, HU-03).
 *
 * Reúne en un solo sitio el catálogo, las opciones de los formularios, el
 * indicador de trabajo y el aviso que se muestra al usuario, para que la página
 * y los componentes solo se ocupen de pintar. No hay gestor de estado global:
 * este hook es el dueño del estado de esta pantalla y nada más.
 */

/** Aviso posterior a una acción: éxito o error, en lenguaje del dueño. */
export interface Notice {
  kind: 'success' | 'error';
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

  /**
   * Carga catálogo y opciones de formulario en paralelo.
   *
   * Si ya había datos en pantalla no se vuelve a mostrar el estado de carga: al
   * refrescar después de una acción conviene seguir viendo la tabla en lugar de
   * que parpadee.
   */
  const load = useCallback(async () => {
    setState((current) =>
      current.phase === 'ready' ? current : { ...current, phase: 'loading', message: undefined },
    );

    try {
      const [products, options] = await Promise.all([
        productsService.list(),
        productsService.getFormOptions(),
      ]);

      setState({ phase: 'ready', products, options });
    } catch (error) {
      setState({
        phase: 'failed',
        products: [],
        options: EMPTY_OPTIONS,
        message: describeError(error),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ejecuta una acción, informa al usuario y recarga el catálogo si salió bien. */
  const runAction = useCallback(
    async (action: () => Promise<Product>, successText: string): Promise<boolean> => {
      setBusy(true);
      setNotice(null);

      try {
        await action();
        setNotice({ kind: 'success', text: successText });
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

  /** HU-01. Devuelve `true` si se guardó: el formulario se cierra solo entonces. */
  const createProduct = useCallback(
    (payload: ProductPayload) =>
      runAction(() => productsService.create(payload), 'Producto registrado correctamente.'),
    [runAction],
  );

  /** HU-02. */
  const updateProduct = useCallback(
    (id: string, payload: ProductPayload) =>
      runAction(() => productsService.update(id, payload), 'Producto actualizado correctamente.'),
    [runAction],
  );

  /** HU-03. */
  const deactivateProduct = useCallback(
    (id: string) =>
      runAction(() => productsService.deactivate(id), 'Producto desactivado correctamente.'),
    [runAction],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    ...state,
    notice,
    busy,
    reload: load,
    createProduct,
    updateProduct,
    deactivateProduct,
    dismissNotice,
  };
}
