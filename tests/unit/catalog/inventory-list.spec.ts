import { describe, expect, it } from 'vitest';
import type { ProductListItem } from '@/infrastructure/db/queries/catalog';
import {
  filterAndSortProducts,
  inventoryListHref,
  parseInventoryListQuery,
  summarizeInventoryList,
} from '@/presentation/lib/inventory-list';

function item(overrides: Partial<ProductListItem> & { id: string; name: string }): ProductListItem {
  return {
    brand: null,
    barcode: null,
    isService: false,
    isActive: true,
    cashPrice: '10.00',
    creditPrice: '11.00',
    currentStock: '10.000',
    minimumStock: '5.000',
    currentAverageCost: '4.0000',
    defaultSupplierId: null,
    defaultSupplierName: null,
    imageUrl: null,
    unitCode: 'UND',
    allowDecimals: false,
    allowsInstallments: false,
    ...overrides,
  };
}

describe('inventory-list helpers', () => {
  const sample: ProductListItem[] = [
    item({
      id: '1',
      name: 'Arroz',
      currentStock: '20.000',
      cashPrice: '4.50',
      currentAverageCost: '3.0000',
    }),
    item({
      id: '2',
      name: 'Aceite',
      currentStock: '2.000',
      minimumStock: '5.000',
      cashPrice: '9.50',
      currentAverageCost: '6.0000',
    }),
    item({
      id: '3',
      name: 'Azúcar',
      currentStock: '0.000',
      minimumStock: '4.000',
      cashPrice: '3.80',
    }),
    item({
      id: '4',
      name: 'Recarga',
      isService: true,
      currentStock: '0.000',
      minimumStock: '0.000',
      cashPrice: '10.00',
    }),
    item({ id: '5', name: 'Fideos', isActive: false, currentStock: '0.000', cashPrice: '2.50' }),
  ];

  it('oculta ordenamiento por valor cuando el rol no ve costos', () => {
    expect(parseInventoryListQuery({ sort: 'valueDesc' }, { canSeeCosts: false }).sort).toBe(
      'name',
    );
    expect(parseInventoryListQuery({ sort: 'valueDesc' }, { canSeeCosts: true }).sort).toBe(
      'valueDesc',
    );
  });

  it('calcula conteos y filtra por estado operativo', () => {
    const summary = summarizeInventoryList(sample);
    expect(summary.totalActive).toBe(4);
    expect(summary.criticalCount).toBe(2);
    expect(summary.counts).toEqual({
      all: 5,
      low: 2,
      noStock: 1,
      services: 1,
      inactive: 1,
    });

    expect(filterAndSortProducts(sample, { filter: 'low', sort: 'name' }).map((p) => p.id)).toEqual(
      ['2', '3'],
    );
    expect(
      filterAndSortProducts(sample, { filter: 'noStock', sort: 'name' }).map((p) => p.id),
    ).toEqual(['3']);
    expect(
      filterAndSortProducts(sample, { filter: 'services', sort: 'name' }).map((p) => p.id),
    ).toEqual(['4']);
    expect(
      filterAndSortProducts(sample, { filter: 'inactive', sort: 'name' }).map((p) => p.id),
    ).toEqual(['5']);
  });

  it('ordena por menor stock y por valor en almacén manteniendo inactivos al final', () => {
    expect(
      filterAndSortProducts(sample, { filter: 'all', sort: 'stockAsc' }).map((p) => p.id),
    ).toEqual(['3', '2', '1', '4', '5']);
    expect(
      filterAndSortProducts(sample, { filter: 'all', sort: 'valueDesc' }).map((p) => p.id),
    ).toEqual(['1', '2', '3', '4', '5']);
  });

  it('genera URLs limpias sin parámetros por defecto', () => {
    expect(inventoryListHref({ q: '', filter: 'all', sort: 'name' })).toBe('/inventory');
    expect(inventoryListHref({ q: 'arroz', filter: 'low', sort: 'stockAsc' })).toBe(
      '/inventory?q=arroz&filter=low&sort=stockAsc',
    );
  });
});
