import type { Role } from '../../types/auth';

/**
 * Nombres, alcance y jerarquía de los roles para la pantalla. Lo que cada uno
 * puede hacer lo decide el servidor (backend/src/auth/permissions.ts); esto
 * solo lo explica y decide qué botones mostrar.
 */
export const ROLES: Role[] = ['ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA'];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  ENCARGADO: 'Encargado',
  CAJERO: 'Cajero',
  BODEGA: 'Bodega',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Administrador de la plataforma: todo, incluido el plan contratado.',
  ENCARGADO:
    'Dueño del negocio: todo el negocio, sus datos y logo, y los usuarios Cajero y Bodega.',
  CAJERO: 'Ventas y clientes; consulta productos sin modificarlos.',
  BODEGA: 'Inventario, kardex, pedidos a proveedor y reportes de inventario.',
};

/** Igual que `ROLE_RANK` del backend: un número mayor es un rango mayor. */
const ROLE_RANK: Record<Role, number> = { ADMIN: 3, ENCARGADO: 2, CAJERO: 1, BODEGA: 1 };

/** «Nadie da más poder del que tiene»: solo rangos menores (el Administrador, a todos). */
export function canManageRole(actor: Role, target: Role): boolean {
  return actor === 'ADMIN' || ROLE_RANK[actor] > ROLE_RANK[target];
}

/** Roles que `actor` puede asignar al crear o editar un usuario. */
export function manageableRoles(actor: Role): Role[] {
  return ROLES.filter((role) => canManageRole(actor, role));
}
