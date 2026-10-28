import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../services/api-client';
import { platformService } from '../../services/platform.service';
import type { PlatformSettings } from '../../types/platform';
import { usePlatform } from '../platform/platform-context';

/**
 * Configuración › Plataforma (solo Administrador): el nombre general del
 * sistema, que ven todos los negocios y solo cambia la plataforma, y el precio
 * mensual de cada usuario adicional, con el que se cotizan las solicitudes.
 * Aquí no hay datos de ningún negocio: esos los maneja cada Encargado.
 */
export function PlatformSettingsForm() {
  const { setSystemName } = usePlatform();
  const [values, setValues] = useState<PlatformSettings | null>(null);
  const [saved, setSaved] = useState<PlatformSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    platformService
      .getSettings()
      .then((settings) => {
        setValues(settings);
        setSaved(settings);
      })
      .catch((caught: unknown) =>
        setNotice({
          kind: 'error',
          text: caught instanceof ApiError ? caught.message : 'No se pudo leer la configuración.',
        }),
      );
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (values === null) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const stored = await platformService.updateSettings({
        systemName: values.systemName.trim(),
        pricePerExtraUser: values.pricePerExtraUser.trim(),
      });

      setValues(stored);
      setSaved(stored);
      setSystemName(stored.systemName);
      setNotice({ kind: 'success', text: 'Configuración de la plataforma guardada.' });
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : 'No se pudo guardar.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (values === null) {
    return notice === null ? (
      <p className="muted" role="status">
        Cargando configuración de la plataforma…
      </p>
    ) : (
      <div className="alert alert--error" role="alert">
        {notice.text}
      </div>
    );
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  return (
    <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <p className="muted">
        El nombre del sistema lo ven todos los negocios en el inicio de sesión y en el menú; cada
        negocio muestra su propio nombre y logo debajo.
      </p>

      {notice === null ? null : (
        <div
          className={`alert alert--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="platform-system-name">Nombre del sistema</label>
          <input
            id="platform-system-name"
            value={values.systemName}
            maxLength={40}
            onChange={(event) => setValues({ ...values, systemName: event.target.value })}
          />
        </div>
        <div className="form__field">
          <label htmlFor="platform-price">Precio mensual por usuario adicional (₡)</label>
          <input
            id="platform-price"
            inputMode="decimal"
            value={values.pricePerExtraUser}
            onChange={(event) => setValues({ ...values, pricePerExtraUser: event.target.value })}
          />
          <small className="muted">
            Con este precio se cotizan las solicitudes de los negocios.
          </small>
        </div>
      </div>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy || !dirty}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
