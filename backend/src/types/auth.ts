import type { Permission, Role } from '../auth/permissions.js';

/** Contratos de los usuarios, sus roles y la sesión (HU-11 a HU-15). */

/** Datos básicos de un usuario que expone la API. Nunca incluye el hash de la contraseña. */
export interface ProfileDto {
  id: string;
  name: string;
  email: string;
}

/**
 * Usuario de la sesión: lo que el frontend necesita para armar el menú. Los
 * `permissions` son informativos; la API los vuelve a exigir en cada ruta.
 */
export interface SessionUserDto extends ProfileDto {
  role: Role;
  permissions: Permission[];
  /** Con una contraseña temporal, lo único permitido es cambiarla. */
  mustChangePassword: boolean;
}

/** Fila de la lista de Configuración › Usuarios. */
export interface UserListItemDto extends ProfileDto {
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

/** Registro completo: solo lo ven repositorio y services. */
export interface UserRecord extends ProfileDto {
  passwordHash: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  /** Sube al cerrar sesión (HU-15) o al cambiar rol/estado: los tokens con otra versión dejan de valer. */
  sessionVersion: number;
  createdAt: Date;
}

/** Alta de un usuario (la contraseña ya viene con hash). */
export interface CreateUserFields {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  mustChangePassword: boolean;
}

/** Cambios posibles sobre un usuario. `revokeSessions` cierra sus sesiones abiertas. */
export interface UpdateUserFields {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: Role;
  isActive?: boolean;
  mustChangePassword?: boolean;
  revokeSessions?: boolean;
}
