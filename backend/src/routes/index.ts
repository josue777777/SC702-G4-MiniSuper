import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { categoriesRouter } from './categories.routes.js';
import { healthRouter } from './health.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { productsRouter } from './products.routes.js';
import { profileRouter } from './profile.routes.js';
import { purchaseOrdersRouter } from './purchase-orders.routes.js';
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
apiRouter.use('/auth', authRouter); // HU-12 (cuenta única) y sesión mínima para HU-14
apiRouter.use('/profile', profileRouter); // HU-14
apiRouter.use('/products', productsRouter); // HU-01, HU-02, HU-03
apiRouter.use('/categories', categoriesRouter); // HU-04
apiRouter.use('/inventory', inventoryRouter); // HU-08, HU-09, HU-10
apiRouter.use('/suppliers', suppliersRouter); // HU-21
apiRouter.use('/purchase-orders', purchaseOrdersRouter); // HU-22, HU-24
