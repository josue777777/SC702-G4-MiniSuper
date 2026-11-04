interface PendingWorkProps {
  /** Códigos de las historias de usuario pendientes en esta pantalla. */
  stories: string;
  /** Tareas concretas que el equipo debe reconocer al abrir la pantalla. */
  tasks: string[];
}

/**
 * Tarjeta «Pendiente de implementar»: la lista de tareas del equipo en la
 * pantalla donde se van a programar.
 *
 * Es información para quien desarrolla, no para quien usa el sistema, así que
 * solo se ve en desarrollo (`npm run dev`). En la versión publicada
 * (`npm run build`) no se dibuja: el usuario no necesita leer números de
 * historia. Las tareas siguen en los issues de GitHub.
 */
export function PendingWork({ stories, tasks }: PendingWorkProps) {
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
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
  );
}
