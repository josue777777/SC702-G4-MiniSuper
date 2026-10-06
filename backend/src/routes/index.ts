import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { productsRouter } from './products.routes.js';

/**
 * Árbol de rutas de la API. Todo lo publicado cuelga de `/api`
 * (ver `src/app.ts`).
 *
 * Cada historia de usuario nueva añade aquí su router:
 *   import { categoryRouter } from './categories.routes.js';
 *   apiRouter.use('/categories', categoryRouter);          // HU-04
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/products', productsRouter); // HU-01, HU-02, HU-03
apiRouter.use('/inventory', inventoryRouter); // HU-10
