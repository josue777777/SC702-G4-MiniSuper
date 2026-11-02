import { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { TemporaryPasswordReveal } from './use-users';

/**
 * Muestra los datos de acceso UNA sola vez (al crear o restablecer): el
 * usuario y la contraseña temporal, para entregárselos a la persona. El
 * sistema solo guarda el hash de la contraseña: si se pierde, hay que
 * restablecerla de nuevo.
 */
export function TemporaryPasswordDialog({
  reveal,
  onClose,
}: {
  /** También sirve para el Encargado de un negocio nuevo (usa nombre, usuario y correo). */
  reveal: Pick<TemporaryPasswordReveal, 'temporaryPassword' | 'reason'> & {
    user: { name: string; username: string; email: string | null };
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(reveal.temporaryPassword);
      setCopied(true);
    } catch {
      // Sin permiso del portapapeles: la contraseña sigue a la vista para copiarla a mano.
    }
  }

  return (
    <Modal
      title={reveal.reason === 'created' ? 'Usuario creado' : 'Contraseña restablecida'}
      onClose={onClose}
    >
      <p>
        Datos de acceso de <strong>{reveal.user.name}</strong>
        {reveal.user.email === null ? null : ` (${reveal.user.email})`}:
      </p>
      <dl className="access-data">
        <dt>Usuario</dt>
        <dd>
          <code aria-label="Usuario">{reveal.user.username}</code>
        </dd>
        <dt>Contraseña temporal</dt>
        <dd className="temporary-password">
          <code aria-label="Contraseña temporal">{reveal.temporaryPassword}</code>
          <button type="button" className="button" onClick={() => void copy()}>
            {copied ? 'Copiada' : 'Copiar'}
          </button>
        </dd>
      </dl>
      <div className="alert alert--warning" role="status">
        Anótela o entréguesela ahora: no se volverá a mostrar. En su primer ingreso el sistema le
        pedirá crear su propia contraseña.
        {reveal.reason === 'reset' ? ' Sus sesiones abiertas se cerraron.' : ''}
      </div>
      <div className="form__actions">
        <button type="button" className="button button--primary" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  );
}
