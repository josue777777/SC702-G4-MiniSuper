/**
 * Formateo de importes para mostrarlos.
 *
 * La API entrega el dinero como cadena canónica (`"1500.00"`). Aquí solo se
 * presenta al usuario con el símbolo del colón costarricense y dos decimales;
 * lo que se envía de vuelta sigue siendo el valor canónico, sin símbolos.
 */
export function formatMoney(value: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    // Si llega algo que no se puede interpretar, se muestra tal cual: es más
    // útil ver el valor original que un "NaN" en la tabla.
    return value;
  }

  return `₡${amount.toLocaleString('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
