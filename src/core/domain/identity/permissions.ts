import type { Role } from '@/core/domain/identity/roles';

/** Permisos del panel (US05). Toda Server Action verifica uno antes de mutar. */
export const PERMISSIONS = [
  'customers.read',
  'customers.create',
  'customers.update',
  'customers.deactivate',
  'credit.read_available',
  'credit.terms',
  'sales.create',
  'payments.create',
  'stock.read',
  'catalog.prices',
  'purchases.manage',
  'reports.view',
  'rus.view',
  'team.manage',
  'settings.billing',
  'platform.stores',
  'platform.rate_caps',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const isPlatform = (permission: Permission) => permission.startsWith('platform.');

/** El empleado atiende el mostrador: no ve costos, ganancias ni configuración. */
const EMPLOYEE: ReadonlySet<Permission> = new Set([
  'customers.read',
  'customers.create',
  'credit.read_available',
  'sales.create',
  'payments.create',
  'stock.read',
]);

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  STORE_OWNER: new Set(PERMISSIONS.filter((p) => !isPlatform(p))),
  STORE_EMPLOYEE: EMPLOYEE,
  PLATFORM_ADMIN: new Set(PERMISSIONS.filter(isPlatform)),
  CUSTOMER: new Set(),
  PENDING_OWNER: new Set(),
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].has(permission);
}
