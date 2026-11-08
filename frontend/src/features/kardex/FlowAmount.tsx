/**
 * Cantidad que entra o sale en Movimientos, con las MISMAS insignias de tono
 * suave que usa el panel (`badge--ok`, `badge--error`) y siempre con su
 * signo: «+12» entra, «−2» sale. No hay colores propios de esta pantalla. En 0
 * se ve «—», como en toda tabla del sistema.
 */
export function FlowAmount({ value, direction }: { value: number; direction: 'in' | 'out' }) {
  if (value === 0) {
    return <>—</>;
  }

  return (
    <span className={direction === 'in' ? 'badge badge--ok' : 'badge badge--error'}>
      {direction === 'in' ? '+' : '−'}
      {value.toLocaleString('es-CR')}
    </span>
  );
}
