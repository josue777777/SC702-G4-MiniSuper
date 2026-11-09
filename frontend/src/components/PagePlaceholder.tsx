import type { ReactNode } from 'react';
import type { NavIconName } from '../layouts/navigation';
import { PageHeader } from './PageHeader';
import { PendingWork } from './PendingWork';

interface PagePlaceholderProps {
  /** El ícono del encabezado (el mismo del menú). */
  icon: NavIconName;
  title: string;
  /** Qué resuelve la pantalla, en una frase. */
  summary: string;
  /** Códigos de las historias de usuario que se implementarán aquí. */
  stories: string;
  /** Tareas concretas que el equipo debe reconocer al abrir la pantalla. */
  tasks: string[];
  children?: ReactNode;
}

/**
 * Plantilla de las pantallas todavía no implementadas.
 *
 * No es relleno decorativo: cada pantalla declara sus historias de usuario y
 * las tareas pendientes, de modo que el tablero del sprint y el código dicen lo
 * mismo. Al implementar la historia se borra el `PagePlaceholder` y queda el
 * componente real de esa página. La tarjeta de pendientes solo se ve en
 * desarrollo (ver `PendingWork`).
 */
export function PagePlaceholder({
  icon,
  title,
  summary,
  stories,
  tasks,
  children,
}: PagePlaceholderProps) {
  return (
    <>
      <PageHeader icon={icon} title={title}>
        {summary}
      </PageHeader>

      {children}

      <PendingWork stories={stories} tasks={tasks} />
    </>
  );
}
