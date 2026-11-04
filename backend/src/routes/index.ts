import { Router } from 'express';
import { env } from '../config/env.js';
import {
  createRequireAuth,
  requireBusiness,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/require-auth.middleware.js';
import { createSameOriginGuard } from '../middleware/same-origin.middleware.js';
import { authRouter, authService } from './auth.routes.js';
import { businessRouter } from './business.routes.js';
import { categoriesRouter } from './categories.routes.js';
import { customersRouter } from './customers.routes.js';
import { healthRouter } from './health.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import {
  planRequestsRouter,
  platformAdminRouter,
  publicPlatformRouter,
} from './platform.routes.js';
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
 * `/platform/public` (el nombre del sistema para el login). Todo lo demás
 * exige, en este orden:
 *   1. una sesión válida (HU-11): sin cookie válida responde 401;
 *   2. que el usuario ya cambió su contraseña temporal: si no, 403;
 *   3. en los módulos de un negocio, que el usuario PERTENEZCA a uno (la
 *      plataforma no entra a los datos de sus clientes): si no, 403;
 *   4. el permiso de su rol para esa sección (`auth/permissions.ts`): si no, 403.
 * `sessionRequired` además rechaza peticiones con cambios que vengan de otro
 * origen (CSRF).
 *
 * Dentro de un negocio, cada repositorio se arma con el negocio de la sesión y
 * filtra todo por él (multi-negocio, ADR 0002). Un módulo nuevo del negocio se
 * monta así:
 *   apiRouter.use('/modulo', ...businessRequired, requirePermission('permiso'), router);
 */
export const apiRouter = Router();

export const sessionRequired = [
  createSameOriginGuard(env.CORS_ORIGIN),
  createRequireAuth(authService),
  requirePasswordChanged,
] as const;

/** Sesión de un usuario que pertenece a un negocio (no la plataforma). */
export const businessRequired = [...sessionRequired, requireBusiness] as const;

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter); // HU-11 (login), HU-15 (cierre)
apiRouter.use('/profile', profileRouter); // HU-14: protege su propia sesión; permite cambiar la contraseña temporal

// --- Plataforma (Administrador) -------------------------------------------
apiRouter.use('/platform/public', publicPlatformRouter); // solo el nombre del sistema, para el login
apiRouter.use(
  '/platform',
  ...sessionRequired,
  requirePermission('platform.manage'),
  platformAdminRouter,
); // negocios, planes, solicitudes y nombre del sistema
apiRouter.use('/users', ...sessionRequired, requirePermission('users.manage'), usersRouter); // Configuración › Usuarios (con jerarquía; cada uno ve lo suyo)

// --- Un negocio (Encargado, Cajero, Bodega) ----------------------------------
apiRouter.use('/business', ...businessRequired, businessRouter); // Configuración › General
apiRouter.use(
  '/plan-requests',
  ...businessRequired,
  requirePermission('plan.request'),
  planRequestsRouter,
); // el Encargado pide más usuarios
apiRouter.use(
  '/products',
  ...businessRequired,
  requirePermission('inventory.read', 'inventory.write'),
  productsRouter,
); // HU-01 … HU-05, HU-33
apiRouter.use(
  '/categories',
  ...businessRequired,
  requirePermission('inventory.read', 'inventory.write'),
  categoriesRouter,
); // HU-04
apiRouter.use(
  '/inventory',
  ...businessRequired,
  requirePermission('inventory.read', 'inventory.write'),
  inventoryRouter,
); // HU-08, HU-09, HU-10
apiRouter.use('/sales', ...businessRequired, requirePermission('sales'), salesRouter); // HU-16 … HU-18, HU-34, HU-35, HU-37
apiRouter.use('/customers', ...businessRequired, requirePermission('customers'), customersRouter); // HU-18, HU-36
apiRouter.use('/suppliers', ...businessRequired, requirePermission('purchasing'), suppliersRouter); // HU-21
apiRouter.use(
  '/purchase-orders',
  ...businessRequired,
  requirePermission('purchasing'),
  purchaseOrdersRouter,
); // HU-22, HU-24
