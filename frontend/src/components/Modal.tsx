import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `wide` para ventanas con tablas (conteo, vencimientos). */
  size?: 'normal' | 'wide';
}

/**
 * Ventana modal con barra de título y botón ×.
 *
 * Usa el `<dialog>` del navegador abierto con `showModal()`: así el navegador
 * se encarga del fondo oscuro, de cerrar con Esc y de que el foco no se escape
 * a la pantalla de atrás. Esc no cierra solo: avisa con `onClose` y es la
 * pantalla la que decide (por ejemplo, no cerrar mientras guarda).
 *
 * Un campo con `data-autofocus` queda con el foco al abrirla (se puede
 * escribir de inmediato, sin el ratón). `autoFocus` de React no sirve aquí:
 * enfoca antes de que la ventana se abra.
 */
export function Modal({ title, onClose, children, size = 'normal' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog !== null && !dialog.open) {
      dialog.showModal();
      // `showModal()` deja el foco en el primer botón (la ×). Si un campo pide
      // el foco con `data-autofocus`, se le da: se puede escribir de inmediato.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }

    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={size === 'wide' ? 'modal modal--wide' : 'modal'}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="modal__header">
        <h2>{title}</h2>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </header>
      <div className="modal__body">{children}</div>
    </dialog>
  );
}
