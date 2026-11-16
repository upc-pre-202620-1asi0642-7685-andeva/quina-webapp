import { can, type Permission } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';

/** Cookie de la barra plegada: vive aquí (no en un módulo de cliente) para que el servidor la lea. */
export const SIDEBAR_COOKIE = 'quina-sidebar';

export type NavKey =
  | 'home'
  | 'sell'
  | 'customers'
  | 'customersAll'
  | 'customersNew'
  | 'collections'
  | 'collectionsDue'
  | 'collectionsOverdue'
  | 'collectionsPayments'
  | 'collectionsNotices'
  | 'inventory'
  | 'products'
  | 'lowStock'
  | 'purchases'
  | 'suppliers'
  | 'portfolio'
  | 'reports'
  | 'team'
  | 'audit'
  | 'settings'
  | 'subscription'
  | 'profile'
  | 'modules'
  | 'stores'
  | 'rateCaps'
  | 'rusCaps';

export type QuickKey =
  'newSale' | 'newCustomer' | 'newProduct' | 'newPurchase' | 'newSupplier' | 'inviteEmployee';

export type NavGroupKey = 'counter' | 'business' | 'admin' | 'account' | 'platform';

export type NavItem = {
  key: NavKey;
  href: string;
  /** Contador de alerta (stock bajo, ciclos vencidos). */
  badge?: number;
  /** Submenú desplegable con accesos directos del módulo. */
  children?: NavItem[];
};

export type QuickAction = { key: QuickKey; href: string };

export type NavGroup = { key: NavGroupKey; items: NavItem[] };

export type NavCounts = { lowStock?: number; overdue?: number };

type NavDefinition = Omit<NavItem, 'children' | 'badge'> & {
  permission?: Permission;
  badge?: keyof NavCounts;
  children?: NavDefinition[];
};

/** Módulos de la tienda (DESIGN.md §5): la misma estructura para escritorio y celular. */
const STORE: { key: NavGroupKey; items: NavDefinition[] }[] = [
  {
    key: 'counter',
    items: [
      { key: 'home', href: '/' },
      { key: 'sell', href: '/sales', permission: 'sales.create' },
      {
        key: 'customers',
        href: '/customers',
        permission: 'customers.read',
        children: [
          { key: 'customersAll', href: '/customers', permission: 'customers.read' },
          { key: 'customersNew', href: '/customers/new', permission: 'customers.create' },
        ],
      },
      {
        key: 'collections',
        href: '/collections',
        permission: 'payments.create',
        badge: 'overdue',
        children: [
          { key: 'collectionsDue', href: '/collections', permission: 'payments.create' },
          {
            key: 'collectionsOverdue',
            href: '/collections?tab=overdue',
            permission: 'payments.create',
            badge: 'overdue',
          },
          {
            key: 'collectionsPayments',
            href: '/collections?tab=payments',
            permission: 'payments.create',
          },
          {
            key: 'collectionsNotices',
            href: '/collections?tab=notices',
            permission: 'payments.create',
          },
        ],
      },
    ],
  },
  {
    key: 'business',
    items: [
      {
        key: 'inventory',
        href: '/inventory',
        permission: 'stock.read',
        badge: 'lowStock',
        children: [
          { key: 'products', href: '/inventory', permission: 'stock.read' },
          {
            key: 'lowStock',
            href: '/inventory?filter=low',
            permission: 'stock.read',
            badge: 'lowStock',
          },
          { key: 'purchases', href: '/inventory/purchases', permission: 'purchases.manage' },
          { key: 'suppliers', href: '/inventory/suppliers', permission: 'purchases.manage' },
        ],
      },
      { key: 'portfolio', href: '/portfolio', permission: 'reports.view' },
      { key: 'reports', href: '/reports', permission: 'reports.view' },
    ],
  },
  {
    key: 'admin',
    items: [
      { key: 'team', href: '/team', permission: 'team.manage' },
      { key: 'audit', href: '/audit', permission: 'audit.view' },
    ],
  },
];

/** Sección secundaria, sin listas (bajo el separador). */
const SECONDARY: NavDefinition[] = [
  { key: 'settings', href: '/settings', permission: 'settings.billing' },
  { key: 'subscription', href: '/settings/subscription', permission: 'settings.billing' },
];

/** Botón "Crear": lo que se registra a diario, a un toque desde cualquier pantalla. */
const QUICK: (QuickAction & { permission: Permission })[] = [
  { key: 'newSale', href: '/sales', permission: 'sales.create' },
  { key: 'newCustomer', href: '/customers/new', permission: 'customers.create' },
  { key: 'newProduct', href: '/inventory/new', permission: 'catalog.manage' },
  { key: 'newPurchase', href: '/inventory/purchases/new', permission: 'purchases.manage' },
  { key: 'newSupplier', href: '/inventory/suppliers?new=1', permission: 'purchases.manage' },
  { key: 'inviteEmployee', href: '/team?invite=1', permission: 'team.manage' },
];

/** El Administrador de Plataforma solo ve tiendas y topes (US01, decisión 4). */
const PLATFORM: NavDefinition[] = [
  { key: 'stores', href: '/platform/stores' },
  { key: 'rateCaps', href: '/platform/rate-caps' },
  { key: 'rusCaps', href: '/platform/rus-caps' },
];

/** Pestañas de la barra flotante del celular; "Vender" va aparte, en el botón verde. */
const TAB_KEYS: NavKey[] = ['home', 'customers', 'collections'];

function resolve(role: Role, items: NavDefinition[], counts: NavCounts): NavItem[] {
  return items
    .filter((item) => !item.permission || can(role, item.permission))
    .map(({ key, href, badge: badgeKey, children }) => {
      const badge = badgeKey ? (counts[badgeKey] ?? 0) : 0;
      const kids = children ? resolve(role, children, counts) : [];
      return {
        key,
        href,
        ...(badge > 0 ? { badge } : {}),
        // Un submenú de un solo destino no aporta: queda el ítem directo
        ...(kids.length > 1 ? { children: kids } : {}),
      };
    });
}

export function navGroups(role: Role, lowStockCount = 0, overdueCount = 0): NavGroup[] {
  const counts: NavCounts = { lowStock: lowStockCount, overdue: overdueCount };
  if (role === 'PLATFORM_ADMIN') {
    return [{ key: 'platform', items: resolve(role, PLATFORM, counts) }];
  }
  return STORE.map((group) => ({
    key: group.key,
    items: resolve(role, group.items, counts),
  })).filter((group) => group.items.length > 0);
}

export function secondaryItems(role: Role): NavItem[] {
  return role === 'PLATFORM_ADMIN' ? [] : resolve(role, SECONDARY, {});
}

export function quickActions(role: Role): QuickAction[] {
  return QUICK.filter((action) => can(role, action.permission)).map(({ key, href }) => ({
    key,
    href,
  }));
}

/** Pestañas del celular y, si el rol vende, el botón "Vender". */
export function mobileTabs(role: Role): { tabs: NavItem[]; sell: NavItem | null } {
  const items = navGroups(role).flatMap((group) => group.items);
  if (role === 'PLATFORM_ADMIN') return { tabs: items, sell: null };
  return {
    tabs: items.filter((item) => TAB_KEYS.includes(item.key)),
    sell: items.find((item) => item.key === 'sell') ?? null,
  };
}

/**
 * El destino activo es el href más largo que coincide con la ruta y con su
 * consulta (/settings vs /settings/subscription; /collections vs ?tab=overdue).
 */
export function activeHref(pathname: string, hrefs: string[], search = ''): string | null {
  const current = new URLSearchParams(search);
  const matches = hrefs.filter((href) => {
    const [path = '', query] = href.split('?');
    const pathOk =
      path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
    if (!pathOk) return false;
    if (!query) return true;
    // Un acceso con consulta solo es activo en esa ruta exacta y con esos parámetros
    return (
      pathname === path &&
      [...new URLSearchParams(query)].every(([key, value]) => current.get(key) === value)
    );
  });
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function allHrefs(groups: NavGroup[], extra: NavItem[] = []): string[] {
  const walk = (items: NavItem[]): string[] =>
    items.flatMap((item) => [item.href, ...walk(item.children ?? [])]);
  return [
    ...new Set([...walk(groups.flatMap((group) => group.items)), ...walk(extra), '/profile']),
  ];
}

export type CrumbLabel =
  | 'detail'
  | 'new'
  | 'edit'
  | 'pay'
  | 'terms'
  | 'cycle'
  | 'billing'
  | 'security'
  | 'preferences'
  | 'access';
export type Crumb = { href: string } & ({ key: NavKey } | { label: CrumbLabel });

const SEGMENT_LABELS: Record<string, CrumbLabel> = {
  new: 'new',
  edit: 'edit',
  pay: 'pay',
  terms: 'terms',
  cycles: 'cycle',
  billing: 'billing',
  security: 'security',
  preferences: 'preferences',
  access: 'access',
};
const isId = (segment: string) => /^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);

/**
 * Migas de pan de una ruta: Inicio, el módulo y sus subpáginas según la
 * navegación; los ids se leen "Detalle" (o se suman a la miga anterior).
 */
export function breadcrumbTrail(
  pathname: string,
  groups: NavGroup[],
  extra: NavItem[] = [],
): Crumb[] {
  const flat = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => [item, ...flat(item.children ?? [])]);
  const items = flat([...groups.flatMap((group) => group.items), ...extra]).filter(
    (item) => !item.href.includes('?'),
  );
  const home = items.find((item) => item.key === 'home');
  const trail: Crumb[] = home && pathname !== '/' ? [{ key: 'home', href: '/' }] : [];
  const segments = pathname.split('/').filter(Boolean);
  let fromNav = false;
  segments.forEach((segment, i) => {
    const href = `/${segments.slice(0, i + 1).join('/')}`;
    const item = items.find((candidate) => candidate.href === href);
    if (item) {
      trail.push({ key: item.key, href });
      fromNav = true;
      return;
    }
    const label = SEGMENT_LABELS[segment];
    if (label) {
      trail.push({ label, href });
    } else if (isId(segment)) {
      const last = trail.at(-1);
      // Un id tras un módulo es su ficha; tras "cycles" o "billing" completa esa miga
      if (fromNav || !last) trail.push({ label: 'detail', href });
      else last.href = href;
    }
    fromNav = false;
  });
  return trail;
}
