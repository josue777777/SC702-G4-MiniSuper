import { createApp } from './app.js';
import { env } from './config/env.js';
import { disconnectPrisma } from './config/prisma.js';

/**
 * Punto de entrada: levanta el servidor HTTP en el puerto indicado por
 * la variable de entorno PORT.
 */
const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅ API de MiniSuper escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`   Health:  http://localhost:${env.PORT}/api/health`);
});

/**
 * Apagado ordenado: deja de aceptar peticiones y cierra el pool de conexiones
 * antes de terminar el proceso (Ctrl+C, `docker compose down`, reinicio del
 * servicio…). Sin esto, la base de datos puede quedarse con sesiones colgadas.
 */
function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} recibido: cerrando el servidor…`);

  server.close(() => {
    void disconnectPrisma().finally(() => {
      process.exit(0);
    });
  });

  // Si en 10 s no terminan las peticiones en curso, se fuerza la salida.
  setTimeout(() => {
    console.error('No se pudo cerrar en 10 s. Salida forzada.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
