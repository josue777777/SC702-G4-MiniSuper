import { useEffect, useState } from 'react';
import { ApiError } from '../../services/api-client';
import type { AccentColor, FontScale, Preferences } from '../../types/preferences';
import { useAppearance } from '../appearance/appearance-context';

const COLORS: { value: AccentColor; label: string }[] = [
  { value: 'AZUL', label: 'Azul' },
  { value: 'VERDE', label: 'Verde' },
  { value: 'MORADO', label: 'Morado' },
  { value: 'NARANJA', label: 'Naranja' },
  { value: 'GRIS', label: 'Gris' },
];

const SIZES: { value: FontScale; label: string; hint: string }[] = [
  { value: 'NORMAL', label: 'Normal', hint: 'Como viene el sistema.' },
  { value: 'GRANDE', label: 'Grande', hint: 'Todo un poco más grande, más fácil de leer.' },
];

/**
 * Configuración › Apariencia: cada usuario elige la suya (cualquier rol). Los
 * cambios se ven al instante como vista previa; «Guardar» los deja en su
 * cuenta y «Cancelar» (o cerrar sin guardar) vuelve a lo que tenía.
 */
export function AppearancePanel() {
  const { saved, preview, save } = useAppearance();
  const [draft, setDraft] = useState<Preferences>(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const dirty = draft.accentColor !== saved.accentColor || draft.fontScale !== saved.fontScale;

  // Al salir de la pestaña (o cerrar la ventana) sin guardar, se deshace la vista previa.
  useEffect(() => () => preview(null), [preview]);

  function choose(next: Preferences): void {
    setDraft(next);
    setNotice(null);
    preview(next);
  }

  async function handleSave(): Promise<void> {
    setBusy(true);

    try {
      await save(draft);
      setNotice({ kind: 'success', text: 'Apariencia guardada.' });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : 'No se pudo guardar la apariencia.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <p className="muted">
        Solo cambia cómo ve el sistema usted; los demás usuarios no se ven afectados.
      </p>

      {notice === null ? null : (
        <div
          className={`alert alert--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <fieldset className="choice-group">
        <legend>Color principal</legend>
        <div className="color-options">
          {COLORS.map((color) => (
            <label key={color.value} className="color-option">
              <input
                type="radio"
                name="accent-color"
                value={color.value}
                checked={draft.accentColor === color.value}
                onChange={() => choose({ ...draft, accentColor: color.value })}
              />
              <span
                className={`color-option__swatch color-option__swatch--${color.value.toLowerCase()}`}
              />
              {color.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice-group">
        <legend>Tamaño de letra</legend>
        {SIZES.map((size) => (
          <label key={size.value} className="choice-option">
            <input
              type="radio"
              name="font-scale"
              value={size.value}
              checked={draft.fontScale === size.value}
              onChange={() => choose({ ...draft, fontScale: size.value })}
            />
            <span>
              <strong>{size.label}</strong> <small className="muted">{size.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="form__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !dirty}
          onClick={() => void handleSave()}
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft(saved);
            setNotice(null);
            preview(null);
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
