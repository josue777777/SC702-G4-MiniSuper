/**
 * Roles y permisos del sistema (HU-11 a HU-15, criterios de usuarios y roles).
 *
 * ÚNICO lugar donde se decide qué puede hacer cada rol. La API exige estos
 * permisos en cada ruta (`routes/index.ts`) y la sesión se los envía al
 * frontend, que solo los usa para mostrar u ocultar el menú: la seguridad real
 * está en el servidor. Agregar un módulo nuevo es agregar su permiso aquí y
 * asignarlo a los roles que correspondan.
 *
 * Además hay JERARQUÍA (`ROLE_RANK`): Administrador (la plataforma) > Encargado
 * (dueño del negocio) > Cajero y Bodega. Quien administra usuarios solo puede
 * hacerlo con rangos menores al suyo (`canManageRole`).
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
  /** Datos del negocio: nombre, logo, contacto y comprobante (Configuración › General). */
  'business.edit',
  /** Crear y administrar usuarios, siempre de un rango menor al propio (ver `canManageRole`). */
  'users.manage',
  /** Límite de usuarios del plan contratado. Solo el administrador de la plataforma. */
  'plan.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** El Encargado es el dueño del negocio: todo, menos el plan contratado. */
const BUSINESS_OWNER: readonly Permission[] = PERMISSIONS.filter(
  (permission) => permission !== 'plan.manage',
);

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  ENCARGADO: BUSINESS_OWNER,
  CAJERO: ['sales', 'customers', 'inventory.read'],
  BODEGA: ['inventory.read', 'inventory.write', 'kardex', 'purchasing', 'reports.inventory'],
};

/**
 * Jerarquía: un número mayor es un rango mayor. Cajero y Bodega están al mismo
 * nivel (hacen trabajos distintos, ninguno manda sobre el otro).
 */
export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 3,
  ENCARGADO: 2,
  CAJERO: 1,
  BODEGA: 1,
};

/**
 * Regla «nadie da más poder del que tiene»: solo se administra (crear, editar,
 * desactivar, restablecer, asignar) a roles de rango MENOR al propio. El
 * Administrador es la excepción: administra a todos, incluso a otros
 * administradores (la regla del último administrador activo lo protege).
 */
export function canManageRole(actor: Role, target: Role): boolean {
  return actor === 'ADMIN' || ROLE_RANK[actor] > ROLE_RANK[target];
}

/** Roles que `actor` puede asignar y administrar, en el orden de `ROLES`. */
export function manageableRoles(actor: Role): Role[] {
  return hasPermission(actor, 'users.manage')
    ? ROLES.filter((role) => canManageRole(actor, role))
    : [];
}

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
