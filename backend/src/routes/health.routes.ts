import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';
import { HealthRepository } from '../repositories/health.repository.js';
import { HealthService } from '../services/health.service.js';

/**
 * Composición de dependencias de este módulo: es el único lugar donde se
 * construyen las capas del flujo, y así se pueden sustituir en las pruebas.
 */
const healthRepository = new HealthRepository();
const healthService = new HealthService(healthRepository);
const healthController = new HealthController(healthService);

export const healthRouter = Router();

healthRouter.get('/', (req, res) => healthController.getStatus(req, res));

healthRouter.get('/database', (req, res) => healthController.getDatabaseStatus(req, res));
