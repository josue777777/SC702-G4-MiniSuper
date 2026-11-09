import type { ReactNode } from 'react';
import { NavIcon } from '../layouts/NavIcon';
import type { NavIconName } from '../layouts/navigation';

interface PageHeaderProps {
  /** El ícono de la pantalla: el mismo dibujo que en el menú, cuando lo tiene. */
  icon: NavIconName;
  title: string;
  /** La frase que explica para qué sirve la pantalla. */
  children: ReactNode;
}

/**
 * Encabezado de TODAS las pantallas, igual en todas: a la izquierda un cuadro
 * en el oscuro del menú (`--color-sidebar`) con el ícono de la pantalla, y al
 * lado el título y su frase. El ícono ayuda a reconocer de un vistazo en qué
 * área se está (Movimientos ⇅, Inventario, Pedidos…). Es decorativo
 * (`aria-hidden`): el título sigue siendo el nombre de la pantalla.
 */
export function PageHeader({ icon, title, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      <span className="page-header__icon" aria-hidden="true">
        <NavIcon name={icon} size={24} />
      </span>
      <div className="page-header__text">
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </header>
  );
}
