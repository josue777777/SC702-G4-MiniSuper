/**
 * Menú lateral agrupado por cómo se mueve la mercadería en el negocio:
 * Almacén (qué hay), Entradas (lo que llega), Salidas (lo que se va) y
 * Reportes. Cada `to` coincide con una ruta de `app/routes.tsx` y cada
 * opción con las historias que la implementan.
 *
 * La regla del inventario: en Almacén se manejan los DATOS del producto; las
 * CANTIDADES solo cambian por movimientos (entradas, salidas, conteo físico),
 * y el Kardex muestra esos movimientos con su saldo.
 *
 * Cada opción lleva el permiso que pide (ver `types/auth.ts`): el menú solo
 * muestra lo que el rol del usuario puede usar, y un grupo sin opciones
 * visibles no aparece. La API vuelve a exigir el permiso en cada petición.
 */

import type { Permission } from '../types/auth';

export type NavIconName =
  | 'home'
  | 'warehouse'
  | 'entries'
  | 'exits'
  | 'reports'
  | 'user'
  | 'menu'
  | 'list'
  | 'cart'
  | 'truck'
  | 'cash'
  | 'users'
  | 'settings'
  | 'logout';

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
  /** Permiso del rol para ver la opción; sin él, la ve cualquier usuario. */
  permission?: Permission;
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
      {
        kind: 'link',
        to: '/inventory',
        label: 'Inventario',
        stories: 'HU-01 … HU-10',
        permission: 'inventory.read',
      },
      { kind: 'link', to: '/kardex', label: 'Kardex', stories: 'HU-31', permission: 'kardex' },
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
        permission: 'purchasing',
      },
      {
        kind: 'link',
        to: '/suppliers',
        label: 'Proveedores',
        stories: 'HU-21, HU-39',
        permission: 'purchasing',
      },
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
        permission: 'sales',
      },
      {
        kind: 'link',
        to: '/customers',
        label: 'Clientes y fiados',
        stories: 'HU-18, HU-19, HU-36',
        permission: 'customers',
      },
    ],
  },
  {
    kind: 'link',
    to: '/reports',
    label: 'Reportes',
    stories: 'HU-25 … HU-30, HU-40',
    icon: 'reports',
    permission: 'reports.inventory',
  },
  {
    kind: 'group',
    id: 'settings',
    icon: 'settings',
    label: 'Configuración',
    items: [
      {
        kind: 'link',
        to: '/settings/users',
        label: 'Usuarios',
        stories: 'HU-11 … HU-15 (usuarios y roles)',
        permission: 'settings',
      },
    ],
  },
];

/** El menú que le corresponde al rol: sin las opciones que no puede usar ni los grupos vacíos. */
export function visibleNavigation(
  can: (permission: Permission) => boolean,
): (NavItem | NavGroup)[] {
  const allowed = (item: NavItem) => item.permission === undefined || can(item.permission);

  return NAVIGATION.flatMap((entry): (NavItem | NavGroup)[] => {
    if (entry.kind === 'link') {
      return allowed(entry) ? [entry] : [];
    }

    const items = entry.items.filter(allowed);

    return items.length === 0 ? [] : [{ ...entry, items }];
  });
}

/** Grupo que contiene la ruta actual, para abrirlo al entrar a la pantalla. */
export function findGroupOfPath(pathname: string): string | undefined {
  return NAVIGATION.find(
    (entry): entry is NavGroup =>
      entry.kind === 'group' &&
      entry.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)),
  )?.id;
}
