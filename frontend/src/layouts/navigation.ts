/**
 * Menú lateral agrupado por cómo se mueve la mercadería en el negocio:
 * Almacén (qué hay), Entradas (lo que llega), Salidas (lo que se va) y
 * Reportes. Cada `to` coincide con una ruta de `app/routes.tsx` y cada
 * opción con las historias que la implementan.
 *
 * La regla del inventario: en Almacén se manejan los DATOS del producto; las
 * CANTIDADES solo cambian por movimientos (entradas, salidas, conteo físico),
 * y el Kardex muestra esos movimientos con su saldo.
 */

export type NavIconName = 'home' | 'warehouse' | 'entries' | 'exits' | 'reports' | 'user' | 'menu';

export interface NavItem {
  kind: 'link';
  to: string;
  label: string;
  /** Historias de usuario de la pantalla, para el `title` del enlace. */
  stories: string;
  /** `true` solo en `/`, para que no quede activo en todas las rutas. */
  end?: boolean;
  /** Solo las opciones de primer nivel llevan ícono. */
  icon?: NavIconName;
}

export interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: NavIconName;
  items: NavItem[];
}

/** Menú en orden: enlaces sueltos y grupos desplegables. */
export const NAVIGATION: (NavItem | NavGroup)[] = [
  {
    kind: 'link',
    to: '/',
    label: 'Inicio',
    stories: 'HU-08, HU-09, HU-37',
    end: true,
    icon: 'home',
  },
  {
    kind: 'group',
    id: 'warehouse',
    icon: 'warehouse',
    label: 'Almacén',
    items: [
      { kind: 'link', to: '/products', label: 'Productos', stories: 'HU-01 … HU-05' },
      { kind: 'link', to: '/inventory', label: 'Inventario', stories: 'HU-06 … HU-10' },
      { kind: 'link', to: '/kardex', label: 'Kardex', stories: 'HU-31' },
    ],
  },
  {
    kind: 'group',
    id: 'entries',
    icon: 'entries',
    label: 'Entradas',
    items: [
      {
        kind: 'link',
        to: '/orders',
        label: 'Pedidos a proveedor',
        stories: 'HU-22 … HU-24, HU-38',
      },
      { kind: 'link', to: '/suppliers', label: 'Proveedores', stories: 'HU-21, HU-39' },
    ],
  },
  {
    kind: 'group',
    id: 'exits',
    icon: 'exits',
    label: 'Salidas',
    items: [
      {
        kind: 'link',
        to: '/sales',
        label: 'Ventas',
        stories: 'HU-16, HU-17, HU-20, HU-34, HU-35',
      },
      {
        kind: 'link',
        to: '/customers',
        label: 'Clientes y fiados',
        stories: 'HU-18, HU-19, HU-36',
      },
    ],
  },
  {
    kind: 'link',
    to: '/reports',
    label: 'Reportes',
    stories: 'HU-25 … HU-30, HU-40',
    icon: 'reports',
  },
];

/** Grupo que contiene la ruta actual, para abrirlo al entrar a la pantalla. */
export function findGroupOfPath(pathname: string): string | undefined {
  return NAVIGATION.find(
    (entry): entry is NavGroup =>
      entry.kind === 'group' &&
      entry.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)),
  )?.id;
}
