import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import { notFoundHandler } from './middleware/not-found.middleware.js';
import { apiRouter } from './routes/index.js';

/**
 * Construye la aplicación Express, pero NO la levanta.
 *
 * Separar `app.ts` (configuración) de `server.ts` (escuchar un puerto) permite
 * importar la aplicación en las pruebas y hacer peticiones sin abrir un puerto
 * real.
 */
export function createApp() {
  const app = express();

  // --- Seguridad y parseo ---------------------------------------------------
  app.disable('x-powered-by');
  // helmet(): cabeceras de seguridad HTTP.
  app.use(helmet());
  // cors(): solo el frontend indicado puede llamar a la API.
  app.use(cors({ origin: env.CORS_ORIGIN }));
  // JSON en el cuerpo de las peticiones (los formularios vendrán como JSON).
  app.use(express.json());

  // --- Rutas ----------------------------------------------------------------
  app.use('/api', apiRouter);

  // --- 404 y errores: SIEMPRE declarados al final ---------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
