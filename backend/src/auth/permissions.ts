/**
 * Roles y permisos del sistema (HU-11 a HU-15, criterios de usuarios y roles).
 *
 * ÚNICO lugar donde se decide qué puede hacer cada rol. La API exige estos
 * permisos en cada ruta (`routes/index.ts`) y la sesión se los envía al
 * frontend, que solo los usa para mostrar u ocultar el menú: la seguridad real
 * está en el servidor. Agregar un módulo nuevo es agregar su permiso aquí y
 * asignarlo a los roles que correspondan.
 */

export const ROLES = ['ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA'] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  /** Ventas, caja y comprobantes (HU-16 a HU-18, HU-34, HU-35). */
  'sales',
  /** Clientes y fiado (HU-18, HU-19, HU-36). */
  'customers',
  /** Consultar productos, categorías y alertas de inventario. */
  'inventory.read',
  /** Crear, modificar y desactivar productos; mínimos, vencimientos y conteo físico. */
  'inventory.write',
  /** Movimientos de inventario con su saldo (HU-31). */
  'kardex',
  /** Pedidos a proveedor y proveedores (HU-21 a HU-24, HU-38, HU-39). */
  'purchasing',
  /** Reportes de inventario: stock, stock bajo, vencimientos (HU-25 a HU-27). */
  'reports.inventory',
  /** Reportes de ventas, ganancias y deudas (HU-28 a HU-30). */
  'reports.sales',
  /** Configuración: usuarios y datos del negocio. Solo el administrador. */
  'settings',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Todo lo del negocio. El Encargado lo tiene completo; el Administrador, además, la Configuración. */
const BUSINESS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => permission !== 'settings',
);

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  ENCARGADO: BUSINESS,
  CAJERO: ['sales', 'customers', 'inventory.read'],
  BODEGA: ['inventory.read', 'inventory.write', 'kardex', 'purchasing', 'reports.inventory'],
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  ENCARGADO: 'Encargado',
  CAJERO: 'Cajero',
  BODEGA: 'Bodega',
};

export function permissionsOf(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
