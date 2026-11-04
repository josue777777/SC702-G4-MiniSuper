import { useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import { Switch } from '../../components/Switch';
import {
  DEFAULT_REPORT_PREFERENCES,
  type Orientation,
  type ReportPreferences,
} from './report-preferences';

interface CustomizableColumn {
  key: string;
  label: string;
}

interface ReportCustomizeModalProps {
  /** Columnas del reporte, en orden. */
  columns: CustomizableColumn[];
  /** La que nunca se oculta (sin ella la fila no se entiende). Por defecto, la primera. */
  requiredKey?: string;
  preferences: ReportPreferences;
  /** Opciones propias de un reporte (por ejemplo, el orden del inventario). */
  extra?: ReactNode;
  onApply: (preferences: ReportPreferences) => void;
  onClose: () => void;
}

/**
 * «Personaliza tu reporte» (HU-40): el usuario deja activas las columnas que
 * quiere ver; la tabla, el PDF y el Excel usan esas mismas. También elige la
 * hoja del PDF. Los cambios se aplican al confirmar, no mientras se tocan.
 */
export function ReportCustomizeModal({
  columns,
  requiredKey,
  preferences,
  extra,
  onApply,
  onClose,
}: ReportCustomizeModalProps) {
  const [hidden, setHidden] = useState<string[]>(preferences.hidden);
  const [orientation, setOrientation] = useState<Orientation>(preferences.orientation);
  const required = requiredKey ?? columns[0]?.key;

  function toggle(key: string, visible: boolean): void {
    setHidden((current) =>
      visible ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  return (
    <Modal title="Personaliza tu reporte" size="wide" onClose={onClose}>
      <p className="muted">
        Deje activas las columnas que desea incluir. La tabla, el PDF y el Excel usan las mismas.
      </p>

      <div className="customize">
        <fieldset className="customize__columns">
          <legend>Columnas disponibles</legend>
          <div className="customize__grid">
            {columns.map((column) => (
              <Switch
                key={column.key}
                label={column.label}
                checked={column.key === required || !hidden.includes(column.key)}
                disabledReason={column.key === required ? 'Siempre se incluye' : undefined}
                onChange={(visible) => toggle(column.key, visible)}
              />
            ))}
          </div>
        </fieldset>

        <div className="customize__side">
          <fieldset>
            <legend>Hoja del PDF</legend>
            <label className="customize__radio">
              <input
                type="radio"
                name="report-orientation"
                checked={orientation === 'portrait'}
                onChange={() => setOrientation('portrait')}
              />
              Vertical
            </label>
            <label className="customize__radio">
              <input
                type="radio"
                name="report-orientation"
                checked={orientation === 'landscape'}
                onChange={() => setOrientation('landscape')}
              />
              Horizontal (más columnas)
            </label>
          </fieldset>
          {extra}
        </div>
      </div>

      <div className="form__actions customize__actions">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setHidden(DEFAULT_REPORT_PREFERENCES.hidden);
            setOrientation(DEFAULT_REPORT_PREFERENCES.orientation);
          }}
        >
          Restablecer
        </button>
        <span className="customize__spacer" />
        <button type="button" className="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => onApply({ hidden, orientation })}
        >
          Aplicar
        </button>
      </div>
    </Modal>
  );
}
