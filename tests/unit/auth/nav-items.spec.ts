import { describe, expect, it } from 'vitest';
import { bottomItems, sidebarItems } from '@/presentation/components/shell/nav-items';

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('navegación por rol (DESIGN.md §5, US05)', () => {
  it('el dueño ve todos los destinos de su tienda, incluida auditoría (US18)', () => {
    expect(keys(sidebarItems('STORE_OWNER'))).toEqual([
      'home',
      'sell',
      'customers',
      'collections',
      'inventory',
      'portfolio',
      'reports',
      'team',
      'audit',
      'settings',
    ]);
    expect(keys(bottomItems('STORE_OWNER'))).toEqual(['home', 'customers', 'sell', 'more']);
  });

  it('muestra el contador de stock bajo en el ítem de inventario (US17 crit. 3)', () => {
    const items = sidebarItems('STORE_OWNER', 4);
    expect(items.find((i) => i.key === 'inventory')?.badge).toBe(4);
    expect(
      sidebarItems('STORE_OWNER', 0).find((i) => i.key === 'inventory')?.badge,
    ).toBeUndefined();
  });

  it('el empleado no ve equipo, auditoría ni ajustes y su "Más" va al perfil', () => {
    expect(keys(sidebarItems('STORE_EMPLOYEE'))).toEqual([
      'home',
      'sell',
      'customers',
      'collections',
      'inventory',
    ]);
    const bottom = bottomItems('STORE_EMPLOYEE');
    expect(keys(bottom)).toEqual(['home', 'customers', 'sell', 'more']);
    expect(bottom.at(-1)?.href).toBe('/profile');
  });

  it('el Administrador de Plataforma solo ve tiendas y topes (US01)', () => {
    expect(keys(sidebarItems('PLATFORM_ADMIN'))).toEqual(['stores', 'rateCaps', 'rusCaps']);
    const bottom = bottomItems('PLATFORM_ADMIN');
    expect(keys(bottom)).toEqual(['stores', 'rateCaps', 'rusCaps', 'more']);
    expect(bottom.at(-1)?.href).toBe('/profile');
  });

  it('"Vender" ya lleva al mostrador desde el Plan 3', () => {
    const sell = sidebarItems('STORE_EMPLOYEE').find((item) => item.key === 'sell');
    expect(sell).toEqual({ key: 'sell', href: '/sales' });
    expect(bottomItems('STORE_EMPLOYEE').find((item) => item.key === 'sell')?.soon).toBeUndefined();
  });
});
