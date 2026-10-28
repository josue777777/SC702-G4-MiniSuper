import { Router } from 'express';
import { UsersController } from '../controllers/users.controller.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { UsersService } from '../services/users.service.js';

/**
 * Configuración › Usuarios. La sesión, la contraseña cambiada y el permiso
 * `users.manage` (Administrador y Encargado) los exige `routes/index.ts` al
 * montarlo; la jerarquía de rangos la aplica el service.
 */
export function createUsersRouter(repository: UsersRepository): Router {
  const controller = new UsersController(new UsersService(repository));
  const router = Router();

  // Las respuestas pueden traer una contraseña temporal: el navegador no las guarda.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));
  router.patch('/:id', (req, res) => controller.update(req, res));
  router.post('/:id/deactivate', (req, res) => controller.deactivate(req, res));
  router.post('/:id/activate', (req, res) => controller.activate(req, res));
  router.post('/:id/reset-password', (req, res) => controller.resetPassword(req, res));

  return router;
}

export const usersRouter = createUsersRouter(new UsersRepository());
