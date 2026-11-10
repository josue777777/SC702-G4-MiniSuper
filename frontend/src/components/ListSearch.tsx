interface ListSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Qué se puede buscar, por ejemplo «Buscar por nombre o teléfono». */
  placeholder: string;
  /** Nombre del campo para lectores de pantalla y pruebas. */
  label: string;
}

/**
 * Buscador de una lista: filtra mientras se escribe, sin botón. Va a la
 * izquierda de la barra de herramientas (`.toolbar`), igual que en Inventario.
 */
export function ListSearch({ value, onChange, placeholder, label }: ListSearchProps) {
  return (
    <div className="toolbar__search" role="search">
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {value === '' ? null : (
        <button type="button" className="button" onClick={() => onChange('')}>
          Limpiar
        </button>
      )}
    </div>
  );
}
