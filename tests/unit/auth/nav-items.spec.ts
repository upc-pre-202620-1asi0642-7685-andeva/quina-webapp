import { describe, expect, it } from 'vitest';
import { bottomItems, sidebarItems } from '@/presentation/components/shell/nav-items';

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('navegación por rol (DESIGN.md §5, US05)', () => {
  it('el dueño ve todos los destinos de su tienda', () => {
    expect(keys(sidebarItems('STORE_OWNER'))).toEqual([
      'home',
      'sell',
      'customers',
      'team',
      'settings',
    ]);
    expect(keys(bottomItems('STORE_OWNER'))).toEqual(['home', 'customers', 'sell', 'more']);
  });

  it('el empleado no ve equipo ni ajustes y su "Más" va al perfil', () => {
    expect(keys(sidebarItems('STORE_EMPLOYEE'))).toEqual(['home', 'sell', 'customers']);
    const bottom = bottomItems('STORE_EMPLOYEE');
    expect(keys(bottom)).toEqual(['home', 'customers', 'sell', 'more']);
    expect(bottom.at(-1)?.href).toBe('/profile');
  });

  it('"Vender" se marca como próximo hasta el Plan 3', () => {
    expect(sidebarItems('STORE_OWNER').find((item) => item.key === 'sell')?.soon).toBe(true);
  });
});
