import { useSearchParams } from 'react-router-dom';
import { ReceiptModal } from '../features/sales/ReceiptModal';
import { useWedgeScanner } from '../features/sales/barcode-scanner';
import { CartTable } from '../features/sales/CartTable';
import { CheckoutPanel } from '../features/sales/CheckoutPanel';
import { SaleResult } from '../features/sales/SaleResult';
import { SalesHistory } from '../features/sales/SalesHistory';
import { ScannerBar } from '../features/sales/ScannerBar';
import { usePos } from '../features/sales/use-pos';

/**
 * Caja: registrar una venta con código de barras (HU-16), elegir el método de
 * pago (HU-17) y vender a crédito/fiado (HU-18).
 *
 * La página solo compone; el estado está en `use-pos.ts`, y el precio, el total
 * y el stock los decide el backend.
 */
export function SalesPage() {
  /**
   * El comprobante abierto vive en la URL (`/sales?receipt=<id>`): se muestra al
   * confirmar una venta, se abre desde el historial y se puede volver a abrir
   * después con el mismo enlace (HU-34).
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const receiptId = searchParams.get('receipt');
  const pos = usePos((sale) => setSearchParams({ receipt: sale.id }));

  function openReceipt(saleId: string): void {
    setSearchParams({ receipt: saleId });
  }

  function closeReceipt(): void {
    setSearchParams({});
  }

  // Lector USB tipo teclado cuando el foco no está en un campo de texto.
  useWedgeScanner((code) => void pos.scan(code), !pos.submitting && receiptId === null);

  return (
    <>
      <header className="page-header">
        <h1>Ventas</h1>
        <p>Escanee los productos, elija cómo paga el cliente y finalice la venta.</p>
      </header>

      {pos.result === null ? null : (
        <SaleResult sale={pos.result} onNewSale={pos.dismissResult} onOpenReceipt={openReceipt} />
      )}

      <ScannerBar busy={pos.scanning} onScan={pos.scan} />

      {pos.notice === null ? null : (
        <p className={`alert alert--${pos.notice.kind}`} role="status">
          {pos.notice.text}
          <button
            type="button"
            className="alert__close"
            onClick={pos.dismissNotice}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </p>
      )}

      <div className="pos">
        <CartTable
          cart={pos.cart}
          total={pos.total}
          disabled={pos.submitting}
          onQuantity={pos.changeQuantity}
          onRemove={pos.remove}
        />
        <CheckoutPanel
          total={pos.total}
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

      <SalesHistory version={pos.historyVersion} onOpenReceipt={openReceipt} />

      {receiptId === null ? null : <ReceiptModal saleId={receiptId} onClose={closeReceipt} />}

      <section className="card">
        <header className="card__header">
          <h2>Pendiente de implementar</h2>
        </header>
        <ul className="todo-list">
          <li>
            Lector físico (HU-06): el adaptador de teclado ya está listo en{' '}
            <code>features/sales/barcode-scanner.ts</code>, pero aún no se probó con un lector real;
            HU-06 debe conectarlo y validarlo.
          </li>
          <li>Historial completo del día, con totales y detalle (HU-20).</li>
        </ul>
      </section>
    </>
  );
}
