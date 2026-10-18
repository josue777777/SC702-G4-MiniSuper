import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Category } from '../../types/categories';
import { useCategoryForm } from './use-category-form';

interface CategoryFormProps {
  /**
   * Se llama tras guardar con la categoría creada, para que la pantalla
   * refresque sus opciones (y, en el modal de producto, la deje seleccionada).
   */
  onCreated: (category: Category) => Promise<void>;
  onClose: () => void;
}

/** Formulario de alta de categoría (HU-04). */
export function CategoryForm({ onCreated, onClose }: CategoryFormProps) {
  const { busy, error, existing, listError, create, showExisting, hideExisting } =
    useCategoryForm(onCreated);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedName = name.trim();

    if (trimmedName === '') {
      setNameError('Escriba el nombre de la categoría.');
      return;
    }

    setNameError(undefined);

    // Solo se cierra si se guardó: ante un duplicado queda abierto con el error.
    if (await create({ name: trimmedName, description: description.trim() })) {
      onClose();
    }
  }

  return (
    <section className="card">
      <header className="card__header">
        <h2>Nueva categoría</h2>
      </header>

      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="category-name">Nombre</label>
            <input
              id="category-name"
              value={name}
              maxLength={80}
              autoComplete="off"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
            />
            {nameError === undefined ? null : <p className="form__error">{nameError}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="category-description">Descripción (opcional)</label>
            <input
              id="category-description"
              value={description}
              maxLength={255}
              autoComplete="off"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDescription(event.target.value)
              }
            />
          </div>
        </div>

        {error === null ? null : (
          <div className="form__error-row" role="alert">
            <p className="form__error">{error.message}</p>
            {error.duplicate ? (
              <button type="button" className="button" onClick={() => void showExisting()}>
                Ver categorías existentes
              </button>
            ) : null}
          </div>
        )}

        {listError === null ? null : <p className="form__error">{listError}</p>}

        {existing === null ? null : (
          <div>
            <p className="muted">
              Categorías existentes ({existing.length}){' '}
              <button type="button" className="button" onClick={hideExisting}>
                Ocultar
              </button>
            </p>
            <ul className="category-list">
              {existing.map((category) => (
                <li key={category.id}>
                  {category.name}
                  {category.isActive ? '' : ' (inactiva)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
