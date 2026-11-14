import { describe, expect, it } from 'vitest';
import {
  activeHref,
  allHrefs,
  breadcrumbTrail,
  mobileTabs,
  navGroups,
  quickActions,
  secondaryItems,
} from '@/presentation/components/shell/nav-items';

const keys = (items: { key: string }[]) => items.map((item) => item.key);
const shape = (role: Parameters<typeof navGroups>[0]) =>
  navGroups(role).map((group) => [group.key, keys(group.items)]);

describe('navegación por rol (DESIGN.md §5, US05)', () => {
  it('el dueño ve todos los módulos agrupados, con Inventario desplegable', () => {
    expect(shape('STORE_OWNER')).toEqual([
      ['counter', ['home', 'sell', 'customers', 'collections']],
      ['business', ['inventory', 'portfolio', 'reports']],
      ['admin', ['team', 'audit']],
    ]);
    const inventory = navGroups('STORE_OWNER')[1]?.items[0];
    expect(keys(inventory?.children ?? [])).toEqual([
      'products',
      'lowStock',
      'purchases',
      'suppliers',
    ]);
    const counter = navGroups('STORE_OWNER')[0]?.items ?? [];
    expect(keys(counter[2]?.children ?? [])).toEqual(['customersAll', 'customersNew']);
    expect(keys(counter[3]?.children ?? [])).toEqual([
      'collectionsDue',
      'collectionsOverdue',
      'collectionsNotices',
    ]);
    expect(keys(secondaryItems('STORE_OWNER'))).toEqual(['settings', 'subscription']);
    expect(keys(quickActions('STORE_OWNER'))).toEqual([
      'newSale',
      'newCustomer',
      'newProduct',
      'newPurchase',
      'newSupplier',
      'inviteEmployee',
    ]);
  });

  it('en el celular: tres pestañas, "Vender" aparte y nada queda fuera de Módulos', () => {
    const { tabs, sell } = mobileTabs('STORE_OWNER');
    expect(keys(tabs)).toEqual(['home', 'customers', 'collections']);
    expect(sell).toEqual({ key: 'sell', href: '/sales' });
  });

  it('muestra contadores de stock bajo (US17 crit. 3) y de ciclos vencidos', () => {
    const groups = navGroups('STORE_OWNER', 4, 2);
    const inventory = groups[1]?.items[0];
    expect(inventory?.badge).toBe(4);
    expect(inventory?.children?.find((i) => i.key === 'lowStock')?.badge).toBe(4);
    expect(inventory?.children?.find((i) => i.key === 'products')?.badge).toBeUndefined();
    const collections = groups[0]?.items[3];
    expect(collections?.badge).toBe(2);
    expect(collections?.children?.find((i) => i.key === 'collectionsOverdue')?.badge).toBe(2);
    expect(navGroups('STORE_OWNER', 0)[1]?.items[0]?.badge).toBeUndefined();
  });

  it('el empleado no ve equipo, auditoría, compras ni ajustes', () => {
    expect(shape('STORE_EMPLOYEE')).toEqual([
      ['counter', ['home', 'sell', 'customers', 'collections']],
      ['business', ['inventory']],
    ]);
    const inventory = navGroups('STORE_EMPLOYEE')[1]?.items[0];
    expect(keys(inventory?.children ?? [])).toEqual(['products', 'lowStock']);
    expect(secondaryItems('STORE_EMPLOYEE')).toEqual([]);
    expect(keys(quickActions('STORE_EMPLOYEE'))).toEqual(['newSale', 'newCustomer']);
  });

  it('el Administrador de Plataforma solo ve tiendas y topes (US01)', () => {
    expect(shape('PLATFORM_ADMIN')).toEqual([['platform', ['stores', 'rateCaps', 'rusCaps']]]);
    expect(mobileTabs('PLATFORM_ADMIN').sell).toBeNull();
  });

  it('marca activo el destino más específico', () => {
    const hrefs = allHrefs(navGroups('STORE_OWNER'), secondaryItems('STORE_OWNER'));
    expect(activeHref('/settings/subscription', hrefs)).toBe('/settings/subscription');
    expect(activeHref('/settings', hrefs)).toBe('/settings');
    expect(activeHref('/inventory/purchases/new', hrefs)).toBe('/inventory/purchases');
    expect(activeHref('/inventory/abc/edit', hrefs)).toBe('/inventory');
    expect(activeHref('/', hrefs)).toBe('/');
    expect(activeHref('/customers/1', hrefs)).toBe('/customers');
    expect(activeHref('/customers/new', hrefs)).toBe('/customers/new');
    expect(activeHref('/collections', hrefs, '')).toBe('/collections');
    expect(activeHref('/collections', hrefs, '?tab=overdue')).toBe('/collections?tab=overdue');
    expect(activeHref('/inventory', hrefs, '?filter=low')).toBe('/inventory?filter=low');
    expect(activeHref('/inventory/new', hrefs, '?filter=low')).toBe('/inventory');
  });
});

describe('migas de pan (navegación interna)', () => {
  const trail = (path: string, role: Parameters<typeof navGroups>[0] = 'STORE_OWNER') =>
    breadcrumbTrail(path, navGroups(role), secondaryItems(role)).map((c) =>
      'key' in c ? `${c.key}:${c.href}` : `${c.label}:${c.href}`,
    );

  it('Inicio no lleva migas; un módulo lleva Inicio y el módulo', () => {
    expect(trail('/')).toEqual([]);
    expect(trail('/customers')).toEqual(['home:/', 'customers:/customers']);
  });

  it('sigue los submódulos y nombra las fichas como Detalle', () => {
    expect(trail('/inventory/purchases/new')).toEqual([
      'home:/',
      'inventory:/inventory',
      'purchases:/inventory/purchases',
      'new:/inventory/purchases/new',
    ]);
    expect(trail('/customers/0b6f0c1e-1111-4222-8333-944455556666/pay')).toEqual([
      'home:/',
      'customers:/customers',
      'detail:/customers/0b6f0c1e-1111-4222-8333-944455556666',
      'pay:/customers/0b6f0c1e-1111-4222-8333-944455556666/pay',
    ]);
  });

  it('el id de un ciclo completa la miga del ciclo', () => {
    expect(trail('/customers/0b6f0c1e-1111/cycles/7c9e6679-7425')).toEqual([
      'home:/',
      'customers:/customers',
      'detail:/customers/0b6f0c1e-1111',
      'cycle:/customers/0b6f0c1e-1111/cycles/7c9e6679-7425',
    ]);
  });

  it('el administrador de plataforma no tiene Inicio de tienda', () => {
    expect(trail('/platform/stores/0b6f0c1e-1111', 'PLATFORM_ADMIN')).toEqual([
      'stores:/platform/stores',
      'detail:/platform/stores/0b6f0c1e-1111',
    ]);
  });
});
