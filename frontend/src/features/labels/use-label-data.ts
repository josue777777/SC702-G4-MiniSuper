import { useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { businessService } from '../../services/business.service';
import { labelsService } from '../../services/labels.service';
import { productsService } from '../../services/products.service';
import type { LabelDesign } from '../../types/labels';
import type { Product } from '../../types/products';
import type { LabelBusiness } from './ProductLabel';

export type LabelDataState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      /** Solo los activos: lo desactivado ya no se vende ni se rotula. */
      products: Product[];
      business: LabelBusiness;
      design: LabelDesign;
    };

/**
 * Carga lo que necesita la ventana de etiquetas (HU-07), todo a la vez:
 *   1. los productos (`GET /api/products`);
 *   2. el nombre y el logo del negocio (`GET /api/business` y su logo);
 *   3. el diseño guardado (`GET /api/business/label-design`).
 *
 * @returns El estado de la carga y `setDesign`, para mostrar al momento un diseño
 *   recién guardado sin volver a pedirlo.
 */
export function useLabelData(): {
  state: LabelDataState;
  setDesign: (design: LabelDesign) => void;
} {
  const [state, setState] = useState<LabelDataState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [products, business, design] = await Promise.all([
          productsService.list(),
          businessService.get(),
          labelsService.getDesign(),
        ]);
        const logo =
          business.logoUrl === null ? null : await businessService.logoDataUrl(business.logoUrl);

        if (!cancelled) {
          setState({
            phase: 'ready',
            products: products.filter((product) => product.isActive),
            business: { name: business.name, logo },
            design,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : 'No se pudieron cargar los datos de las etiquetas.',
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    state,
    setDesign: (design) =>
      setState((current) => (current.phase === 'ready' ? { ...current, design } : current)),
  };
}
