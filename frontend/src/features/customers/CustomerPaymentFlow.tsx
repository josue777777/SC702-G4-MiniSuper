/**
 * Registrar un abono desde Clientes (HU-19): pide al servidor la deuda y los
 * fiados del cliente elegido y abre el formulario con ellos. Lo usan los dos
 * caminos hacia el mismo formulario —el botón «Registrar abono» de la fila y el de
 * la cuenta del cliente— para que sea una sola pieza y no dos copias.
 */
import { Modal } from '../../components/Modal';
import type { PaymentResult } from '../../types/credit';
import type { Customer } from '../../types/sales';
import { PaymentModal } from './PaymentModal';
import { useCustomerCredit } from './use-customer-credit';

interface CustomerPaymentFlowProps {
  customer: Customer;
  /** «Cancelar» o ×: quien lo abrió decide a dónde se vuelve (la lista o la cuenta). */
  onClose: () => void;
  /** El abono se guardó; trae lo que respondió el servidor. */
  onPaid: (result: PaymentResult) => void;
}

/**
 * Carga la cuenta del cliente y muestra el formulario de abono. Mientras llega,
 * o si falla, la misma ventana lo dice (con «Reintentar»): nunca queda un botón
 * que no hace nada.
 *
 * @param props.customer El cliente al que se le abona; no se vuelve a elegir.
 */
export function CustomerPaymentFlow({ customer, onClose, onPaid }: CustomerPaymentFlowProps) {
  const { credit, error, reload } = useCustomerCredit(customer.id);

  if (credit !== null) {
    return <PaymentModal credit={credit} onClose={onClose} onPaid={onPaid} onStale={reload} />;
  }

  return (
    <Modal title="Registrar abono" onClose={onClose}>
      {error === null ? (
        <p className="muted" role="status">
          Cargando la cuenta de {customer.name}…
        </p>
      ) : (
        <div className="alert alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      <div className="form__actions modal__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
