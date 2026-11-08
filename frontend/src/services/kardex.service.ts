import type {
  KardexDirection,
  KardexEntryPayload,
  KardexExitPayload,
  KardexMovementPage,
  KardexProduct,
  KardexProductOption,
  KardexRecentPage,
  KardexStockLot,
} from '../types/kardex';
import { apiGet, apiPost } from './api-client';

interface DataResponse<T> {
  data: T;
}

/**
 * Kardex (HU-31): ficha e historial de movimientos de un producto. Solo lectura;
 * es el único punto por el que la pantalla habla con `/api/kardex`.
 */
export const kardexService = {
  /** Productos para elegir, por nombre o código. Incluye los desactivados. */
  async searchProducts(search: string): Promise<KardexProductOption[]> {
    const query = search === '' ? '' : `?${new URLSearchParams({ search }).toString()}`;

    return (await apiGet<DataResponse<KardexProductOption[]>>(`/api/kardex/products${query}`)).data;
  },

  /** Ficha del producto. 404 si no existe (o es de otro negocio). */
  async getProduct(productId: string): Promise<KardexProduct> {
    return (
      await apiGet<DataResponse<KardexProduct>>(
        `/api/kardex/products/${encodeURIComponent(productId)}`,
      )
    ).data;
  },

  /** Una página del historial, del movimiento más reciente al más antiguo. */
  async listMovements(
    productId: string,
    page: number,
    pageSize: number,
    direction: KardexDirection = 'all',
  ): Promise<KardexMovementPage> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      direction,
    });

    return (
      await apiGet<DataResponse<KardexMovementPage>>(
        `/api/kardex/products/${encodeURIComponent(productId)}/movements?${query.toString()}`,
      )
    ).data;
  },

  /** Vista general: los últimos movimientos de todos los productos y el resumen de hoy. */
  async listRecentMovements(page: number, pageSize: number): Promise<KardexRecentPage> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });

    return (
      await apiGet<DataResponse<KardexRecentPage>>(`/api/kardex/movements?${query.toString()}`)
    ).data;
  },

  /** Lotes con unidades del producto, del que vence primero (para un egreso). */
  async listStockLots(productId: string): Promise<KardexStockLot[]> {
    return (
      await apiGet<DataResponse<KardexStockLot[]>>(
        `/api/kardex/products/${encodeURIComponent(productId)}/lots`,
      )
    ).data;
  },

  /** HU-38 — ingreso sin pedido (compra directa). Devuelve la ficha con el stock nuevo. */
  async registerEntry(productId: string, payload: KardexEntryPayload): Promise<KardexProduct> {
    return (
      await apiPost<DataResponse<KardexProduct>>(
        `/api/kardex/products/${encodeURIComponent(productId)}/entries`,
        payload,
      )
    ).data;
  },

  /** HU-38 — egreso de un lote (salida que no es venta). Devuelve la ficha con el stock nuevo. */
  async registerExit(productId: string, payload: KardexExitPayload): Promise<KardexProduct> {
    return (
      await apiPost<DataResponse<KardexProduct>>(
        `/api/kardex/products/${encodeURIComponent(productId)}/exits`,
        payload,
      )
    ).data;
  },
};
