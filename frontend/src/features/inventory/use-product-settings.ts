import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import type { ExpirationAlert, ProductStockSettings } from '../../types/inventory';
import type { Notice } from '../products/use-products';

interface SettingsState {
  phase: 'loading' | 'ready' | 'failed';
  products: ProductStockSettings[];
  expirations: ExpirationAlert[];
  message?: string;
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/**
 * Estado de la sección "Mínimos y vencimientos" (HU-08, HU-09): la
 * configuración de cada producto activo y la lista de vencidos / por vencer.
 * Después de guardar se recargan las dos, porque la lista depende de las fechas.
 */
export function useProductSettings() {
  const [state, setState] = useState<SettingsState>({
    phase: 'loading',
    products: [],
    expirations: [],
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [products, expirations] = await Promise.all([
        inventoryService.listProductSettings(),
        inventoryService.listExpirations(),
      ]);

      setState({ phase: 'ready', products, expirations });
    } catch (error) {
      setState({ phase: 'failed', products: [], expirations: [], message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (action: () => Promise<ProductStockSettings>, successText: string): Promise<boolean> => {
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

  /** HU-08. */
  const saveMinStock = useCallback(
    (productId: string, minStock: number) =>
      save(
        () => inventoryService.updateMinStock(productId, minStock),
        minStock === 0
          ? 'Mínimo eliminado: el producto ya no genera alertas de stock bajo.'
          : `Stock mínimo guardado: se alertará cuando queden ${minStock} unidades o menos.`,
      ),
    [save],
  );

  /** HU-09. `null` quita la fecha. */
  const saveExpirationDate = useCallback(
    (productId: string, expirationDate: string | null) =>
      save(
        () => inventoryService.updateExpirationDate(productId, expirationDate),
        expirationDate === null
          ? 'Fecha de vencimiento eliminada.'
          : 'Fecha de vencimiento guardada.',
      ),
    [save],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { ...state, notice, busy, reload: load, saveMinStock, saveExpirationDate, dismissNotice };
}
