import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../services/api-client';
import { customersService, salesService } from '../../services/sales.service';
import type { Customer, CustomerPayload, PaymentMethod, Sale } from '../../types/sales';
import { addProduct, cartTotal, removeLine, setQuantity, type CartLine } from './cart';
import { hasValidGtinCheckDigit } from './barcode-scanner';
import { formatCents, isMoneyText, toCents } from './cents';

export interface PosNotice {
  kind: 'success' | 'error' | 'warning';
  text: string;
}

const CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

/** UUID v4 para la llave de idempotencia; `randomUUID` solo existe en contextos seguros. */
function newKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function describe(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Ocurrió un error inesperado. Intente de nuevo.';
}

/**
 * Estado de la caja (HU-16, HU-17, HU-18): carrito, método de pago, cliente del
 * fiado y confirmación. Toda regla de negocio vive en el backend; aquí solo se
 * guía al cajero y se evita enviar lo que se sabe inválido.
 *
 * Doble clic / reintento: cada intento de cobro lleva una llave de idempotencia.
 * Se conserva mientras nada cambie (un reintento tras un corte de red devuelve
 * la misma venta) y se renueva con cualquier cambio del carrito o del pago.
 */
export function usePos(onConfirmed?: (sale: Sale) => void) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState<PosNotice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [result, setResult] = useState<Sale | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  /** Carrito más reciente: lecturas seguidas del lector no deben pisarse entre sí. */
  const cartRef = useRef<CartLine[]>([]);
  const keyRef = useRef(newKey());
  const submittingRef = useRef(false);
  const onConfirmedRef = useRef(onConfirmed);

  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const applyCart = useCallback((next: CartLine[]): void => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const touch = useCallback(() => {
    keyRef.current = newKey();
    setSaleError(null);
  }, []);

  const loadCustomers = useCallback(async (): Promise<void> => {
    try {
      setCustomers(await customersService.list());
    } catch (caught) {
      setNotice({ kind: 'error', text: `No se pudieron cargar los clientes. ${describe(caught)}` });
    }
  }, []);

  useEffect(() => {
    // Carga inicial de clientes para el fiado.
    void loadCustomers();
  }, [loadCustomers]);

  const total = useMemo(() => cartTotal(cart), [cart]);
  const totalCents = toCents(total);

  const cashValid = isMoneyText(cashReceived) && toCents(cashReceived) >= totalCents;
  const change =
    method === 'CASH' && cashValid ? formatCents(toCents(cashReceived) - totalCents) : null;
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  const canConfirm =
    !submitting &&
    cart.length > 0 &&
    method !== null &&
    (method !== 'CASH' || cashValid) &&
    (method !== 'CREDIT' || selectedCustomer !== null);

  /** Busca el código (leído o escrito) y lo agrega al carrito. */
  const scan = useCallback(
    async (rawCode: string): Promise<void> => {
      const code = rawCode.trim();

      if (code === '') {
        setNotice({ kind: 'error', text: 'Lectura incompleta. Escanee de nuevo el código.' });
        return;
      }

      if (!CODE_PATTERN.test(code) || code.length > 64) {
        setNotice({
          kind: 'error',
          text: 'Lectura incompleta o dañada. Revise el lector y escanee de nuevo.',
        });
        return;
      }

      if (!hasValidGtinCheckDigit(code)) {
        setNotice({
          kind: 'error',
          text: 'El código leído está incompleto o dañado. Escanee de nuevo el producto.',
        });
        return;
      }

      setScanning(true);
      setResult(null);

      try {
        const product = await salesService.lookupProduct(code);
        const added = addProduct(cartRef.current, product);

        applyCart(added.cart);
        touch();
        setNotice(
          added.warning === undefined
            ? { kind: 'success', text: `Agregado: ${product.name}` }
            : { kind: 'warning', text: added.warning },
        );
      } catch (caught) {
        setNotice({ kind: 'error', text: describe(caught) });
      } finally {
        setScanning(false);
      }
    },
    [applyCart, touch],
  );

  const changeQuantity = useCallback(
    (productId: string, quantity: number): void => {
      const updated = setQuantity(cartRef.current, productId, quantity);

      applyCart(updated.cart);
      touch();
      setNotice(updated.warning === undefined ? null : { kind: 'warning', text: updated.warning });
    },
    [applyCart, touch],
  );

  const remove = useCallback(
    (productId: string): void => {
      applyCart(removeLine(cartRef.current, productId));
      touch();
    },
    [applyCart, touch],
  );

  const selectMethod = useCallback(
    (next: PaymentMethod): void => {
      setMethod(next);
      touch();
    },
    [touch],
  );

  const changeCash = useCallback(
    (value: string): void => {
      setCashReceived(value);
      touch();
    },
    [touch],
  );

  const selectCustomer = useCallback(
    (id: string): void => {
      setCustomerId(id);
      touch();
    },
    [touch],
  );

  /** HU-18: crea un cliente básico y lo deja seleccionado. Devuelve `true` si se guardó. */
  const createCustomer = useCallback(
    async (payload: CustomerPayload): Promise<string | null> => {
      try {
        const created = await customersService.create(payload);

        setCustomers((current) =>
          [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
        setCustomerId(created.id);
        touch();

        return null;
      } catch (caught) {
        return describe(caught);
      }
    },
    [touch],
  );

  /** Confirma la venta: una sola petición a la vez, aunque se haga doble clic. */
  const confirm = useCallback(async (): Promise<void> => {
    if (submittingRef.current || !canConfirm || method === null) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSaleError(null);

    try {
      const sale = await salesService.create({
        idempotencyKey: keyRef.current,
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        paymentMethod: method,
        ...(method === 'CASH' ? { cashReceived: cashReceived.trim() } : {}),
        ...(method === 'CREDIT' ? { customerId } : {}),
      });

      setResult(sale);
      onConfirmedRef.current?.(sale);
      applyCart([]);
      setMethod(null);
      setCashReceived('');
      setCustomerId('');
      setNotice(null);
      keyRef.current = newKey();
      setHistoryVersion((version) => version + 1);
      void loadCustomers();
    } catch (caught) {
      // La llave se conserva: si el corte fue de red, reintentar no duplica la venta.
      setSaleError(describe(caught));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [applyCart, canConfirm, cart, cashReceived, customerId, loadCustomers, method]);

  return {
    cart,
    total,
    notice,
    scanning,
    method,
    cashReceived,
    cashValid,
    change,
    customers,
    selectedCustomer,
    customerId,
    submitting,
    saleError,
    result,
    historyVersion,
    canConfirm,
    scan,
    changeQuantity,
    remove,
    selectMethod,
    changeCash,
    selectCustomer,
    createCustomer,
    confirm,
    dismissNotice: () => setNotice(null),
    dismissResult: () => setResult(null),
  };
}
