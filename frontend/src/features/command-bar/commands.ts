import { matchesSearch } from '../../components/list-search';
import { visibleNavigation } from '../../layouts/navigation';
import type { Permission } from '../../types/auth';

/**
 * Comandos de la barra rápida (`Ctrl + K` o `⌘ + K`), sin React: ir a una
 * pantalla o empezar una tarea frecuente sin tocar el ratón. Cada comando pide
 * el mismo permiso que la pantalla a la que lleva, así que nadie ve un atajo a
 * algo que no puede usar (y la API lo vuelve a exigir igual).
 */

export interface Command {
  id: string;
  /** Lo que se lee en la lista: un verbo y su objeto. */
  label: string;
  /** Dónde queda, en pocas palabras. */
  hint: string;
  to: string;
  /** Otras palabras con que se puede buscar (sin tildes ni mayúsculas importa). */
  keywords?: string;
}

interface ActionCommand extends Command {
  permission: Permission;
}

/** Tareas frecuentes: llevan directo a donde se hacen. */
const ACTIONS: ActionCommand[] = [
  {
    id: 'sell',
    label: 'Registrar una venta',
    hint: 'Ventas',
    to: '/sales',
    keywords: 'facturar cobrar caja vender',
    permission: 'sales',
  },
  {
    id: 'customer',
    label: 'Buscar un cliente',
    hint: 'Clientes y fiados',
    to: '/customers',
    keywords: 'fiado abono deuda',
    permission: 'customers',
  },
  {
    id: 'count',
    label: 'Hacer un conteo físico',
    hint: 'Inventario',
    to: '/inventory?conteo=1',
    keywords: 'contar stock ajuste',
    permission: 'inventory.write',
  },
  {
    id: 'order',
    label: 'Hacer o recibir un pedido',
    hint: 'Pedidos',
    to: '/orders',
    keywords: 'proveedor compra entrega factura recibir',
    permission: 'purchasing',
  },
  {
    id: 'sales-report',
    label: 'Ver el reporte de ventas',
    hint: 'Reportes',
    to: '/reports?reporte=sales',
    keywords: 'ganancias vendido',
    permission: 'reports.sales',
  },
  {
    id: 'counts-report',
    label: 'Ver los conteos físicos',
    hint: 'Reportes › Conteos',
    to: '/reports?reporte=physical-counts',
    keywords: 'diferencias faltantes merma',
    permission: 'reports.inventory',
  },
];

/** Los comandos que puede usar el rol: primero las tareas, después «Ir a …» cada pantalla. */
export function commandsFor(can: (permission: Permission) => boolean): Command[] {
  const screens = visibleNavigation(can).flatMap((entry) =>
    entry.kind === 'link' ? [entry] : entry.items,
  );

  return [
    ...ACTIONS.filter((action) => can(action.permission)).map(
      ({ permission: _permission, ...command }) => command,
    ),
    ...screens.map((screen) => ({
      id: `go-${screen.to}`,
      label: `Ir a ${screen.label}`,
      hint: 'Pantalla',
      to: screen.to,
    })),
  ];
}

/**
 * Los comandos que coinciden con lo escrito (en el nombre, el lugar o sus
 * palabras clave). Sin texto, todos.
 *
 * @example filterCommands(commands, 'factur') // → [«Registrar una venta», «Hacer o recibir un pedido»]
 */
export function filterCommands(commands: Command[], text: string): Command[] {
  const term = text.trim();

  return term === ''
    ? commands
    : commands.filter((command) =>
        matchesSearch(term, command.label, command.hint, command.keywords ?? ''),
      );
}

/** `Ctrl + K` (Windows, Linux) o `⌘ + K` (Mac). */
export function isCommandShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
}
