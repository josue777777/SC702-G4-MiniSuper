/**
 * Cantidad que entra o sale en Movimientos, con los tonos del panel
 * (`--color-ok` verde para lo que entra, `--color-error` rojo para lo que
 * sale) como color de texto: en la tabla, la cifra sola (también el 0, para
 * leer la columna de corrido); en los resúmenes, con su signo («+30», «−12»).
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

  return (
    <span className={direction === 'in' ? 'text-ok' : 'text-error'}>
      {sign}
      {value.toLocaleString('es-CR')}
    </span>
  );
}
