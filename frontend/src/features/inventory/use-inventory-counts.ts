import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { inventoryService } from '../../services/inventory.service';
import { productsService } from '../../services/products.service';
import type { InventoryCountPayload } from '../../types/inventory';
import type { Product } from '../../types/products';
import type { Notice } from '../products/use-products';
import { describeDifference } from './inventory-count';

/**
 * Estado de la sección de conteo físico (HU-10): productos para elegir, el
 * indicador de trabajo y el aviso al usuario. El historial no se carga aquí:
 * está en Reportes › Conteos.
 */
interface InventoryCountsState {
  phase: 'loading' | 'ready' | 'failed';
  /** Solo productos activos: son los que se pueden contar en el estante. */
  products: Product[];
  /** Explica el fallo de carga cuando `phase` es 'failed'. */
  message?: string;
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'Ocurrió un error inesperado. Intente de nuevo.';
}

export function useInventoryCounts() {
  const [state, setState] = useState<InventoryCountsState>({
    phase: 'loading',
    products: [],
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Carga los productos. Al refrescar después de un conteo
   * no se vuelve a mostrar "Cargando…", para que la pantalla no parpadee.
   */
  const load = useCallback(async () => {
    setState((current) =>
      current.phase === 'ready' ? current : { ...current, phase: 'loading', message: undefined },
    );

    try {
      const products = await productsService.list();

      setState({ phase: 'ready', products: products.filter((product) => product.isActive) });
    } catch (error) {
      setState({ phase: 'failed', products: [], message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * HU-10: confirma el conteo. Devuelve `true` si se guardó, para que el
   * formulario se limpie solo entonces. Después recarga: el stock del producto
   * ya muestra el ajuste.
   */
  const registerCount = useCallback(
    async (payload: InventoryCountPayload): Promise<boolean> => {
      setBusy(true);
      setNotice(null);

      try {
        const count = await inventoryService.createCount(payload);
        const difference = describeDifference(count.difference);

        setNotice({
          kind: 'success',
          text: `Conteo registrado para ${count.productName}: diferencia ${difference.value} (${difference.text}). El stock quedó en ${count.countedQuantity}.`,
        });
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

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { ...state, notice, busy, reload: load, registerCount, dismissNotice };
}
