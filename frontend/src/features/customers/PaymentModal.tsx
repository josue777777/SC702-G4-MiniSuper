import { useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { ApiError } from '../../services/api-client';
import { creditService } from '../../services/credit.service';
import type { CreditSummary, PaymentResult } from '../../types/credit';
import { formatMoney } from '../products/money';
import { todayInBusinessZone } from '../reports/report-filters';
import { formatCents } from '../sales/cents';
import { newKey } from '../sales/use-pos';
import { formatFiadoDate } from './credit-format';
import { amountText, previewPayment } from './payment-preview';

interface PaymentModalProps {
  credit: CreditSummary;
  onClose: () => void;
  /** El abono se guardó: la ficha se actualiza con lo que devolvió el servidor. */
  onPaid: (result: PaymentResult) => void;
  /** El servidor respondió que el saldo cambió: la ficha se vuelve a cargar. */
  onStale: () => void;
}

const NOTE_MAX = 200;

/**
 * Registrar un abono (HU-19). Antes de confirmar muestra la deuda, el monto, el
 * nuevo saldo y a qué fiados se aplicará; si el pago supera la deuda lo advierte
 * con la diferencia y NO deja confirmar (no hay saldos a favor): se ajusta el
 * monto a la deuda real o se corrige.
 *
 * La llave de idempotencia cambia cuando cambia lo escrito: reenviar EXACTAMENTE
 * lo mismo (un doble clic, un reintento) no cobra dos veces; un monto distinto es
 * otra operación. El servidor valida todo otra vez.
 */
export function PaymentModal({ credit, onClose, onPaid, onStale }: PaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => todayInBusinessZone());
  const [notes, setNotes] = useState('');
  const [target, setTarget] = useState<'oldest' | 'specific'>('oldest');
  const [saleId, setSaleId] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const keyRef = useRef(newKey());

  const pendingFiados = credit.fiados.filter((fiado) => fiado.status !== 'SETTLED');
  const chosenSaleId = target === 'specific' && saleId !== '' ? saleId : null;
  const preview = previewPayment(credit, amount, chosenSaleId, touched);
  const dateError = paymentDate === '' ? 'Indique la fecha del pago.' : null;
  const specificMissing = target === 'specific' && saleId === '';
  const chosenFiado = pendingFiados.find((fiado) => fiado.saleId === chosenSaleId);
  // Lo escrito es claramente incorrecto (formato, cero, exceso, fecha): el botón no deja confirmar.
  const blocked =
    saving ||
    (amount.trim() !== '' && preview.amount === null) ||
    preview.excess > 0n ||
    dateError !== null;
  // Lo que falta completar (monto vacío, fiado sin elegir) se avisa AL INTENTAR confirmar: así
  // el botón no queda apagado sin decir por qué.
  const incomplete = preview.amount === null || specificMissing;

  /** Cualquier cambio de lo escrito es otra operación: llave nueva. */
  function changed(): void {
    keyRef.current = newKey();
    setServerError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setTouched(true);

    if (blocked || incomplete || preview.amount === null) {
      return;
    }

    setSaving(true);
    setServerError(null);

    try {
      onPaid(
        await creditService.registerPayment(credit.customer.id, {
          idempotencyKey: keyRef.current,
          amount: formatCents(preview.amount),
          paymentDate,
          ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
          ...(chosenSaleId === null ? {} : { saleId: chosenSaleId }),
        }),
      );
    } catch (caught) {
      setServerError(
        caught instanceof ApiError
          ? caught.message
          : 'No se pudo registrar el abono. Intente de nuevo.',
      );

      // Un 409 es un saldo que cambió: se refresca la ficha para decidir con la cifra real.
      if (caught instanceof ApiError && caught.status === 409) {
        onStale();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar abono" onClose={saving ? () => undefined : onClose}>
      <form className="form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <p>
          Cliente: <strong>{credit.customer.name}</strong>
        </p>

        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="payment-amount">Monto a pagar</label>
            <input
              id="payment-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              aria-invalid={preview.amountError !== null}
              aria-describedby={preview.amountError === null ? undefined : 'payment-amount-error'}
              onChange={(event) => {
                setAmount(event.target.value);
                changed();
              }}
            />
            {preview.amountError === null ? null : (
              <p id="payment-amount-error" className="form__error" role="alert">
                {preview.amountError}
              </p>
            )}
          </div>
          <div className="form__field">
            <label htmlFor="payment-date">Fecha del pago</label>
            <input
              id="payment-date"
              type="date"
              max={todayInBusinessZone()}
              value={paymentDate}
              onChange={(event) => {
                setPaymentDate(event.target.value);
                changed();
              }}
            />
            {dateError === null ? null : (
              <p className="form__error" role="alert">
                {dateError}
              </p>
            )}
          </div>
        </div>

        <fieldset className="payment-target">
          <legend>Aplicar el pago a</legend>
          <label>
            <input
              type="radio"
              name="payment-target"
              checked={target === 'oldest'}
              onChange={() => {
                setTarget('oldest');
                changed();
              }}
            />{' '}
            Las deudas más antiguas primero (recomendado)
          </label>
          <label>
            <input
              type="radio"
              name="payment-target"
              checked={target === 'specific'}
              disabled={pendingFiados.length === 0}
              onChange={() => {
                setTarget('specific');
                changed();
              }}
            />{' '}
            Un fiado específico
          </label>
          {target === 'specific' ? (
            <div className="form__field">
              <label htmlFor="payment-sale">Fiado</label>
              <select
                id="payment-sale"
                value={saleId}
                onChange={(event) => {
                  setSaleId(event.target.value);
                  changed();
                }}
              >
                <option value="">Elija un fiado</option>
                {pendingFiados.map((fiado) => (
                  <option key={fiado.saleId} value={fiado.saleId}>
                    Fiado #{fiado.number} · {formatFiadoDate(fiado.createdAt)} · pendiente{' '}
                    {formatMoney(fiado.pendingAmount)}
                  </option>
                ))}
              </select>
              {touched && specificMissing ? (
                <p className="form__error" role="alert">
                  Elija el fiado al que se aplicará el pago.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <div className="form__field">
          <label htmlFor="payment-notes">Nota (opcional)</label>
          <input
            id="payment-notes"
            maxLength={NOTE_MAX}
            autoComplete="off"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              changed();
            }}
          />
        </div>

        {preview.excess > 0n ? (
          <div className="alert alert--warning" role="alert">
            <span>
              {chosenFiado === undefined
                ? `El pago supera la deuda pendiente por ${formatMoney(formatCents(preview.excess))}.`
                : `El pago supera lo pendiente del fiado #${chosenFiado.number} por ${formatMoney(formatCents(preview.excess))}.`}{' '}
              No se pueden registrar saldos a favor: corrija el monto o ajústelo.
            </span>
            <button
              type="button"
              className="button"
              onClick={() => {
                setAmount(amountText(preview.limit));
                changed();
              }}
            >
              {chosenFiado === undefined
                ? 'Ajustar al monto de la deuda'
                : 'Ajustar al pendiente del fiado'}
            </button>
          </div>
        ) : null}

        <section className="payment-summary" aria-label="Resumen del abono">
          <h3>Resumen del abono</h3>
          <dl>
            <div>
              <dt>Deuda actual</dt>
              <dd>{formatMoney(credit.balance)}</dd>
            </div>
            <div>
              <dt>Monto a abonar</dt>
              <dd>{preview.amount === null ? '—' : formatMoney(formatCents(preview.amount))}</dd>
            </div>
            <div>
              <dt>Nuevo saldo</dt>
              <dd>
                {preview.newBalance === null ? '—' : formatMoney(formatCents(preview.newBalance))}
              </dd>
            </div>
          </dl>
          {preview.parts.length === 0 ? null : (
            <p className="muted">
              Se aplicará a:{' '}
              {preview.parts
                .map((part) => `fiado #${part.number} (${formatMoney(formatCents(part.amount))})`)
                .join(', ')}
              .
            </p>
          )}
        </section>

        {serverError === null ? null : (
          <p className="alert alert--error" role="alert">
            {serverError}
          </p>
        )}

        <div className="form__actions modal__actions">
          <button type="submit" className="button button--primary" disabled={blocked}>
            {saving ? 'Guardando…' : 'Confirmar abono'}
          </button>
          <button type="button" className="button" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
