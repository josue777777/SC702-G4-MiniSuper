interface SwitchProps {
  checked: boolean;
  label: string;
  /** Explica por qué no se puede apagar (por ejemplo, una columna obligatoria). */
  disabledReason?: string;
  onChange: (checked: boolean) => void;
}

/**
 * Interruptor encendido/apagado. Es un `checkbox` con `role="switch"`: funciona
 * con teclado (espacio) y los lectores de pantalla lo anuncian como interruptor.
 */
export function Switch({ checked, label, disabledReason, onChange }: SwitchProps) {
  return (
    <label className="switch" title={disabledReason}>
      <span className="switch__label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabledReason !== undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__track" aria-hidden="true" />
    </label>
  );
}
