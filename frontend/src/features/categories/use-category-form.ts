import { useCallback, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { categoriesService } from '../../services/categories.service';
import type { Category, CategoryPayload } from '../../types/categories';

/** Fallo de la última creación; `duplicate` activa el acceso a la lista existente. */
export interface CategoryFormError {
  message: string;
  duplicate: boolean;
}

/**
 * Estado del formulario de categoría (HU-04): envío, error en línea y lista de
 * categorías existentes. `onCreated` permite a la pantalla refrescar sus datos.
 */
export function useCategoryForm(onCreated: (category: Category) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CategoryFormError | null>(null);
  const [existing, setExisting] = useState<Category[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  /** Devuelve `true` si se guardó. */
  const create = useCallback(
    async (payload: CategoryPayload): Promise<boolean> => {
      setBusy(true);
      setError(null);

      try {
        const created = await categoriesService.create(payload);
        await onCreated(created);

        return true;
      } catch (caught) {
        setError({
          message:
            caught instanceof ApiError
              ? caught.message
              : 'Ocurrió un error inesperado. Intente de nuevo.',
          duplicate: caught instanceof ApiError && caught.status === 409,
        });

        return false;
      } finally {
        setBusy(false);
      }
    },
    [onCreated],
  );

  const showExisting = useCallback(async () => {
    setListError(null);

    try {
      setExisting(await categoriesService.list());
    } catch (caught) {
      setListError(
        caught instanceof ApiError ? caught.message : 'No se pudo cargar la lista de categorías.',
      );
    }
  }, []);

  const hideExisting = useCallback(() => {
    setExisting(null);
    setListError(null);
  }, []);

  return { busy, error, existing, listError, create, showExisting, hideExisting };
}
