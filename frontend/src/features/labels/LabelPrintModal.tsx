import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { MODAL_PAGE_SIZE, usePagination } from '../../components/use-pagination';
import { NavIcon } from '../../layouts/NavIcon';
import type { LabelRequest } from '../../types/labels';
import type { Product } from '../../types/products';
import { useSession } from '../auth/session-context';
import { formatMoney } from '../products/money';
import { ProductQuickSearch } from '../products/ProductQuickSearch';
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

/**
 * Desde dónde se abrió la ventana. Lo que se elige ANTES manda: si ya se eligió
 * un producto o un pedido, la ventana trabaja solo con eso y no ofrece buscar en
 * todo el catálogo.
 *   - `catalog`: botón «Etiquetas» de Inventario, sin nada elegido: buscar y
 *     marcar cuántas etiquetas de cada producto.
 *   - `product`: «Ver código» de UN producto: solo cuántas copias de ese.
 *   - `order`: «Ver pedido»: solo los productos del pedido, con lo pedido.
 */
export type LabelScope =
  | { kind: 'catalog' }
  | { kind: 'product'; productId: string }
  | { kind: 'order'; orderNumber: string; items: LabelRequest[] };

interface LabelPrintModalProps {
  scope: LabelScope;
  onClose: () => void;
}

/** Cantidades con las que abre cada modo: una copia del producto, o lo pedido. */
function initialQuantities(scope: LabelScope): Record<string, number> {
  switch (scope.kind) {
    case 'catalog':
      return {};
    case 'product':
      return { [scope.productId]: 1 };
    case 'order':
      return Object.fromEntries(scope.items.map((item) => [item.productId, item.quantity]));
  }
}

/** Una cantidad escrita a mano, siempre entre 0 y el tope de copias. */
function parseQuantity(text: string): number {
  const value = Number.parseInt(text, 10);

  return Number.isFinite(value) ? Math.min(Math.max(0, value), MAX_COPIES) : 0;
}

/**
 * «Imprimir etiquetas» (HU-07): ver cómo quedan e imprimirlas con el diseño del
 * negocio. Lo que se muestra depende de `scope` (ver `LabelScope`).
 *
 * Flujo:
 *   1. `useLabelData` carga productos, negocio (nombre y logo) y el diseño.
 *   2. La persona pone cantidades; la vista previa y el total se actualizan.
 *   3. «Imprimir»: se dibujan todas las páginas escondidas (`LabelSheet`) y
 *      `printLabels` las manda a la impresora con el tamaño exacto del papel.
 */
export function LabelPrintModal({ scope, onClose }: LabelPrintModalProps) {
  const { can } = useSession();
  const { state, setDesign } = useLabelData();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    initialQuantities(scope),
  );
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
  const total = totalLabels(requests);

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
    setQuantities((current) => ({ ...current, [productId]: parseQuantity(text) }));
  }

  const single = scope.kind === 'product' ? byId.get(scope.productId) : undefined;
  const title =
    scope.kind === 'product'
      ? `Imprimir etiqueta${single === undefined ? '' : ` · ${single.name}`}`
      : scope.kind === 'order'
        ? `Imprimir etiquetas · pedido ${scope.orderNumber}`
        : 'Imprimir etiquetas';

  if (state.phase !== 'ready') {
    return (
      <Modal title={title} size="wide" onClose={onClose}>
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
  const orderMissing =
    scope.kind === 'order' ? scope.items.filter((item) => !byId.has(item.productId)).length : 0;

  /** Resumen, posición inicial y avisos: igual en los tres modos. */
  const summary = (
    <>
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
            Para aprovechar una hoja ya usada: de 1 a {perPage}, de izquierda a derecha y de arriba
            abajo.
          </span>
        </label>
      ) : null}

      {design.show.barcode && withoutBarcode > 0 ? (
        <p className="hint" role="status">
          {scope.kind === 'product'
            ? 'Este producto no tiene código de barras: la etiqueta sale sin barras'
            : withoutBarcode === 1
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
    </>
  );

  return (
    <Modal title={title} size="wide" onClose={onClose}>
      <div className="toolbar">
        <p className="muted" style={{ margin: 0, marginRight: 'auto' }}>
          Diseño del negocio: <strong>{spec.name}</strong> · {shownFields} de{' '}
          {LABEL_FIELD_ORDER.length} datos.
          {can('business.edit') ? null : ' Lo define el Encargado.'}
        </p>
        {can('business.edit') ? (
          <div className="report-actions__group" role="group" aria-label="Diseño de la etiqueta">
            <button
              type="button"
              className="report-actions__button"
              title="Elegir el tamaño y los datos de la etiqueta"
              onClick={() => setCustomizing(true)}
            >
              <NavIcon name="sliders" size={18} />
              Personalizar
            </button>
          </div>
        ) : null}
      </div>

      {scope.kind === 'product' ? (
        single === undefined ? (
          <p className="alert alert--warning" role="status">
            El producto está desactivado: no se imprimen etiquetas de lo que ya no se vende.
          </p>
        ) : (
          <div className="customize">
            <LabelPreview product={single} design={design} business={business} maxWidth={440} />
            <div className="customize__side">
              <dl className="order-meta" aria-label="Producto">
                <dt>Código</dt>
                <dd>{single.code}</dd>
                <dt>Precio de venta</dt>
                <dd>{formatMoney(single.price)}</dd>
              </dl>
              <label className="form__field">
                <span>Cantidad de etiquetas</span>
                <input
                  className="order-quantity"
                  type="number"
                  min="1"
                  max={MAX_COPIES}
                  step="1"
                  inputMode="numeric"
                  value={quantities[single.id] ?? 0}
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setQuantity(single.id, event.target.value)}
                />
                <span className="hint">Una por cada unidad que va a rotular.</span>
              </label>
              {summary}
            </div>
          </div>
        )
      ) : (
        <div className="customize">
          <div>
            {orderMissing > 0 ? (
              <p className="alert alert--warning" role="status">
                {orderMissing === 1
                  ? 'Un producto del pedido está desactivado y no se incluye.'
                  : `${orderMissing} productos del pedido están desactivados y no se incluyen.`}
              </p>
            ) : null}
            {scope.kind === 'catalog' ? (
              <ProductQuickSearch
                products={products}
                label="Agregar producto para etiquetar"
                onPick={(product) =>
                  setQuantities((current) => ({
                    ...current,
                    [product.id]: Math.min((current[product.id] ?? 0) + 1, MAX_COPIES),
                  }))
                }
              />
            ) : null}
            <ProductQuantities
              products={
                scope.kind === 'order'
                  ? scope.items.flatMap((item) => byId.get(item.productId) ?? [])
                  : // En el catálogo solo se listan los elegidos, en el orden en que se agregaron.
                    Object.keys(quantities).flatMap((id) => byId.get(id) ?? [])
              }
              quantities={quantities}
              onQuantity={setQuantity}
              onRemove={
                scope.kind === 'catalog'
                  ? (productId) =>
                      setQuantities((current) => {
                        const { [productId]: _removed, ...rest } = current;

                        return rest;
                      })
                  : undefined
              }
              emptyText={
                scope.kind === 'catalog'
                  ? 'Busque un producto arriba para agregarlo. También puede usar el lector.'
                  : 'No hay productos activos para etiquetar.'
              }
              onClear={() => setQuantities({})}
            />
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
            {summary}
          </div>
        </div>
      )}

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

interface ProductQuantitiesProps {
  /** Las filas a mostrar: lo elegido (catálogo) o las líneas del pedido. */
  products: readonly Product[];
  quantities: Record<string, number>;
  onQuantity: (productId: string, text: string) => void;
  /** «Quitar» de la lista (solo en el catálogo; un pedido trae sus líneas fijas). */
  onRemove?: (productId: string) => void;
  emptyText: string;
  onClear: () => void;
}

/**
 * Tabla de productos con cuántas etiquetas de cada uno. Solo muestra lo que se
 * va a imprimir: el catálogo completo no se lista, se busca (ProductQuickSearch).
 */
function ProductQuantities({
  products,
  quantities,
  onQuantity,
  onRemove,
  emptyText,
  onClear,
}: ProductQuantitiesProps) {
  const pages = usePagination(products, products.length, MODAL_PAGE_SIZE);
  const anyChosen = Object.values(quantities).some((quantity) => quantity > 0);

  return (
    <>
      {anyChosen && onRemove !== undefined ? (
        <div className="toolbar">
          <button type="button" className="button" onClick={onClear}>
            Quitar todas
          </button>
        </div>
      ) : null}
      <div className="table-wrapper">
        <table className="table" aria-label="Productos a etiquetar">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th className="table__number">Precio</th>
              <th className="table__number">Etiquetas</th>
              {onRemove === undefined ? null : <th aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {pages.pageItems.map((product) => (
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
                    onChange={(event) => onQuantity(product.id, event.target.value)}
                  />
                </td>
                {onRemove === undefined ? null : (
                  <td>
                    <button
                      type="button"
                      className="button"
                      aria-label={`Quitar ${product.name}`}
                      onClick={() => onRemove(product.id)}
                    >
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {pages.total === 0 ? (
              <tr>
                <td colSpan={onRemove === undefined ? 4 : 5} className="muted">
                  {emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination {...pages} itemLabel="productos" onPage={pages.setPage} />
    </>
  );
}
