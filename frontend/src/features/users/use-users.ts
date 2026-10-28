import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { usersService } from '../../services/users.service';
import type {
  CreateUserPayload,
  UpdateUserPayload,
  UserListItem,
  UserWithTemporaryPassword,
} from '../../types/auth';
import type { Notice } from '../products/use-products';

interface UsersState {
  phase: 'loading' | 'ready' | 'failed';
  users: UserListItem[];
  message?: string;
}

/** Contraseña temporal que se acaba de generar: se muestra una sola vez. */
export interface TemporaryPasswordReveal {
  user: UserListItem;
  temporaryPassword: string;
  reason: 'created' | 'reset';
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/** Estado de Configuración › Usuarios (solo Administrador). */
export function useUsers() {
  const [state, setState] = useState<UsersState>({ phase: 'loading', users: [] });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<TemporaryPasswordReveal | null>(null);

  const load = useCallback(async () => {
    try {
      setState({ phase: 'ready', users: await usersService.list() });
    } catch (error) {
      setState({ phase: 'failed', users: [], message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ejecuta una acción, muestra el resultado y recarga la lista. `true` si salió bien. */
  const run = useCallback(
    async <T>(action: () => Promise<T>, onDone: (result: T) => void): Promise<boolean> => {
      setBusy(true);
      setNotice(null);

      try {
        onDone(await action());
        await load();

        return true;
      } catch (error) {
        setNotice({ kind: 'error', text: describeError(error) });

        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const showPassword = useCallback(
    (reason: TemporaryPasswordReveal['reason']) => (result: UserWithTemporaryPassword) =>
      setReveal({ ...result, reason }),
    [],
  );

  const createUser = useCallback(
    (payload: CreateUserPayload) =>
      run(() => usersService.create(payload), showPassword('created')),
    [run, showPassword],
  );

  const updateUser = useCallback(
    (id: string, payload: UpdateUserPayload) =>
      run(
        () => usersService.update(id, payload),
        () => setNotice({ kind: 'success', text: 'Usuario actualizado correctamente.' }),
      ),
    [run],
  );

  const setActive = useCallback(
    (user: UserListItem, active: boolean) =>
      run(
        () => (active ? usersService.activate(user.id) : usersService.deactivate(user.id)),
        () =>
          setNotice({
            kind: 'success',
            text: active
              ? `${user.name} puede volver a iniciar sesión.`
              : `${user.name} quedó desactivado: ya no puede iniciar sesión.`,
          }),
      ),
    [run],
  );

  const resetPassword = useCallback(
    (user: UserListItem) => run(() => usersService.resetPassword(user.id), showPassword('reset')),
    [run, showPassword],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissReveal = useCallback(() => setReveal(null), []);

  return {
    ...state,
    notice,
    busy,
    reveal,
    reload: load,
    createUser,
    updateUser,
    setActive,
    resetPassword,
    dismissNotice,
    dismissReveal,
  };
}
