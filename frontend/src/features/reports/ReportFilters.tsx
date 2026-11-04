import type { FormEvent } from 'react';
import type { ReportKind } from '../../types/reports';
import {
  hasFilters,
  hasProductFilters,
  type FilterDraft,
  type FilterErrors,
} from './report-filters';

interface ReportFiltersProps {
  kind: ReportKind;
  draft: FilterDraft;
  errors: FilterErrors;
  categories: { id: string; name: string }[];
  categoriesError: boolean;
  busy: boolean;
  onChange: <K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) => void;
  onSubmit: () => void;
}

/** Filtros del reporte con sus errores a la vista. El de deudas no tiene filtros: solo se actualiza. */
export function ReportFilters({
  kind,
  draft,
  errors,
  categories,
  categoriesError,
  busy,
  onChange,
  onSubmit,
}: ReportFiltersProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  if (!hasFilters(kind)) {
    return (
      <form onSubmit={submit} className="form__error-row">
        <p className="muted">Saldos actuales de todos los clientes.</p>
        <button type="submit" className="button" disabled={busy}>
          Actualizar
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Filtros del reporte">
      <div className="form__grid">
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
            >
              <select
                id="report-category"
                value={draft.categoryId}
                onChange={(event) => onChange('categoryId', event.target.value)}
              >
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="report-min-price" label="Precio mínimo" error={errors.minPrice}>
              <input
                id="report-min-price"
                type="text"
                inputMode="decimal"
                placeholder="Sin mínimo"
                value={draft.minPrice}
                onChange={(event) => onChange('minPrice', event.target.value)}
                aria-invalid={errors.minPrice !== undefined}
                aria-describedby={
                  errors.minPrice === undefined ? undefined : 'report-min-price-error'
                }
              />
            </Field>
            <Field id="report-max-price" label="Precio máximo" error={errors.maxPrice}>
              <input
                id="report-max-price"
                type="text"
                inputMode="decimal"
                placeholder="Sin máximo"
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
      </div>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          Consultar
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="form__field">
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
