import { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { TemporaryPasswordReveal } from './use-users';

/**
 * Muestra la contraseña temporal UNA sola vez (al crear o restablecer). El
 * sistema solo guarda su hash: si se pierde, hay que restablecerla de nuevo.
 */
export function TemporaryPasswordDialog({
  reveal,
  onClose,
}: {
  reveal: TemporaryPasswordReveal;
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
        Contraseña temporal de <strong>{reveal.user.name}</strong> ({reveal.user.email}):
      </p>
      <p className="temporary-password">
        <code aria-label="Contraseña temporal">{reveal.temporaryPassword}</code>
        <button type="button" className="button" onClick={() => void copy()}>
          {copied ? 'Copiada' : 'Copiar'}
        </button>
      </p>
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
