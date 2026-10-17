import type { NavIconName } from './navigation';

/**
 * Íconos del menú lateral dibujados en SVG: no agregan dependencias y toman
 * el color del texto (`currentColor`), así cambian solos con el tema.
 */
const PATHS: Record<NavIconName, string[]> = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  warehouse: ['M3 21V8l9-5 9 5v13', 'M7 21v-8h10v8', 'M7 17h10'],
  entries: ['M12 3v10', 'M8 9l4 4 4-4', 'M4 15v5h16v-5'],
  exits: ['M12 13V3', 'M8 7l4-4 4 4', 'M4 15v5h16v-5'],
  reports: ['M4 20h16', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4 4-6 8-6s8 2 8 6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
