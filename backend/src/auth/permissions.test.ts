import { describe, expect, it } from 'vitest';
import {
  canManageRole,
  hasPermission,
  manageableRoles,
  PERMISSIONS,
  permissionsOf,
  ROLES,
} from './permissions.js';

/** Matriz de roles y permisos, y jerarquía (criterios de usuarios y roles). */
describe('permisos por rol', () => {
  it('el Administrador tiene todos los permisos, incluido el plan', () => {
    expect(permissionsOf('ADMIN')).toEqual([...PERMISSIONS]);
  });

  it('el Encargado (dueño del negocio) tiene todo menos el plan contratado', () => {
    expect(permissionsOf('ENCARGADO')).toEqual(PERMISSIONS.filter((p) => p !== 'plan.manage'));
    expect(hasPermission('ENCARGADO', 'business.edit')).toBe(true);
    expect(hasPermission('ENCARGADO', 'users.manage')).toBe(true);
    expect(hasPermission('ENCARGADO', 'plan.manage')).toBe(false);
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

  it('solo Administrador y Encargado administran usuarios y datos del negocio; el plan, solo el Administrador', () => {
    expect(ROLES.filter((role) => hasPermission(role, 'users.manage'))).toEqual([
      'ADMIN',
      'ENCARGADO',
    ]);
    expect(ROLES.filter((role) => hasPermission(role, 'business.edit'))).toEqual([
      'ADMIN',
      'ENCARGADO',
    ]);
    expect(ROLES.filter((role) => hasPermission(role, 'plan.manage'))).toEqual(['ADMIN']);
  });

  it('permissionsOf devuelve una copia que no altera la matriz', () => {
    permissionsOf('CAJERO').push('plan.manage');

    expect(hasPermission('CAJERO', 'plan.manage')).toBe(false);
  });
});

describe('jerarquía: nadie da más poder del que tiene', () => {
  it('el Administrador administra a todos los roles', () => {
    expect(ROLES.every((role) => canManageRole('ADMIN', role))).toBe(true);
  });

  it('el Encargado administra solo a Cajero y Bodega', () => {
    expect(canManageRole('ENCARGADO', 'CAJERO')).toBe(true);
    expect(canManageRole('ENCARGADO', 'BODEGA')).toBe(true);
    expect(canManageRole('ENCARGADO', 'ENCARGADO')).toBe(false);
    expect(canManageRole('ENCARGADO', 'ADMIN')).toBe(false);
  });

  it('Cajero y Bodega no administran a nadie, ni entre ellos', () => {
    expect(canManageRole('CAJERO', 'BODEGA')).toBe(false);
    expect(canManageRole('BODEGA', 'CAJERO')).toBe(false);
  });

  it('manageableRoles da los roles que cada uno puede asignar', () => {
    expect(manageableRoles('ADMIN')).toEqual(['ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA']);
    expect(manageableRoles('ENCARGADO')).toEqual(['CAJERO', 'BODEGA']);
    expect(manageableRoles('CAJERO')).toEqual([]);
  });
});
