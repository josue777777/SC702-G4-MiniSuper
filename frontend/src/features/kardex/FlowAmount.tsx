/**
 * Cantidad que entra o sale en Movimientos, con los tonos del panel
 * (`--color-ok` verde para lo que entra, `--color-error` rojo para lo que
 * sale) como color de texto: en la tabla, la cifra sola; en los resúmenes, con
 * su signo («+30», «−12»).
 *
 * En la tabla el 0 no se ve: la celda queda en blanco y la vista va directo a
 * la cifra que sí movió el stock (una línea entra O sale, casi nunca las dos).
 * El 0 sigue ahí para los lectores de pantalla (`visually-hidden`). En los
 * resúmenes («Entró 0») sí se ve.
 */
export function FlowAmount({
  value,
  direction,
  signed = false,
}: {
  value: number;
  direction: 'in' | 'out';
  /** Con «+» o «−» delante (resúmenes y totales). */
  signed?: boolean;
}) {
  const sign = !signed || value === 0 ? '' : direction === 'in' ? '+' : '−';

  if (!signed && value === 0) {
    return <span className="visually-hidden">0</span>;
  }

  return (
    <span className={direction === 'in' ? 'text-ok' : 'text-error'}>
      {sign}
      {value.toLocaleString('es-CR')}
    </span>
  );
}
