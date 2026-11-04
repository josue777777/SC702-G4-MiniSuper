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
  /** Negocio al que pertenece; `null` para los administradores de la plataforma. */
  businessId: string | null;
  permissions: Permission[];
  /** Con una contraseña temporal, lo único permitido es cambiarla. */
  mustChangePassword: boolean;
}

/** Fila de la lista de Configuración › Usuarios. */
export interface UserListItemDto extends ProfileDto {
  role: Role;
  /** Nombre de su negocio (lo ve el Administrador al listar Encargados). */
  businessName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

/** Registro completo: solo lo ven repositorio y services. */
export interface UserRecord extends ProfileDto {
  passwordHash: string;
  role: Role;
  /** `null` para los administradores de la plataforma. */
  businessId: string | null;
  businessName: string | null;
  /** Un negocio suspendido no deja entrar a nadie de él. */
  businessStatus: BusinessStatus | null;
  isActive: boolean;
  mustChangePassword: boolean;
  /** Sube al cerrar sesión (HU-15) o al cambiar rol/estado: los tokens con otra versión dejan de valer. */
  sessionVersion: number;
  createdAt: Date;
}

/** Alta de un usuario (la contraseña ya viene con hash). */
export interface CreateUserFields {
  /** `null` solo para administradores de la plataforma (lo exige un CHECK en la base). */
  businessId: string | null;
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

/** Resultado de una operación que ocupa un cupo del plan. */
export type PlanFull = { status: 'plan-full'; maxUsers: number };

/** Quién hace la operación en Configuración › Usuarios (sale de la sesión, nunca del navegador). */
export interface UserActor {
  id: string;
  role: Role;
  /** Negocio de quien opera; `null` si es un administrador de la plataforma. */
  businessId: string | null;
}

export type BusinessStatus = 'ACTIVE' | 'SUSPENDED';

/** Qué usuarios listar: los de un negocio, o (plataforma) los de ciertos roles. */
export interface UserListFilter {
  businessId?: string;
  roles?: Role[];
}
