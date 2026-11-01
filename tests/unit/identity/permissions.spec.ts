import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS } from '@/core/domain/identity/permissions';

describe('can', () => {
  it('el dueño puede todo lo de su tienda y nada de la plataforma', () => {
    for (const permission of PERMISSIONS) {
      expect(can('STORE_OWNER', permission)).toBe(!permission.startsWith('platform.'));
    }
  });

  it('el empleado vende, cobra, busca y registra vecinos (US05 crit. 2)', () => {
    for (const permission of [
      'customers.read',
      'customers.create',
      'credit.read_available',
      'sales.create',
      'payments.create',
      'stock.read',
    ] as const) {
      expect(can('STORE_EMPLOYEE', permission)).toBe(true);
    }
  });

  it('el empleado no pacta condiciones ni ve finanzas, compras, precios, RUS ni equipo (US05 crit. 3)', () => {
    for (const permission of [
      'credit.terms',
      'customers.update',
      'customers.deactivate',
      'reports.view',
      'purchases.manage',
      'catalog.prices',
      'rus.view',
      'team.manage',
      'settings.billing',
    ] as const) {
      expect(can('STORE_EMPLOYEE', permission)).toBe(false);
    }
  });

  it('el empleado registra observaciones y envía avisos, pero solo el dueño las resuelve (Plan 4, D13)', () => {
    expect(can('STORE_EMPLOYEE', 'charges.object')).toBe(true);
    expect(can('STORE_EMPLOYEE', 'notifications.send')).toBe(true);
    expect(can('STORE_EMPLOYEE', 'charges.resolve')).toBe(false);
    expect(can('STORE_OWNER', 'charges.resolve')).toBe(true);
  });

  it('el administrador de plataforma solo tiene permisos de plataforma', () => {
    for (const permission of PERMISSIONS) {
      expect(can('PLATFORM_ADMIN', permission)).toBe(permission.startsWith('platform.'));
    }
  });

  it('el vecino y el dueño pendiente no tienen permisos del panel', () => {
    for (const permission of PERMISSIONS) {
      expect(can('CUSTOMER', permission)).toBe(false);
      expect(can('PENDING_OWNER', permission)).toBe(false);
    }
  });
});
