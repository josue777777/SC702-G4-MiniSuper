import { useCallback, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { suppliersService } from '../../services/suppliers.service';
import type { Supplier, SupplierPayload } from '../../types/suppliers';

/** Fallo de la última creación; `duplicate` activa el acceso a la lista existente. */
export interface QuickSupplierError {
  message: string;
  duplicate: boolean;
}

/**
 * Estado del alta rápida de proveedor (HU-21) dentro del modal de producto:
 * envío, error en línea y lista de proveedores existentes. Mismo patrón que
 * `use-category-form.ts`. `onCreated` permite a la pantalla refrescar sus
 * opciones y dejar seleccionado el proveedor nuevo.
 */
export function useQuickSupplierForm(onCreated: (supplier: Supplier) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<QuickSupplierError | null>(null);
  const [existing, setExisting] = useState<Supplier[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  /** Devuelve `true` si se guardó. */
  const create = useCallback(
    async (payload: SupplierPayload): Promise<boolean> => {
      setBusy(true);
      setError(null);

      try {
        const created = await suppliersService.create(payload);
        await onCreated(created);

        return true;
      } catch (caught) {
        setError({
          message:
            caught instanceof ApiError
              ? caught.message
              : 'Ocurrió un error inesperado. Intente de nuevo.',
          // Nombre repetido: el proveedor probablemente ya existe.
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
      setExisting(await suppliersService.list());
    } catch (caught) {
      setListError(
        caught instanceof ApiError ? caught.message : 'No se pudo cargar la lista de proveedores.',
      );
    }
  }, []);

  const hideExisting = useCallback(() => {
    setExisting(null);
    setListError(null);
  }, []);

  return { busy, error, existing, listError, create, showExisting, hideExisting };
}
