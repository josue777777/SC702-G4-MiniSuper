import { Router } from 'express';
import { healthRouter } from './health.routes.js';

/**
 * Árbol de rutas de la API. Todo lo publicado cuelga de `/api`
 * (ver `src/app.ts`).
 *
 * Cada historia de usuario nueva añade aquí su router:
 *   import { productsRouter } from './products.routes.js';
 *   apiRouter.use('/products', productsRouter);            // HU-01 … HU-05
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
