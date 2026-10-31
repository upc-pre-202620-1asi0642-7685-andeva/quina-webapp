import { can, type Permission } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';

export type NavKey = 'home' | 'sell' | 'customers' | 'team' | 'settings' | 'more';

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
  { key: 'sell', href: '/sales', permission: 'sales.create', soon: true },
  { key: 'customers', href: '/customers', permission: 'customers.read' },
  { key: 'team', href: '/team', permission: 'team.manage' },
  { key: 'settings', href: '/settings', permission: 'settings.billing' },
];

/** Barra inferior del celular: "Vender" va al centro (DESIGN.md §5). */
const BOTTOM: NavDefinition[] = [
  { key: 'home', href: '/' },
  { key: 'customers', href: '/customers', permission: 'customers.read' },
  { key: 'sell', href: '/sales', permission: 'sales.create', soon: true },
  { key: 'more', href: '/settings', permission: 'settings.billing' },
];

const allowed = (role: Role) => (item: NavDefinition) =>
  !item.permission || can(role, item.permission);

const strip = ({ key, href, soon }: NavDefinition): NavItem => ({
  key,
  href,
  ...(soon ? { soon } : {}),
});

export function sidebarItems(role: Role): NavItem[] {
  return SIDEBAR.filter(allowed(role)).map(strip);
}

/** El empleado no tiene ajustes: su "Más" lleva a su perfil. */
export function bottomItems(role: Role): NavItem[] {
  const items = BOTTOM.filter(allowed(role)).map(strip);
  return can(role, 'settings.billing') ? items : [...items, { key: 'more', href: '/profile' }];
}
