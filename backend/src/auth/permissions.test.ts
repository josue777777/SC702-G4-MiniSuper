import { describe, expect, it } from 'vitest';
import { hasPermission, PERMISSIONS, permissionsOf, ROLES } from './permissions.js';

/** Matriz de roles y permisos (criterios de usuarios y roles, HU-12). */
describe('permisos por rol', () => {
  it('el Administrador tiene todos los permisos, incluida la Configuración', () => {
    expect(permissionsOf('ADMIN')).toEqual([...PERMISSIONS]);
  });

  it('el Encargado tiene todo menos la Configuración', () => {
    expect(permissionsOf('ENCARGADO')).toEqual(PERMISSIONS.filter((p) => p !== 'settings'));
    expect(hasPermission('ENCARGADO', 'settings')).toBe(false);
  });

  it('el Cajero vende, atiende clientes y consulta productos, pero no modifica inventario ni pedidos', () => {
    expect(permissionsOf('CAJERO')).toEqual(['sales', 'customers', 'inventory.read']);
    expect(hasPermission('CAJERO', 'inventory.write')).toBe(false);
    expect(hasPermission('CAJERO', 'purchasing')).toBe(false);
  });

  it('Bodega maneja inventario y pedidos, pero no vende', () => {
    expect(hasPermission('BODEGA', 'inventory.write')).toBe(true);
    expect(hasPermission('BODEGA', 'purchasing')).toBe(true);
    expect(hasPermission('BODEGA', 'sales')).toBe(false);
    expect(hasPermission('BODEGA', 'reports.sales')).toBe(false);
  });

  it('solo el Administrador tiene la Configuración', () => {
    expect(ROLES.filter((role) => hasPermission(role, 'settings'))).toEqual(['ADMIN']);
  });

  it('permissionsOf devuelve una copia que no altera la matriz', () => {
    permissionsOf('CAJERO').push('settings');

    expect(hasPermission('CAJERO', 'settings')).toBe(false);
  });
});
