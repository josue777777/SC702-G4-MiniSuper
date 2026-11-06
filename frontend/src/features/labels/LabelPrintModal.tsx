import { useEffect, useMemo, useRef, useState } from 'react';
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../components/list-search';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';
import type { LabelRequest } from '../../types/labels';
import type { Product } from '../../types/products';
import { useSession } from '../auth/session-context';
import { formatMoney } from '../products/money';
import { LabelCustomizeModal } from './LabelCustomizeModal';
import { LabelPreview } from './LabelPreview';
import { printLabels, removeLabelFrame } from './label-print';
import { LabelSheet } from './LabelSheet';
import {
  clampStart,
  expandLabels,
  LABEL_FIELD_ORDER,
  LABEL_SIZE_SPECS,
  labelsPerPage,
  MAX_COPIES,
  MAX_LABELS_PER_PRINT,
  SAMPLE_PRODUCT,
  totalLabels,
} from './label-sizes';
import { useLabelData } from './use-label-data';

interface LabelPrintModalProps {
  /** Productos y cantidades con los que abre (el seleccionado, o las líneas de un pedido). */
  initial: LabelRequest[];
  /** De dónde se abrió, para el título (por ejemplo «pedido PED-0007»). */
  origin?: string;
  onClose: () => void;
}

/**
 * «Imprimir etiquetas» (HU-07): elegir productos y cuántas etiquetas de cada
 * uno, ver cómo quedan e imprimirlas con el diseño del negocio.
 *
 * Flujo:
 *   1. `useLabelData` carga productos, negocio (nombre y logo) y el diseño.
 *   2. La persona pone cantidades; la vista previa y el total se actualizan.
 *   3. «Imprimir»: se dibujan todas las páginas escondidas (`LabelSheet`) y
 *      `printLabels` las manda a la impresora con el tamaño exacto del papel.
 */
export function LabelPrintModal({ initial, origin, onClose }: LabelPrintModalProps) {
  const { can } = useSession();
  const { state, setDesign } = useLabelData();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.map((request) => [request.productId, request.quantity])),
  );
  const [search, setSearch] = useState('');
  const [startAt, setStartAt] = useState(1);
  const [customizing, setCustomizing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const products = useMemo(() => (state.phase === 'ready' ? state.products : []), [state]);
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const requests: LabelRequest[] = Object.entries(quantities)
    .filter(([productId, quantity]) => quantity > 0 && byId.has(productId))
    .map(([productId, quantity]) => ({ productId, quantity }));
  const missing = initial.filter((request) => !byId.has(request.productId)).length;
  const total = totalLabels(requests);

  // Los elegidos primero, para verlos sin buscar; después el resto por código.
  const rows = useMemo(
    () =>
      products
        .filter((product) => matchesSearch(search, product.code, product.name, product.barcode))
        .sort(
          (a, b) =>
            Number((quantities[b.id] ?? 0) > 0) - Number((quantities[a.id] ?? 0) > 0) ||
            a.code.localeCompare(b.code, 'es'),
        ),
    // Las cantidades no reordenan mientras se escribe: solo al buscar o al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, search],
  );
  const pages = usePagination(rows, search);

  // Al cerrar la ventana se quita el marco de impresión escondido.
  useEffect(() => removeLabelFrame, []);

  // Con las páginas ya dibujadas (escondidas), se manda a imprimir.
  useEffect(() => {
    if (!printing || state.phase !== 'ready' || sheetRef.current === null) {
      return;
    }

    printLabels(sheetRef.current, LABEL_SIZE_SPECS[state.design.size])
      .catch((error: unknown) =>
        setPrintError(error instanceof Error ? error.message : 'No se pudo imprimir.'),
      )
      .finally(() => setPrinting(false));
  }, [printing, state]);

  function setQuantity(productId: string, text: string): void {
    const value = Number.parseInt(text, 10);
    const quantity = Number.isFinite(value) ? Math.min(Math.max(0, value), MAX_COPIES) : 0;

    setQuantities((current) => ({ ...current, [productId]: quantity }));
  }

  if (state.phase !== 'ready') {
    return (
      <Modal title="Imprimir etiquetas" size="wide" onClose={onClose}>
        {state.phase === 'loading' ? (
          <p className="muted" role="status">
            Cargando productos y diseño…
          </p>
        ) : (
          <p className="alert alert--error" role="alert">
            {state.message}
          </p>
        )}
      </Modal>
    );
  }

  const { design, business } = state;
  const spec = LABEL_SIZE_SPECS[design.size];
  const perPage = labelsPerPage(spec);
  const start = clampStart(startAt, perPage);
  const sheets = spec.kind === 'sheet' ? Math.ceil((total + start - 1) / perPage) : total;
  const firstChosen = requests[0] === undefined ? undefined : byId.get(requests[0].productId);
  const withoutBarcode = requests.filter(
    (request) => byId.get(request.productId)?.barcode === null,
  ).length;
  const shownFields = LABEL_FIELD_ORDER.filter((field) => design.show[field]).length;
  const tooMany = total > MAX_LABELS_PER_PRINT;

  return (
    <Modal
      title={origin === undefined ? 'Imprimir etiquetas' : `Imprimir etiquetas · ${origin}`}
      size="wide"
      onClose={onClose}
    >
      <p className="muted">
        Diseño del negocio: <strong>{spec.name}</strong> · {shownFields} de{' '}
        {LABEL_FIELD_ORDER.length} datos.{' '}
        {can('business.edit') ? (
          <button type="button" className="link-button" onClick={() => setCustomizing(true)}>
            Personalizar
          </button>
        ) : (
          'Lo define el Encargado.'
        )}
      </p>

      {missing > 0 ? (
        <p className="alert alert--warning" role="status">
          {missing === 1
            ? 'Un producto está desactivado y no se incluye.'
            : `${missing} productos están desactivados y no se incluyen.`}
        </p>
      ) : null}

      <div className="customize">
        <div>
          <div className="toolbar">
            <ListSearch
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre o código"
              label="Buscar producto para etiquetar"
            />
            {total > 0 ? (
              <button type="button" className="button" onClick={() => setQuantities({})}>
                Quitar todas
              </button>
            ) : null}
          </div>
          <div className="table-wrapper">
            <table className="table" aria-label="Productos a etiquetar">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="table__number">Precio</th>
                  <th className="table__number">Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {pages.pageItems.map((product: Product) => (
                  <tr key={product.id}>
                    <td>{product.code}</td>
                    <td>
                      {product.name}{' '}
                      {product.barcode === null ? (
                        <span className="badge badge--muted">sin código de barras</span>
                      ) : null}
                    </td>
                    <td className="table__number">{formatMoney(product.price)}</td>
                    <td className="table__number">
                      <input
                        className="order-quantity"
                        type="number"
                        min="0"
                        max={MAX_COPIES}
                        step="1"
                        inputMode="numeric"
                        aria-label={`Etiquetas de ${product.name}`}
                        value={quantities[product.id] ?? 0}
                        onFocus={(event) => event.target.select()}
                        onChange={(event) => setQuantity(product.id, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {pages.total === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Ningún producto activo coincide con la búsqueda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
        </div>

        <div className="customize__side">
          <LabelPreview
            product={firstChosen ?? SAMPLE_PRODUCT}
            design={design}
            business={business}
            maxWidth={300}
          />
          {firstChosen === undefined ? (
            <p className="hint">Ejemplo: ponga una cantidad para ver su producto.</p>
          ) : null}

          <dl className="order-meta" aria-label="Resumen de la impresión">
            <dt>Etiquetas</dt>
            <dd>{total}</dd>
            <dt>{spec.kind === 'sheet' ? 'Hojas carta' : 'Stickers del rollo'}</dt>
            <dd>{sheets}</dd>
          </dl>

          {spec.kind === 'sheet' ? (
            <label className="form__field">
              <span>Empezar en la etiqueta</span>
              <input
                type="number"
                min="1"
                max={perPage}
                step="1"
                inputMode="numeric"
                value={startAt}
                onChange={(event) => setStartAt(Number.parseInt(event.target.value, 10) || 1)}
              />
              <span className="hint">
                Para aprovechar una hoja ya usada: de 1 a {perPage}, de izquierda a derecha y de
                arriba abajo.
              </span>
            </label>
          ) : null}

          {design.show.barcode && withoutBarcode > 0 ? (
            <p className="hint" role="status">
              {withoutBarcode === 1
                ? 'Un producto no tiene código de barras: su etiqueta sale sin barras'
                : `${withoutBarcode} productos no tienen código de barras: sus etiquetas salen sin barras`}
              {design.show.qr ? ' (el QR lleva su código).' : '.'}
            </p>
          ) : null}
          {tooMany ? (
            <p className="form__error" role="alert">
              Son más de {MAX_LABELS_PER_PRINT} etiquetas. Imprímalas en partes.
            </p>
          ) : null}
          {printError === null ? null : (
            <p className="form__error" role="alert">
              {printError}
            </p>
          )}
        </div>
      </div>

      <div className="form__actions modal__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={total === 0 || tooMany || printing}
          onClick={() => {
            setPrintError(null);
            setPrinting(true);
          }}
        >
          {printing
            ? 'Preparando…'
            : `🖨 Imprimir ${total} ${total === 1 ? 'etiqueta' : 'etiquetas'}`}
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {/* Las páginas de la impresión: solo se dibujan al imprimir y nunca se ven. */}
      {printing ? (
        <div ref={sheetRef} hidden>
          <LabelSheet
            labels={expandLabels(requests, byId)}
            design={design}
            spec={spec}
            business={business}
            startAt={start}
          />
        </div>
      ) : null}

      {customizing ? (
        <LabelCustomizeModal
          design={design}
          business={business}
          sample={firstChosen ?? SAMPLE_PRODUCT}
          onSaved={(saved) => {
            setDesign(saved);
            setCustomizing(false);
          }}
          onClose={() => setCustomizing(false)}
        />
      ) : null}
    </Modal>
  );
}
