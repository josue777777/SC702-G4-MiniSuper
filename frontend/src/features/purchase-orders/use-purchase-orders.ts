import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { purchaseOrdersService } from '../../services/purchase-orders.service';
import { suppliersService } from '../../services/suppliers.service';
import type {
  PurchaseOrder,
  PurchaseOrderPayload,
  PurchaseOrderSummary,
  ReceiveOrderPayload,
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

/** Estado de la pantalla de pedidos (HU-22, HU-24) y de sus entregas (HU-38). */
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

  /**
   * Corre una acción sobre el pedido abierto (HU-38): al terminar muestra el
   * pedido actualizado y refresca el historial (su estado cambió). Devuelve el
   * error para mostrarlo donde está el usuario, o `null` si salió bien.
   */
  const runOnOrder = useCallback(
    async (action: () => Promise<PurchaseOrder>, success: string): Promise<string | null> => {
      setBusy(true);
      setNotice(null);

      try {
        setSelected(await action());
        setNotice({ kind: 'success', text: success });
        await load(filter);

        return null;
      } catch (error) {
        return describeError(error);
      } finally {
        setBusy(false);
      }
    },
    [load, filter],
  );

  /** HU-38: adjuntar (o reemplazar) después la factura del proveedor de una entrega. */
  const attachInvoice = useCallback(
    (order: PurchaseOrder, receiptId: string, invoiceNumber: string, file: File) =>
      runOnOrder(
        () => purchaseOrdersService.attachInvoice(order.id, receiptId, file),
        `Factura del proveedor adjuntada a la entrega ${invoiceNumber}.`,
      ),
    [runOnOrder],
  );

  /**
   * HU-38: registra una entrega del pedido (factura, lo que llegó y sus lotes)
   * con la carga PENDIENTE, y adjunta el archivo de la factura si lo hay. La
   * carga al inventario se confirma aparte, en Movimientos (verificación de
   * dos pasos). Devuelve el error, o el id de la entrega registrada.
   */
  const registerDelivery = useCallback(
    async (
      order: PurchaseOrder,
      payload: ReceiveOrderPayload,
      invoice: File | null,
    ): Promise<{ error: string } | { receiptId: string }> => {
      setBusy(true);
      setNotice(null);

      try {
        let updated = await purchaseOrdersService.receive(order.id, { ...payload, loadNow: false });
        const receipt = updated.receipts.find(
          (candidate) => candidate.invoiceNumber === payload.invoiceNumber,
        );
        let text = `Entrega ${payload.invoiceNumber} registrada; la carga al inventario quedó pendiente.`;

        if (invoice !== null && receipt !== undefined) {
          try {
            updated = await purchaseOrdersService.attachInvoice(order.id, receipt.id, invoice);
          } catch (failure) {
            text = `${text} El archivo de la factura no se pudo adjuntar: ${describeError(failure)} Adjúntelo desde «Entregas».`;
          }
        }

        setSelected(updated);
        setNotice({ kind: 'success', text });
        await load(filter);

        return receipt === undefined
          ? { error: 'La entrega se registró, pero no se encontró para cargarla.' }
          : { receiptId: receipt.id };
      } catch (error) {
        return { error: describeError(error) };
      } finally {
        setBusy(false);
      }
    },
    [load, filter],
  );

  /** HU-38: dar por concluido un pedido que llegó en parte. */
  const concludeOrder = useCallback(
    (order: PurchaseOrder) =>
      runOnOrder(
        () => purchaseOrdersService.close(order.id),
        `Pedido ${formatOrderNumber(order.number)} concluido.`,
      ),
    [runOnOrder],
  );

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
    attachInvoice,
    registerDelivery,
    concludeOrder,
    dismissNotice,
  };
}
