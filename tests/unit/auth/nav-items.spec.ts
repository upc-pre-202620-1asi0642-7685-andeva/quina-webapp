import { describe, expect, it } from 'vitest';
import { bottomItems, sidebarItems } from '@/presentation/components/shell/nav-items';

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('navegación por rol (DESIGN.md §5, US05)', () => {
  it('el dueño ve todos los destinos de su tienda', () => {
    expect(keys(sidebarItems('STORE_OWNER'))).toEqual([
      'home',
      'sell',
      'customers',
      'collections',
      'inventory',
      'team',
      'settings',
    ]);
    expect(keys(bottomItems('STORE_OWNER'))).toEqual(['home', 'customers', 'sell', 'more']);
  });

  it('el empleado no ve equipo ni ajustes y su "Más" va al perfil', () => {
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
    expect(keys(sidebarItems('PLATFORM_ADMIN'))).toEqual(['stores', 'rateCaps']);
    const bottom = bottomItems('PLATFORM_ADMIN');
    expect(keys(bottom)).toEqual(['stores', 'rateCaps', 'more']);
    expect(bottom.at(-1)?.href).toBe('/profile');
  });

  it('"Vender" ya lleva al mostrador desde el Plan 3', () => {
    const sell = sidebarItems('STORE_EMPLOYEE').find((item) => item.key === 'sell');
    expect(sell).toEqual({ key: 'sell', href: '/sales' });
    expect(bottomItems('STORE_EMPLOYEE').find((item) => item.key === 'sell')?.soon).toBeUndefined();
  });
});
