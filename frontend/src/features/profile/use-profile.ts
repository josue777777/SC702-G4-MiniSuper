import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { profileService } from '../../services/auth.service';
import type { Profile, ProfileUpdatePayload } from '../../types/auth';
import { useSession } from '../auth/session-context';

export type ProfilePhase = 'loading' | 'ready' | 'unauthenticated' | 'error';

/** Resultado de guardar: errores por campo del backend (si los hay) y mensaje general. */
export interface SaveFailure {
  message: string;
  details: unknown;
}

/** Estado de la pantalla de perfil (HU-14): carga, sesión vencida y guardado. */
export function useProfile() {
  const { setUser } = useSession();
  const [phase, setPhase] = useState<ProfilePhase>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setProfile(await profileService.get());
      setPhase('ready');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setPhase('unauthenticated');
        return;
      }

      setLoadError(caught instanceof ApiError ? caught.message : 'No se pudo cargar el perfil.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    // Carga inicial desde el servidor.
    void load();
  }, [load]);

  /** Devuelve `null` si se guardó, o el fallo para mostrarlo en el formulario. */
  const save = useCallback(
    async (payload: ProfileUpdatePayload): Promise<SaveFailure | null> => {
      try {
        const updated = await profileService.update(payload);

        setProfile(updated);
        // La barra superior muestra el nombre del dueño: se mantiene al día.
        setUser(updated);

        return null;
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          setPhase('unauthenticated');
        }

        return caught instanceof ApiError
          ? { message: caught.message, details: caught.details }
          : { message: 'Ocurrió un error inesperado. Intente de nuevo.', details: undefined };
      }
    },
    [setUser],
  );

  return { phase, profile, loadError, reload: load, save };
}
