import { describe, expect, it } from 'vitest';
import { boneName } from '@/presentation/components/feedback/page-skeleton';

describe('nombre de huesos por ruta (DESIGN.md §7.3)', () => {
  it('usa la ruta y cambia los identificadores por "id"', () => {
    expect(boneName('/')).toBe('home');
    expect(boneName('/customers')).toBe('customers');
    expect(boneName('/settings/subscription')).toBe('settings-subscription');
    expect(boneName('/customers/3f2b6c1e-8a4d-4b7e-9c1a-2d5e6f7a8b9c/pay')).toBe(
      'customers-id-pay',
    );
    expect(boneName('/inventory/new')).toBe('inventory-new');
  });
});
