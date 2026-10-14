import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler.middleware.js';
import { FakeCategoriesRepository } from '../testing/categories.repository.fake.js';
import { createCategoriesRouter } from './categories.routes.js';

function buildApp(repository = new FakeCategoriesRepository()) {
  const app = express();
  app.use(express.json());
  app.use('/api/categories', createCategoriesRouter(repository));
  app.use(errorHandler);

  return { app, repository };
}

describe('GET /api/categories', () => {
  it('responde 200 con las categorías existentes dentro de data', async () => {
    const { app } = buildApp(
      new FakeCategoriesRepository([
        { id: '44444444-0000-4444-8444-444444444444', name: 'Bebidas', description: null, isActive: true },
      ]),
    );

    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [expect.objectContaining({ name: 'Bebidas' })] });
  });
});

describe('POST /api/categories', () => {
  it('responde 201 con la categoría creada dentro de data', async () => {
    const { app, repository } = buildApp();

    const response = await request(app)
      .post('/api/categories')
      .send({ name: '  Lácteos  ', description: 'Leche y quesos' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: expect.objectContaining({ name: 'Lácteos', description: 'Leche y quesos', isActive: true }),
    });
    expect(repository.createdFields).toEqual([{ name: 'Lácteos', description: 'Leche y quesos' }]);
  });

  it('guarda la descripción vacía u omitida como null', async () => {
    const { app, repository } = buildApp();

    await request(app).post('/api/categories').send({ name: 'Granos', description: '   ' });
    await request(app).post('/api/categories').send({ name: 'Bebidas' });

    expect(repository.createdFields.map((fields) => fields.description)).toEqual([null, null]);
  });

  it('responde 409 si el nombre ya existe, sin distinguir mayúsculas', async () => {
    const { app, repository } = buildApp(
      new FakeCategoriesRepository([
        { id: '44444444-0000-4444-8444-444444444444', name: 'Bebidas', description: null, isActive: true },
      ]),
    );

    const response = await request(app).post('/api/categories').send({ name: 'bebidas' });

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain('La categoría ya está registrada.');
    expect(repository.createdFields).toHaveLength(0);
  });

  it('responde 409 si otra petición se adelantó con el mismo nombre (P2002)', async () => {
    const { app, repository } = buildApp();
    repository.simulateRaceOnCreate = true;

    const response = await request(app).post('/api/categories').send({ name: 'Bebidas' });

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain('La categoría ya está registrada.');
  });

  it('responde 400 si el nombre falta o está vacío', async () => {
    const { app, repository } = buildApp();

    const missing = await request(app).post('/api/categories').send({});
    const blank = await request(app).post('/api/categories').send({ name: '   ' });

    expect(missing.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(repository.createdFields).toHaveLength(0);
  });
});
