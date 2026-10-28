import { Router } from 'express';
import { env } from '../config/env.js';
import {
  createRequireAuth,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { authRouter, authService } from './auth.routes.js';
import { businessRouter, publicBusinessRouter } from './business.routes.js';
import { categoriesRouter } from './categories.routes.js';
import { customersRouter } from './customers.routes.js';
import { healthRouter } from './health.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { productsRouter } from './products.routes.js';
import { profileRouter } from './profile.routes.js';
import { purchaseOrdersRouter } from './purchase-orders.routes.js';
import { salesRouter } from './sales.routes.js';
import { suppliersRouter } from './suppliers.routes.js';
import { usersRouter } from './users.routes.js';

/**
 * Árbol de rutas de la API. Todo lo publicado cuelga de `/api`
 * (ver `src/app.ts`).
 *
 * Solo son públicos `/health`, `/auth` (login, sesión y cierre) y
 * `/business/public` (el nombre del negocio para el login). Todo lo demás
 * exige, en este orden:
 *   1. una sesión válida (HU-11): sin cookie válida responde 401;
 *   2. que el usuario ya cambió su contraseña temporal: si no, 403;
 *   3. el permiso de su rol para esa sección (`auth/permissions.ts`): si no, 403.
 * `sessionRequired` además rechaza peticiones con cambios que vengan de otro
 * origen (CSRF).
 *
 * Cada módulo nuevo se monta igual, con su permiso:
 *   apiRouter.use('/modulo', ...sessionRequired, requirePermission('permiso'), router);
 */
export const apiRouter = Router();

export const sessionRequired = [
  createSameOriginGuard(env.CORS_ORIGIN),
  createRequireAuth(authService),
  requirePasswordChanged,
] as const;

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter); // HU-11 (login), HU-15 (cierre)
apiRouter.use('/business/public', publicBusinessRouter); // solo el nombre, para el login
apiRouter.use('/business', ...sessionRequired, businessRouter); // Configuración › General: leer cualquier rol; cambiar Administrador y Encargado
apiRouter.use('/profile', profileRouter); // HU-14: protege su propia sesión; permite cambiar la contraseña temporal
apiRouter.use(
  '/products',
  ...sessionRequired,
  requirePermission('inventory.read', 'inventory.write'),
  productsRouter,
); // HU-01 … HU-05, HU-33
apiRouter.use(
  '/categories',
  ...sessionRequired,
  requirePermission('inventory.read', 'inventory.write'),
  categoriesRouter,
); // HU-04
apiRouter.use(
  '/inventory',
  ...sessionRequired,
  requirePermission('inventory.read', 'inventory.write'),
  inventoryRouter,
); // HU-08, HU-09, HU-10
apiRouter.use('/sales', ...sessionRequired, requirePermission('sales'), salesRouter); // HU-16 … HU-18, HU-34, HU-35, HU-37
apiRouter.use('/customers', ...sessionRequired, requirePermission('customers'), customersRouter); // HU-18, HU-36
apiRouter.use('/suppliers', ...sessionRequired, requirePermission('purchasing'), suppliersRouter); // HU-21
apiRouter.use(
  '/purchase-orders',
  ...sessionRequired,
  requirePermission('purchasing'),
  purchaseOrdersRouter,
); // HU-22, HU-24
apiRouter.use('/users', ...sessionRequired, requirePermission('users.manage'), usersRouter); // Configuración › Usuarios (con jerarquía)
