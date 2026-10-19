/** Contratos del acceso del dueño (HU-12, HU-14) y de la sesión mínima que ambas usan. */

/** Estado de la configuración inicial: lo consulta el frontend antes de mostrar pantallas. */
export interface SetupStatusDto {
  /** `true` cuando ya existe la cuenta del dueño. */
  configured: boolean;
  /** `true` cuando el administrador definió un token de configuración inicial. */
  tokenRequired: boolean;
}

/** Datos del dueño que expone la API. Nunca incluye el hash de la contraseña. */
export interface ProfileDto {
  id: string;
  name: string;
  email: string;
}

/** Registro completo del dueño: solo lo ven repositorio y services. */
export interface UserRecord extends ProfileDto {
  passwordHash: string;
}

/** Campos del alta de la cuenta del dueño (la contraseña ya viene con hash). */
export interface CreateOwnerFields {
  name: string;
  email: string;
  passwordHash: string;
}

/** Cambios que el dueño puede hacer a su perfil. */
export interface UpdateProfileFields {
  name?: string;
  email?: string;
  passwordHash?: string;
}
