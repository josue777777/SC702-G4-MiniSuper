/** Contratos de la cuenta del dueño y su perfil (HU-12, HU-14). Reflejan backend/src/types/auth.ts. */

export interface SetupStatus {
  configured: boolean;
  tokenRequired: boolean;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
}

export interface SetupPayload {
  name: string;
  email: string;
  password: string;
  setupToken?: string;
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
