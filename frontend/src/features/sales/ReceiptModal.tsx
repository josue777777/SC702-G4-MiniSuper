import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../../components/Modal';
import { SaleReceipt } from './SaleReceipt';
import { useReceipt } from './use-receipt';

interface ReceiptModalProps {
  saleId: string;
  onClose: () => void;
}

/**
 * Comprobante de una venta (HU-34): se ve en pantalla y se puede imprimir.
 *
 * Para imprimir solo el ticket, una segunda copia se coloca fuera de la
 * aplicación (`.print-only`) y, mientras el body tiene `printing-receipt`, la
 * hoja de estilos de impresión oculta todo lo demás. Si no hay impresora o la
 * impresión falla, el ticket sigue en pantalla.
 */
export function ReceiptModal({ saleId, onClose }: ReceiptModalProps) {
  const [attempt, setAttempt] = useState(0);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const receipt = useReceipt(saleId, attempt);

  function handlePrint(): void {
    setPrintNote(null);

    try {
      if (typeof window.print !== 'function') {
        throw new Error('print no disponible');
      }

      // Las reglas de impresión del ticket solo aplican con esta clase; así no
      // ocultan la aplicación cuando se imprime un pedido o un reporte.
      const { classList } = document.body;
      classList.add('printing-receipt');
      window.addEventListener('afterprint', () => classList.remove('printing-receipt'), {
        once: true,
      });
      window.print();
    } catch {
      document.body.classList.remove('printing-receipt');
      setPrintNote(
        'No se pudo abrir la impresión (¿hay una impresora disponible?). El comprobante sigue disponible en pantalla.',
      );
    }
  }

  return (
    <Modal title="Comprobante de venta" onClose={onClose}>
      {receipt.phase === 'loading' ? (
        <p className="muted" role="status">
          Cargando comprobante…
        </p>
      ) : null}

      {receipt.phase === 'error' ? (
        <div className="alert alert--error" role="alert">
          {receipt.message}{' '}
          <button type="button" className="button" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      ) : null}

      {receipt.phase === 'ready' ? (
        <>
          <SaleReceipt sale={receipt.sale} />

          {printNote === null ? null : (
            <p className="alert alert--warning" role="status">
              {printNote}
            </p>
          )}

          <div className="form__actions receipt__actions">
            <button type="button" className="button button--primary" onClick={handlePrint}>
              🖨 Imprimir
            </button>
            <button type="button" className="button" onClick={onClose}>
              Cerrar
            </button>
          </div>

          {createPortal(
            <div className="print-only" data-testid="print-receipt">
              <SaleReceipt sale={receipt.sale} />
            </div>,
            document.body,
          )}
        </>
      ) : null}
    </Modal>
  );
}
