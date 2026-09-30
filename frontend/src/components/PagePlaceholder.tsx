import type { ReactNode } from 'react';

interface PagePlaceholderProps {
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
 * componente real de esa página.
 */
export function PagePlaceholder({
  title,
  summary,
  stories,
  tasks,
  children,
}: PagePlaceholderProps) {
  return (
    <>
      <header className="page-header">
        <h1>{title}</h1>
        <p>{summary}</p>
      </header>

      {children}

      <section className="card">
        <header className="card__header">
          <h2>Pendiente de implementar</h2>
        </header>
        <p className="muted">Historias de usuario: {stories}</p>
        <ul className="todo-list">
          {tasks.map((task) => (
            <li key={task}>{task}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
