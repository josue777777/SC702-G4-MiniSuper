import { Router } from 'express';
import { env } from '../config/env.js';
import { createRequireAuth } from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { authRouter, authService } from './auth.routes.js';
import { categoriesRouter } from './categories.routes.js';
import { customersRouter } from './customers.routes.js';
import { healthRouter } from './health.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { productsRouter } from './products.routes.js';
import { profileRouter } from './profile.routes.js';
import { purchaseOrdersRouter } from './purchase-orders.routes.js';
import { salesRouter } from './sales.routes.js';
import { suppliersRouter } from './suppliers.routes.js';

/**
 * Árbol de rutas de la API. Todo lo publicado cuelga de `/api`
 * (ver `src/app.ts`).
 *
 * Solo son públicos `/health` y `/auth` (configuración inicial, login, sesión y
 * cierre). Todo lo demás exige la sesión del dueño (HU-11): sin cookie válida
 * responde 401 antes de llegar al controller. `sessionRequired` además rechaza
 * peticiones con cambios que vengan de otro origen (CSRF).
 *
 * Cada historia de usuario nueva añade aquí su router, protegido:
 *   apiRouter.use('/categories', ...sessionRequired, categoriesRouter); // HU-04
 */
export const apiRouter = Router();

export const sessionRequired = [
  createSameOriginGuard(env.CORS_ORIGIN),
  createRequireAuth(authService),
] as const;

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter); // HU-11 (login), HU-12 (cuenta única) y HU-15 (cierre)
apiRouter.use('/profile', profileRouter); // HU-14 (protege su propia sesión)
apiRouter.use('/products', ...sessionRequired, productsRouter); // HU-01, HU-02, HU-03
apiRouter.use('/categories', ...sessionRequired, categoriesRouter); // HU-04
apiRouter.use('/inventory', ...sessionRequired, inventoryRouter); // HU-08, HU-09, HU-10
apiRouter.use('/sales', ...sessionRequired, salesRouter); // HU-16, HU-17, HU-18, HU-34
apiRouter.use('/customers', ...sessionRequired, customersRouter); // HU-18 (cliente básico)
apiRouter.use('/suppliers', ...sessionRequired, suppliersRouter); // HU-21
apiRouter.use('/purchase-orders', ...sessionRequired, purchaseOrdersRouter); // HU-22, HU-24
