import type { Role } from '../../types/auth';

/**
 * Nombres y alcance de cada rol para la pantalla. Qué puede hacer cada uno lo
 * decide el servidor (backend/src/auth/permissions.ts); esto solo lo explica.
 */
export const ROLES: Role[] = ['ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA'];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  ENCARGADO: 'Encargado',
  CAJERO: 'Cajero',
  BODEGA: 'Bodega',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Todo el sistema, incluida la Configuración (usuarios).',
  ENCARGADO: 'Todo el negocio, menos la Configuración.',
  CAJERO: 'Ventas y clientes; consulta productos sin modificarlos.',
  BODEGA: 'Inventario, kardex, pedidos a proveedor y reportes de inventario.',
};
