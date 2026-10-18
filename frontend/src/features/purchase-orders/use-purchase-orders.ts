import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import { suppliersService } from '../../services/suppliers.service';
import type {
  PurchaseOrder,
  PurchaseOrderPayload,
  PurchaseOrderSummary,
} from '../../types/purchase-orders';
import type { Supplier } from '../../types/suppliers';
import type { Notice } from '../products/use-products';
import { formatOrderNumber } from './purchase-order-form';

interface PurchaseOrdersState {
  phase: 'loading' | 'ready' | 'failed';
  /** Proveedores activos: a quién se le puede hacer un pedido. */
  suppliers: Supplier[];
  orders: PurchaseOrderSummary[];
  message?: string;
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** Estado de la pantalla de pedidos (HU-22, HU-24). */
export function usePurchaseOrders() {
  const [state, setState] = useState<PurchaseOrdersState>({
    phase: 'loading',
    suppliers: [],
    orders: [],
  });
  /** Proveedor elegido en el filtro del historial; `''` = todos. */
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (supplierId: string) => {
    try {
      const [suppliers, orders] = await Promise.all([
        suppliersService.list(),
        purchaseOrdersService.list(supplierId === '' ? undefined : supplierId),
      ]);

      setState({
        phase: 'ready',
        suppliers: suppliers.filter((supplier) => supplier.isActive),
        orders,
      });
    } catch (error) {
      setState({ phase: 'failed', suppliers: [], orders: [], message: describeError(error) });
    }
  }, []);

  // HU-22: el filtro vuelve a pedir el historial a la API sin recargar la página.
  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  const createOrder = useCallback(
    async (payload: PurchaseOrderPayload): Promise<boolean> => {
      setBusy(true);
      setNotice(null);

      try {
        const created = await purchaseOrdersService.create(payload);
        // Se abre el pedido recién guardado para imprimirlo o guardarlo en PDF.
        setSelected(created);
        setNotice({
          kind: 'success',
          text: `Pedido ${formatOrderNumber(created.number)} guardado en el historial.`,
        });
        await load(filter);

        return true;
      } catch (error) {
        setNotice({ kind: 'error', text: describeError(error) });

        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, filter],
  );

  const openOrder = useCallback(async (id: string) => {
    setBusy(true);
    setNotice(null);

    try {
      setSelected(await purchaseOrdersService.get(id));
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const closeOrder = useCallback(() => setSelected(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const reload = useCallback(() => load(filter), [load, filter]);

  return {
    ...state,
    filter,
    setFilter,
    selected,
    notice,
    busy,
    reload,
    createOrder,
    openOrder,
    closeOrder,
    dismissNotice,
  };
}
