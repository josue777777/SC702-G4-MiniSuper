import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';

/**
 * HU-11: la API del negocio no responde sin la sesión del dueño. Se monta el
 * árbol REAL de rutas; sin cookie válida el guard responde antes de tocar la base.
 */

const ORIGIN = 'http://localhost:5173';
const FORGED = 'ms_session=eyJ1aWQiOiJ4In0.firma-falsa';

/** Una ruta por cada operación de los routers protegidos. */
const PROTECTED: [method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string][] = [
  ['get', '/api/products'],
  ['get', '/api/products/export'],
  ['get', '/api/products/form-options'],
  ['post', '/api/products'],
  ['patch', '/api/products/x'],
  ['patch', '/api/products/x/deactivate'],
  ['patch', '/api/products/x/activate'],
  ['delete', '/api/products/x'],
  ['get', '/api/products/x/image'],
  ['put', '/api/products/x/image'],
  ['delete', '/api/products/x/image'],
  ['get', '/api/categories'],
  ['post', '/api/categories'],
  ['get', '/api/inventory/counts'],
  ['post', '/api/inventory/counts'],
  ['get', '/api/inventory/low-stock'],
  ['get', '/api/inventory/products'],
  ['patch', '/api/inventory/products/x/min-stock'],
  ['patch', '/api/inventory/products/x/expiration-date'],
  ['get', '/api/inventory/expirations'],
  ['get', '/api/sales'],
  ['get', '/api/sales/lookup'],
  ['get', '/api/sales/x'],
  ['post', '/api/sales'],
  ['get', '/api/customers'],
  ['post', '/api/customers'],
  ['get', '/api/suppliers'],
  ['post', '/api/suppliers'],
  ['patch', '/api/suppliers/x'],
  ['get', '/api/purchase-orders'],
  ['get', '/api/purchase-orders/x'],
  ['post', '/api/purchase-orders'],
  ['get', '/api/profile'],
  ['patch', '/api/profile'],
  ['get', '/api/business'],
  ['put', '/api/business'],
  ['put', '/api/business/logo'],
  ['delete', '/api/business/logo'],
  ['put', '/api/business/plan'],
  ['get', '/api/profile/preferences'],
  ['put', '/api/profile/preferences'],
  ['get', '/api/users'],
  ['post', '/api/users'],
  ['patch', '/api/users/x'],
  ['post', '/api/users/x/deactivate'],
  ['post', '/api/users/x/activate'],
  ['post', '/api/users/x/reset-password'],
];

let app: express.Express;

beforeAll(async () => {
  // El árbol real lee la configuración al importarse; sin `.env` (CI) basta un
  // valor de relleno: estas peticiones nunca llegan a la base de datos.
  process.env['DATABASE_URL'] ??= 'postgresql://sin:base@localhost:1/no_se_usa';
  process.env['CORS_ORIGIN'] ??= ORIGIN;

  const { apiRouter } = await import('./index.js');

  app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);
});

describe('API protegida por sesión (HU-11)', () => {
  it.each(PROTECTED)('%s %s responde 401 sin sesión', async (method, path) => {
    const response = await request(app)[method](path).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/Inicie sesión/);
  });

  it.each(PROTECTED)('%s %s responde 401 con una cookie falsificada', async (method, path) => {
    const response = await request(app)[method](path).set('Cookie', FORGED).send({});

    expect(response.status).toBe(401);
  });

  it('un cambio pedido desde otro origen se rechaza con 403', async () => {
    const response = await request(app)
      .post('/api/sales')
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Cookie', FORGED)
      .send({});

    expect(response.status).toBe(403);
  });

  it('el estado del servicio y el acceso siguen siendo públicos', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/auth/session')).status).toBe(401);
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});
