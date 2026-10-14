import { Router } from 'express';
import { categoriesRouter } from './categories.routes.js';
import { healthRouter } from './health.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { productsRouter } from './products.routes.js';
import { suppliersRouter } from './suppliers.routes.js';

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
apiRouter.use('/categories', categoriesRouter); // HU-04
apiRouter.use('/inventory', inventoryRouter); // HU-08, HU-09, HU-10
apiRouter.use('/suppliers', suppliersRouter); // HU-21
