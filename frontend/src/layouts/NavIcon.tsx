import type { NavIconName } from './navigation';

/**
 * Íconos del menú lateral dibujados en SVG: no agregan dependencias y toman
 * el color del texto (`currentColor`), así cambian solos con el tema.
 */
const PATHS: Record<NavIconName, string[]> = {
  // Reportes
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 19h16'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 13h6', 'M9 17h6'],
  sliders: [
    'M4 6h10',
    'M18 6h2',
    'M4 12h4',
    'M12 12h8',
    'M4 18h12',
    'M20 18h0',
    'M16 4v4',
    'M10 10v4',
    'M18 16v4',
  ],
  // Caja (punto de venta)
  barcode: ['M3 5v14', 'M7 5v14', 'M10 5v14', 'M14 5v14', 'M17 5v14', 'M21 5v14'],
  card: ['M2 6h20v12H2z', 'M2 10h20', 'M6 15h4'],
  ledger: [
    'M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z',
    'M5 19a2 2 0 0 1 2-2h12',
    'M9 7h6',
    'M9 11h6',
  ],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  warehouse: ['M3 21V8l9-5 9 5v13', 'M7 21v-8h10v8', 'M7 17h10'],
  entries: ['M12 3v10', 'M8 9l4 4 4-4', 'M4 15v5h16v-5'],
  exits: ['M12 13V3', 'M8 7l4-4 4 4', 'M4 15v5h16v-5'],
  reports: ['M4 20h16', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4 4-6 8-6s8 2 8 6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h1', 'M4 12h1', 'M4 18h1'],
  cart: ['M3 4h2l2.4 11h11l2-8H6.2', 'M9 20h.01', 'M17 20h.01'],
  truck: [
    'M2 6h12v10H2z',
    'M14 10h4l3 3v3h-7',
    'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ],
  cash: ['M3 7h18v10H3z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 10v.01', 'M18 14v.01'],
  users: [
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M2 21c0-4 3-6 7-6s7 2 7 6',
    'M17 11a3 3 0 1 0-1-5.8',
    'M22 21c0-3-2-5-5-5.5',
  ],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  ],
  store: [
    'M3 9l2-5h14l2 5',
    'M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z',
    'M5 13v8h14v-8',
    'M10 21v-5h4v5',
  ],
  inbox: ['M3 13l3-8h12l3 8', 'M3 13v6h18v-6', 'M3 13h5l1 3h6l1-3h5'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
};

export function NavIcon({ name, size = 20 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
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
