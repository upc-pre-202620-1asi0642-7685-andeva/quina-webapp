import { describe, expect, it } from 'vitest';
import {
  availableWidgets,
  buildPresetLayout,
  isWidgetResizable,
  layoutSchema,
  normalizeWidgetDimensions,
  normalizeWidgetSize,
  resolveLayout,
} from '@/presentation/components/dashboard/widgets';

const visibleIds = (layout: ReturnType<typeof resolveLayout>) =>
  layout.filter((e) => e.visible).map((e) => e.id);

describe('diseño Bento del Dashboard por usuario', () => {
  it('sin diseño guardado, el dueño ve el diseño inicial y los widgets nuevos quedan ocultos para Agregar', () => {
    const layout = resolveLayout(null, 'STORE_OWNER', 'BODEGA_PRO');
    expect(visibleIds(layout)).toEqual([
      'quickActions',
      'collect',
      'cashToday',
      'salesWeek',
      'moneyOut',
      'lowStock',
      'riskCustomers',
      'rus',
      'plan',
    ]);
    expect(layout.filter((e) => !e.visible).map((e) => e.id)).toEqual([
      'monthSummary',
      'purchaseDrafts',
      'notices',
      'cashFlow',
      'salesByMethod',
      'portfolioTrend',
      'marginTrend',
      'topProducts',
      'recentSales',
      'collectionsHealth',
    ]);
    expect(layout[0]).toEqual({
      id: 'quickActions',
      visible: true,
      size: 'lg',
      cols: 3,
      rows: 1,
    });
  });

  it('el empleado nunca recibe widgets financieros ni de gráficos del negocio (US05)', () => {
    const layout = resolveLayout(
      [
        { id: 'cashToday', visible: true },
        { id: 'cashFlow', visible: true, size: 'lg' },
        { id: 'salesByMethod', visible: true, size: 'md' },
        { id: 'collect', visible: true },
      ],
      'STORE_EMPLOYEE',
      'BODEGA_PRO',
    );
    expect(layout.map((e) => e.id)).not.toContain('cashToday');
    expect(layout.map((e) => e.id)).not.toContain('cashFlow');
    expect(layout.map((e) => e.id)).not.toContain('salesByMethod');
    expect(visibleIds(layout)).toEqual(['collect']);
    expect(availableWidgets('STORE_EMPLOYEE', 'BODEGA_PRO')).toEqual([
      'quickActions',
      'collect',
      'lowStock',
      'notices',
    ]);
  });

  it('los widgets con analítica avanzada exigen un plan con reportes (US26)', () => {
    expect(availableWidgets('STORE_OWNER', 'CASERO')).not.toContain('monthSummary');
    expect(availableWidgets('STORE_OWNER', 'CASERO')).not.toContain('marginTrend');
    expect(availableWidgets('STORE_OWNER', 'NEGOCIO_PLUS')).toContain('monthSummary');
    expect(availableWidgets('STORE_OWNER', 'NEGOCIO_PLUS')).toContain('marginTrend');
    expect(availableWidgets('STORE_OWNER', 'CASERO')).toContain('cashFlow');
  });

  it('respeta orden y dimensiones 2D (cols x rows), normaliza diseños heredados y aplica límites por widget', () => {
    const layout = resolveLayout(
      [
        { id: 'lowStock', visible: true, rows: 2 },
        { id: 'cashFlow', visible: true, size: 'lg', rows: 2 },
        { id: 'moneyOut', visible: true, size: 'lg', rows: 2 }, // moneyOut: cols [1,2], rows [1] -> regresa a 1x1
        { id: 'recentSales', visible: true, size: 'lg', rows: 2 }, // recentSales: cols fijo [1], rows [1,2] -> 1x2
        { id: 'quickActions', visible: false, rows: 2 }, // quickActions: rows fijo [1] -> 3x1
      ],
      'STORE_OWNER',
      'BODEGA_PRO',
    );
    expect(layout[0]).toEqual({ id: 'lowStock', visible: true, size: 'sm', cols: 1, rows: 2 });
    expect(layout[1]).toEqual({ id: 'cashFlow', visible: true, size: 'lg', cols: 3, rows: 2 });
    expect(layout[2]).toEqual({ id: 'moneyOut', visible: true, size: 'sm', cols: 1, rows: 1 });
    expect(layout[3]).toEqual({ id: 'recentSales', visible: true, size: 'sm', cols: 1, rows: 2 });
    expect(layout[4]).toEqual({ id: 'quickActions', visible: false, size: 'lg', cols: 3, rows: 1 });
    expect(layout).toHaveLength(availableWidgets('STORE_OWNER', 'BODEGA_PRO').length);
    expect(visibleIds(layout)).toEqual(['lowStock', 'cashFlow', 'moneyOut', 'recentSales']);
    expect(normalizeWidgetSize('quickActions', 'sm')).toBe('lg');
    expect(normalizeWidgetDimensions('recentSales', { cols: 3, rows: 2 })).toEqual({
      size: 'sm',
      cols: 1,
      rows: 2,
    });
    expect(isWidgetResizable('monthSummary')).toBe(false);
    expect(isWidgetResizable('recentSales')).toBe(true);
    expect(isWidgetResizable('salesWeek')).toBe(true);
  });

  it('un diseño dañado o con tamaños desconocidos vuelve al diseño inicial', () => {
    expect(resolveLayout([{ id: 'unknown', visible: true }], 'STORE_EMPLOYEE', 'CASERO')).toEqual(
      resolveLayout(null, 'STORE_EMPLOYEE', 'CASERO'),
    );
    expect(layoutSchema.safeParse('x').success).toBe(false);
    expect(layoutSchema.safeParse([{ id: 'collect', visible: true, size: 'tall' }]).success).toBe(
      false,
    );
    expect(
      layoutSchema.safeParse([
        { id: 'collect', visible: true },
        { id: 'collect', visible: false },
      ]).success,
    ).toBe(false);
  });

  it('las plantillas respetan permisos del rol y límites del plan', () => {
    const employeeDaily = buildPresetLayout('financial', 'STORE_EMPLOYEE', 'BODEGA_PRO');
    expect(employeeDaily.filter((e) => e.visible)).toEqual([]);
    const ownerFinancial = buildPresetLayout('financial', 'STORE_OWNER', 'CASERO');
    expect(visibleIds(ownerFinancial)).not.toContain('marginTrend');
    expect(visibleIds(ownerFinancial)).toContain('cashFlow');
  });
});
