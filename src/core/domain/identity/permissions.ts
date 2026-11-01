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
  // Plan 4, D13: observar un cargo (dueño y empleado); confirmarlo o anularlo (solo el dueño)
  'charges.object',
  'charges.resolve',
  // Plan 4, P5: botones de avisos manuales del Plan Casero
  'notifications.send',
  'stock.read',
  // Plan 3, D5: alta, edición, baja y ajuste de stock del catálogo (solo el dueño)
  'catalog.manage',
  'catalog.prices',
  'purchases.manage',
  'reports.view',
  'rus.view',
  'team.manage',
  'settings.billing',
  // Plan 5, D12: Yape, Plin, cuenta y QR que ve el vecino (solo el dueño)
  'store.payment_details',
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
  'charges.object',
  'notifications.send',
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
