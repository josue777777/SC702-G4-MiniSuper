import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReceiptModal } from '../features/sales/ReceiptModal';
import { useWedgeScanner } from '../features/sales/barcode-scanner';
import { CartTable } from '../features/sales/CartTable';
import { CheckoutPanel } from '../features/sales/CheckoutPanel';
import { SaleResult } from '../features/sales/SaleResult';
import { SalesHistory } from '../features/sales/SalesHistory';
import { SCANNER_INPUT_ID, ScannerBar } from '../features/sales/ScannerBar';
import { usePos } from '../features/sales/use-pos';

/** Las dos partes de la pantalla: vender o consultar lo vendido. */
type SalesView = 'caja' | 'historial';

const VIEWS: { id: SalesView; label: string }[] = [
  { id: 'caja', label: 'Caja' },
  { id: 'historial', label: 'Historial del día' },
];

/**
 * Caja: registrar una venta con código de barras (HU-16), elegir el método de
 * pago (HU-17) y vender a crédito/fiado (HU-18). En otra pestaña, el historial
 * del día (HU-20) con sus comprobantes (HU-34).
 *
 * Vender y consultar son dos objetivos distintos, así que van en pestañas
 * (docs/PANTALLAS.md): la cajera entra a «Caja» y solo ve lo que necesita para
 * cobrar. La página solo compone; el estado está en `use-pos.ts`, y el precio,
 * el total y el stock los decide el backend.
 */
export function SalesPage() {
  const [adjustmentVersion, setAdjustmentVersion] = useState(0);
  /**
   * El comprobante abierto vive en la URL (`/sales?receipt=<id>`): se muestra al
   * confirmar una venta, se abre desde el historial y se puede volver a abrir
   * después con el mismo enlace (HU-34).
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const receiptId = searchParams.get('receipt');
  const pos = usePos((sale) => setSearchParams({ receipt: sale.id }));
  const [view, setView] = useState<SalesView>('caja');

  function openReceipt(saleId: string): void {
    setSearchParams({ receipt: saleId });
  }

  function closeReceipt(): void {
    setSearchParams({});
  }

  // Lector USB tipo teclado cuando el foco no está en un campo de texto.
  useWedgeScanner(
    (code) => void pos.scan(code),
    view === 'caja' && !pos.submitting && receiptId === null,
  );

  // Atajos de la caja, como en un punto de venta: F2 vuelve al código y F9 finaliza.
  const { canConfirm, confirm } = pos;

  useEffect(() => {
    if (view !== 'caja' || receiptId !== null) {
      return;
    }

    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'F2') {
        event.preventDefault();
        document.getElementById(SCANNER_INPUT_ID)?.focus();
      } else if (event.key === 'F9' && canConfirm) {
        event.preventDefault();
        void confirm();
      }
    }

    window.addEventListener('keydown', handleKey);

    return () => window.removeEventListener('keydown', handleKey);
  }, [view, receiptId, canConfirm, confirm]);

  return (
    <>
      <header className="page-header">
        <h1>Ventas</h1>
        <p>Escanee los productos, elija cómo paga el cliente y finalice la venta.</p>
      </header>

      <div className="tabs" role="tablist" aria-label="Secciones de ventas">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`sales-tab-${item.id}`}
            aria-selected={view === item.id}
            aria-controls={`sales-panel-${item.id}`}
            className={view === item.id ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="tabs__panel"
        role="tabpanel"
        id={`sales-panel-${view}`}
        aria-labelledby={`sales-tab-${view}`}
      >
        {view === 'caja' ? (
          <>
            {pos.result === null ? null : (
              <SaleResult
                sale={pos.result}
                onNewSale={pos.dismissResult}
                onOpenReceipt={openReceipt}
              />
            )}

            {/* Izquierda: agregar y revisar productos. Derecha: cobrar. */}
            <div className="pos">
              <div className="pos__main">
                <ScannerBar busy={pos.scanning} notice={pos.notice} onScan={pos.scan} />

                <CartTable
                  cart={pos.cart}
                  total={pos.total}
                  disabled={pos.submitting}
                  onQuantity={pos.changeQuantity}
                  onRemove={pos.remove}
                  onClear={pos.clearCart}
                />
              </div>
              <div className="pos__side">
                <CheckoutPanel
                  total={pos.total}
                  units={pos.cart.reduce((sum, line) => sum + line.quantity, 0)}
                  hasItems={pos.cart.length > 0}
                  method={pos.method}
                  cashReceived={pos.cashReceived}
                  cashValid={pos.cashValid}
                  change={pos.change}
                  customers={pos.customers}
                  customerId={pos.customerId}
                  selectedCustomer={pos.selectedCustomer}
                  submitting={pos.submitting}
                  canConfirm={pos.canConfirm}
                  error={pos.saleError}
                  onMethod={pos.selectMethod}
                  onCash={pos.changeCash}
                  onCustomer={pos.selectCustomer}
                  onCreateCustomer={pos.createCustomer}
                  onConfirm={() => void pos.confirm()}
                />
              </div>
            </div>
          </>
        ) : (
          <SalesHistory
            version={pos.historyVersion + adjustmentVersion}
            onOpenReceipt={openReceipt}
            onAdjustmentComplete={() => setAdjustmentVersion((version) => version + 1)}
          />
        )}
      </div>

      {receiptId === null ? null : <ReceiptModal saleId={receiptId} onClose={closeReceipt} />}
    </>
  );
}
