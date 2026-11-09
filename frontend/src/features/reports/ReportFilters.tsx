import type { ReactNode } from 'react';
import type { ReportKind } from '../../types/reports';
import { formatMoney } from '../products/money';
import {
  hasFilters,
  hasProductFilters,
  type FilterDraft,
  type FilterErrors,
} from './report-filters';
import { PERIOD_LABELS, periodRange, presetOf, type PeriodPreset } from './report-periods';
import type { ReportSync } from './use-commercial-report';

interface ReportFiltersProps {
  kind: ReportKind;
  draft: FilterDraft;
  errors: FilterErrors;
  categories: { id: string; name: string }[];
  categoriesError: boolean;
  /** Si lo que se ve ya corresponde a los filtros, o se está actualizando. */
  sync: ReportSync;
  onChange: <K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) => void;
  onChangeMany: (changes: Partial<FilterDraft>) => void;
  /** Quita categoría y precios (el período se mantiene). */
  onClear: () => void;
  /** Vuelve a consultar (el reporte de deudas es una foto del momento). */
  onRefresh: () => void;
}

/**
 * Barra de filtros de los reportes: compacta, en una fila, y SIN botón de
 * consultar. Cada cambio se aplica solo (ver `useCommercialReport`), como en
 * los sistemas de reportes habituales:
 *
 * - Período rápido (Hoy, Este mes, Mes pasado…) junto a Desde y Hasta. Si se
 *   cambia una fecha a mano, el período pasa a «Personalizado».
 * - Categoría y rango de precio, solo en Ventas.
 * - Los filtros activos se ven como etiquetas que se quitan con ✕.
 * - Los errores se muestran junto al campo, y mientras haya uno no se consulta.
 */
export function ReportFilters({
  kind,
  draft,
  errors,
  categories,
  categoriesError,
  sync,
  onChange,
  onChangeMany,
  onClear,
  onRefresh,
}: ReportFiltersProps) {
  if (!hasFilters(kind)) {
    return (
      <div className="filter-bar card" aria-label="Filtros del reporte" role="group">
        <div className="filter-bar__row">
          <p className="muted filter-bar__note">Saldos actuales de todos los clientes.</p>
          <div className="filter-bar__end">
            <SyncStatus sync={sync} />
            <button
              type="button"
              className="button"
              disabled={sync === 'pending'}
              onClick={onRefresh}
              title="Volver a consultar"
            >
              ↻ Actualizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const preset = presetOf(draft.from, draft.to);
  const category = categories.find((entry) => entry.id === draft.categoryId);
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (hasProductFilters(kind)) {
    if (draft.categoryId !== '') {
      chips.push({
        key: 'category',
        label: `Categoría: ${category?.name ?? '…'}`,
        clear: () => onChange('categoryId', ''),
      });
    }

    if (draft.minPrice !== '' && errors.minPrice === undefined) {
      chips.push({
        key: 'min',
        label: `Precio desde ${formatMoney(draft.minPrice)}`,
        clear: () => onChange('minPrice', ''),
      });
    }

    if (draft.maxPrice !== '' && errors.maxPrice === undefined) {
      chips.push({
        key: 'max',
        label: `Precio hasta ${formatMoney(draft.maxPrice)}`,
        clear: () => onChange('maxPrice', ''),
      });
    }
  }

  // Estado y «Actualizar»: en la misma fila de los campos si caben; con
  // filtros activos, junto a sus etiquetas (así no queda una fila casi vacía).
  const status = (
    <div className="filter-bar__end">
      <SyncStatus sync={sync} />
      {/* Con los mismos filtros: trae lo que cambió (por ejemplo, una venta recién hecha). */}
      <button
        type="button"
        className="button"
        disabled={sync !== 'done'}
        onClick={onRefresh}
        title="Volver a consultar con los mismos filtros"
      >
        ↻ Actualizar
      </button>
    </div>
  );

  return (
    <form
      noValidate
      aria-label="Filtros del reporte"
      className="filter-bar card"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="filter-bar__row">
        <Field id="report-period" label="Período">
          <select
            id="report-period"
            value={preset}
            onChange={(event) => {
              const next = event.target.value as PeriodPreset;

              if (next !== 'custom') {
                onChangeMany(periodRange(next));
              }
            }}
          >
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <option key={key} value={key} disabled={key === 'custom'}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="report-from" label="Desde" error={errors.from}>
          <input
            id="report-from"
            type="date"
            value={draft.from}
            onChange={(event) => onChange('from', event.target.value)}
            aria-invalid={errors.from !== undefined}
            aria-describedby={errors.from === undefined ? undefined : 'report-from-error'}
          />
        </Field>
        <Field id="report-to" label="Hasta" error={errors.to}>
          <input
            id="report-to"
            type="date"
            value={draft.to}
            onChange={(event) => onChange('to', event.target.value)}
            aria-invalid={errors.to !== undefined}
            aria-describedby={errors.to === undefined ? undefined : 'report-to-error'}
          />
        </Field>

        {hasProductFilters(kind) ? (
          <>
            <Field
              id="report-category"
              label="Categoría actual del producto"
              error={categoriesError ? 'No se pudieron cargar las categorías.' : undefined}
              wide
            >
              <select
                id="report-category"
                value={draft.categoryId}
                onChange={(event) => onChange('categoryId', event.target.value)}
              >
                <option value="">Todas las categorías</option>
                {categories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="report-min-price" label="Precio mínimo" error={errors.minPrice} narrow>
              <input
                id="report-min-price"
                type="text"
                inputMode="decimal"
                placeholder="₡ Sin mínimo"
                value={draft.minPrice}
                onChange={(event) => onChange('minPrice', event.target.value)}
                aria-invalid={errors.minPrice !== undefined}
                aria-describedby={
                  errors.minPrice === undefined ? undefined : 'report-min-price-error'
                }
              />
            </Field>
            <Field id="report-max-price" label="Precio máximo" error={errors.maxPrice} narrow>
              <input
                id="report-max-price"
                type="text"
                inputMode="decimal"
                placeholder="₡ Sin máximo"
                value={draft.maxPrice}
                onChange={(event) => onChange('maxPrice', event.target.value)}
                aria-invalid={errors.maxPrice !== undefined}
                aria-describedby={
                  errors.maxPrice === undefined ? undefined : 'report-max-price-error'
                }
              />
            </Field>
          </>
        ) : null}
        {chips.length === 0 ? status : null}
      </div>

      {chips.length === 0 ? null : (
        <div className="filter-bar__meta">
          {
            <ul className="filter-chips" aria-label="Filtros activos">
              {chips.map((chip) => (
                <li key={chip.key} className="filter-chip">
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    className="filter-chip__remove"
                    aria-label={`Quitar filtro: ${chip.label}`}
                    onClick={chip.clear}
                  >
                    ×
                  </button>
                </li>
              ))}
              {chips.length > 1 ? (
                <li>
                  <button type="button" className="button" onClick={onClear}>
                    Limpiar filtros
                  </button>
                </li>
              ) : null}
            </ul>
          }
          {status}
        </div>
      )}
    </form>
  );
}

/** «Actualizando…» mientras se consulta; «Al día» cuando lo mostrado corresponde a los filtros. */
function SyncStatus({ sync }: { sync: ReportSync }) {
  return (
    <span
      className={`filter-bar__status filter-bar__status--${sync}`}
      aria-live="polite"
      data-report-sync={sync}
    >
      {sync === 'pending' ? 'Actualizando…' : sync === 'done' ? 'Al día' : 'Revise los filtros'}
    </span>
  );
}

function Field({
  id,
  label,
  error,
  wide = false,
  narrow = false,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  wide?: boolean;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`filter-bar__field${wide ? ' filter-bar__field--wide' : ''}${
        narrow ? ' filter-bar__field--narrow' : ''
      }`}
    >
      <label htmlFor={id}>{label}</label>
      {children}
      {error === undefined ? null : (
        <p id={`${id}-error`} className="form__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
