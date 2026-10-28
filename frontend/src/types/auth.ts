/**
 * Contratos de usuarios, roles y perfil (HU-11 a HU-15, criterios de usuarios y
 * roles). Reflejan backend/src/types/auth.ts y backend/src/auth/permissions.ts.
 */

export type Role = 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'BODEGA';

/** Permisos que el servidor asigna a cada rol. El frontend solo los usa para mostrar u ocultar. */
export type Permission =
  | 'sales'
  | 'customers'
  | 'inventory.read'
  | 'inventory.write'
  | 'kardex'
  | 'purchasing'
  | 'reports.inventory'
  | 'reports.sales'
  | 'business.edit'
  | 'users.manage'
  | 'plan.request'
  | 'platform.manage';

/** Usuario de la sesión, con su rol y lo que puede hacer. */
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Negocio del usuario; `null` para los administradores de la plataforma. */
  businessId: string | null;
  permissions: Permission[];
  /** `true` con una contraseña temporal: debe cambiarla antes de usar el sistema. */
  mustChangePassword: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/** Solo viajan los campos que cambiaron. */
export interface ProfileUpdatePayload {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

/** Fila de Configuración › Usuarios. */
export interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Negocio del usuario (la plataforma lo ve al listar Encargados). */
  businessName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: Role;
  /** Solo la plataforma, al crear un Encargado: de qué negocio es. */
  businessId?: string;
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'businessId'>>;

/** Respuesta al crear o restablecer: la contraseña temporal se muestra UNA vez. */
export interface UserWithTemporaryPassword {
  user: UserListItem;
  temporaryPassword: string;
}
