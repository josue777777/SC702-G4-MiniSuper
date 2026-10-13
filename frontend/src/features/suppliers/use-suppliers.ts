import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { productsService } from '../../services/products.service';
import { suppliersService } from '../../services/suppliers.service';
import type { Product } from '../../types/products';
import type { Supplier, SupplierPayload } from '../../types/suppliers';
import type { Notice } from '../products/use-products';

interface SuppliersState {
  phase: 'loading' | 'ready' | 'failed';
  suppliers: Supplier[];
  /** Productos activos que se pueden asociar a un proveedor. */
  products: Product[];
  message?: string;
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** Estado de la pantalla de proveedores (HU-21). */
export function useSuppliers() {
  const [state, setState] = useState<SuppliersState>({
    phase: 'loading',
    suppliers: [],
    products: [],
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [suppliers, products] = await Promise.all([
        suppliersService.list(),
        productsService.list(),
      ]);

      setState({
        phase: 'ready',
        suppliers,
        products: products.filter((product) => product.isActive),
      });
    } catch (error) {
      setState({ phase: 'failed', suppliers: [], products: [], message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<Supplier>, successText: string): Promise<boolean> => {
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

  const createSupplier = useCallback(
    (payload: SupplierPayload) =>
      run(() => suppliersService.create(payload), 'Proveedor registrado correctamente.'),
    [run],
  );

  const updateSupplier = useCallback(
    (id: string, payload: SupplierPayload) =>
      run(() => suppliersService.update(id, payload), 'Proveedor actualizado correctamente.'),
    [run],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { ...state, notice, busy, reload: load, createSupplier, updateSupplier, dismissNotice };
}
