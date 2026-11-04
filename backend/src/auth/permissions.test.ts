import { describe, expect, it } from 'vitest';
import {
  BUSINESS_PERMISSIONS,
  canManageRole,
  hasPermission,
  manageableRoles,
  permissionsOf,
  ROLES,
} from './permissions.js';

/** Matriz de roles y permisos, y jerarquía (criterios de usuarios y roles; ADR 0002). */
describe('permisos por rol', () => {
  it('el Administrador es la plataforma: negocios y usuarios, sin datos de ningún negocio', () => {
    expect(permissionsOf('ADMIN')).toEqual(['platform.manage', 'users.manage']);
    expect(BUSINESS_PERMISSIONS.some((permission) => hasPermission('ADMIN', permission))).toBe(
      false,
    );
  });

  it('el Encargado (dueño del negocio) tiene todo su negocio y su personal, no la plataforma', () => {
    expect(permissionsOf('ENCARGADO')).toEqual([...BUSINESS_PERMISSIONS, 'users.manage']);
    expect(hasPermission('ENCARGADO', 'plan.request')).toBe(true);
    expect(hasPermission('ENCARGADO', 'platform.manage')).toBe(false);
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

  it('solo la plataforma maneja negocios; solo el Encargado edita su negocio y pide más usuarios', () => {
    expect(ROLES.filter((role) => hasPermission(role, 'platform.manage'))).toEqual(['ADMIN']);
    expect(ROLES.filter((role) => hasPermission(role, 'business.edit'))).toEqual(['ENCARGADO']);
    expect(ROLES.filter((role) => hasPermission(role, 'plan.request'))).toEqual(['ENCARGADO']);
    expect(ROLES.filter((role) => hasPermission(role, 'users.manage'))).toEqual([
      'ADMIN',
      'ENCARGADO',
    ]);
  });

  it('permissionsOf devuelve una copia que no altera la matriz', () => {
    permissionsOf('CAJERO').push('platform.manage');

    expect(hasPermission('CAJERO', 'platform.manage')).toBe(false);
  });
});

describe('jerarquía: nadie da más poder del que tiene', () => {
  it('la plataforma administra administradores y Encargados, no al personal de los negocios', () => {
    expect(manageableRoles('ADMIN')).toEqual(['ADMIN', 'ENCARGADO']);
    expect(canManageRole('ADMIN', 'CAJERO')).toBe(false);
    expect(canManageRole('ADMIN', 'BODEGA')).toBe(false);
  });

  it('el Encargado administra solo a Cajero y Bodega', () => {
    expect(manageableRoles('ENCARGADO')).toEqual(['CAJERO', 'BODEGA']);
    expect(canManageRole('ENCARGADO', 'ENCARGADO')).toBe(false);
    expect(canManageRole('ENCARGADO', 'ADMIN')).toBe(false);
  });

  it('Cajero y Bodega no administran a nadie, ni entre ellos', () => {
    expect(manageableRoles('CAJERO')).toEqual([]);
    expect(canManageRole('CAJERO', 'BODEGA')).toBe(false);
    expect(canManageRole('BODEGA', 'CAJERO')).toBe(false);
  });
});
