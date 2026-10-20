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
  // `credentials`: el navegador envía la cookie de sesión al frontend autorizado.
  // `exposedHeaders`: el frontend lee el nombre del archivo de las descargas (HU-33).
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  // JSON en el cuerpo de las peticiones (los formularios vendrán como JSON).
  app.use(express.json());

  // Las respuestas de la API traen datos privados del negocio: el navegador no
  // las guarda, así que «Atrás» tras cerrar sesión no las vuelve a mostrar (HU-15).
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // --- Rutas ----------------------------------------------------------------
  app.use('/api', apiRouter);

  // --- 404 y errores: SIEMPRE declarados al final ---------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
