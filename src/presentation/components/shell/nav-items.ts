import { can, type Permission } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';

export type NavKey =
  | 'home'
  | 'sell'
  | 'customers'
  | 'collections'
  | 'inventory'
  | 'team'
  | 'settings'
  | 'more'
  | 'stores'
  | 'rateCaps';

export type NavItem = {
  key: NavKey;
  href: string;
  /** Destino que llega en un plan posterior: se muestra, pero no navega. */
  soon?: boolean;
};

type NavDefinition = NavItem & { permission?: Permission };

/** Barra lateral de escritorio (DESIGN.md §5). */
const SIDEBAR: NavDefinition[] = [
  { key: 'home', href: '/' },
  { key: 'sell', href: '/sales', permission: 'sales.create' },
  { key: 'customers', href: '/customers', permission: 'customers.read' },
  { key: 'collections', href: '/collections', permission: 'payments.create' },
  { key: 'inventory', href: '/inventory', permission: 'stock.read' },
  { key: 'team', href: '/team', permission: 'team.manage' },
  { key: 'settings', href: '/settings', permission: 'settings.billing' },
];

/** Barra inferior del celular: "Vender" va al centro (DESIGN.md §5). */
const BOTTOM: NavDefinition[] = [
  { key: 'home', href: '/' },
  { key: 'customers', href: '/customers', permission: 'customers.read' },
  { key: 'sell', href: '/sales', permission: 'sales.create' },
  { key: 'more', href: '/settings', permission: 'settings.billing' },
];

/** El Administrador de Plataforma solo ve tiendas y topes (US01, decisión 4). */
const PLATFORM: NavDefinition[] = [
  { key: 'stores', href: '/platform/stores' },
  { key: 'rateCaps', href: '/platform/rate-caps' },
];

const allowed = (role: Role) => (item: NavDefinition) =>
  !item.permission || can(role, item.permission);

const strip = ({ key, href, soon }: NavDefinition): NavItem => ({
  key,
  href,
  ...(soon ? { soon } : {}),
});

export function sidebarItems(role: Role): NavItem[] {
  if (role === 'PLATFORM_ADMIN') return PLATFORM.map(strip);
  return SIDEBAR.filter(allowed(role)).map(strip);
}

/** El empleado no tiene ajustes: su "Más" lleva a su perfil. */
export function bottomItems(role: Role): NavItem[] {
  if (role === 'PLATFORM_ADMIN') return [...PLATFORM.map(strip), { key: 'more', href: '/profile' }];
  const items = BOTTOM.filter(allowed(role)).map(strip);
  return can(role, 'settings.billing') ? items : [...items, { key: 'more', href: '/profile' }];
}
