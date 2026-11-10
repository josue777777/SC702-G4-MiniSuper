import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { NavIcon } from '../../layouts/NavIcon';
import { Switch } from '../../components/Switch';
import { ApiError } from '../../services/api-client';
import { labelsService } from '../../services/labels.service';
import type { LabelDesign, LabelField, LabelSize } from '../../types/labels';
import {
  DEFAULT_LABEL_DESIGN,
  identifiesProduct,
  LABEL_FIELD_LABELS,
  LABEL_FIELD_ORDER,
  LABEL_SIZE_ORDER,
  LABEL_SIZE_SPECS,
} from './label-sizes';
import { LabelPreview } from './LabelPreview';
import type { LabelBusiness, LabelProduct } from './ProductLabel';

interface LabelCustomizeModalProps {
  design: LabelDesign;
  business: LabelBusiness;
  /** Producto con el que se muestra la vista previa. */
  sample: LabelProduct;
  onSaved: (design: LabelDesign) => void;
  onClose: () => void;
}

/**
 * «Personalizar etiqueta» (HU-07): el Encargado elige el tamaño y qué datos
 * lleva. Se guarda para TODO el negocio (`PUT /api/business/label-design`): es
 * el rotulado de la empresa y todos imprimen igual. La vista previa cambia
 * mientras se tocan las opciones; se guarda al confirmar.
 */
export function LabelCustomizeModal({
  design,
  business,
  sample,
  onSaved,
  onClose,
}: LabelCustomizeModalProps) {
  const [size, setSize] = useState<LabelSize>(design.size);
  const [show, setShow] = useState(design.show);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft: LabelDesign = { size, show };
  const valid = identifiesProduct(show);

  function toggle(field: LabelField, visible: boolean): void {
    setShow((current) => ({ ...current, [field]: visible }));
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      onSaved(await labelsService.saveDesign(draft));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo guardar el diseño.');
      setSaving(false);
    }
  }

  return (
    <Modal title="Personalizar etiqueta" size="wide" onClose={onClose}>
      <p className="muted">
        Es el rotulado del negocio: lo que guarde aquí lo usan todos los usuarios al imprimir.
      </p>

      <div className="customize">
        <div className="customize__side">
          <fieldset>
            <legend>Qué lleva la etiqueta</legend>
            <div className="customize__grid">
              {LABEL_FIELD_ORDER.map((field) => (
                <Switch
                  key={field}
                  label={LABEL_FIELD_LABELS[field]}
                  checked={show[field]}
                  onChange={(visible) => toggle(field, visible)}
                />
              ))}
            </div>
          </fieldset>
          {valid ? null : (
            <p className="form__error" role="alert">
              Muestre al menos el nombre, el código, el código de barras o el QR: si no, no se sabe
              qué producto es.
            </p>
          )}
          {show.logo && business.logo === null ? (
            <p className="hint">El negocio no tiene logo. Se sube en Configuración › General.</p>
          ) : null}
          <fieldset>
            <legend>Tamaño</legend>
            {(['roll', 'sheet'] as const).map((kind) => (
              <div key={kind}>
                <p className="hint">
                  {kind === 'roll'
                    ? 'Rollo térmico (impresora de etiquetas): una por sticker'
                    : 'Hoja carta de stickers (impresora normal)'}
                </p>
                {LABEL_SIZE_ORDER.filter((id) => LABEL_SIZE_SPECS[id].kind === kind).map((id) => (
                  <label key={id} className="customize__radio">
                    <input
                      type="radio"
                      name="label-size"
                      checked={size === id}
                      onChange={() => setSize(id)}
                    />
                    {LABEL_SIZE_SPECS[id].name}
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        </div>

        <div className="customize__side">
          <LabelPreview product={sample} design={draft} business={business} maxWidth={300} />
        </div>
      </div>

      {error === null ? null : (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      <div className="form__actions customize__actions">
        <div
          className="report-actions__group"
          role="group"
          aria-label="Volver al diseño de fábrica"
        >
          <button
            type="button"
            className="report-actions__button"
            title="Volver a las opciones de fábrica"
            onClick={() => {
              setSize(DEFAULT_LABEL_DESIGN.size);
              setShow(DEFAULT_LABEL_DESIGN.show);
            }}
          >
            <NavIcon name="reset" size={18} />
            Restablecer
          </button>
        </div>
        <span className="customize__spacer" />
        <button type="button" className="button" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => void save()}
          disabled={!valid || saving}
        >
          {saving ? 'Guardando…' : 'Guardar diseño'}
        </button>
      </div>
    </Modal>
  );
}
