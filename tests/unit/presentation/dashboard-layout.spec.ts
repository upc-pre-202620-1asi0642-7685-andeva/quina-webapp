import { describe, expect, it } from 'vitest';
import {
  availableWidgets,
  layoutSchema,
  resolveLayout,
} from '@/presentation/components/dashboard/widgets';

const visibleIds = (layout: ReturnType<typeof resolveLayout>) =>
  layout.filter((e) => e.visible).map((e) => e.id);

describe('diseño de Inicio por usuario', () => {
  it('sin diseño guardado, el dueño ve el diseño inicial y el resto queda oculto', () => {
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
    ]);
  });

  it('el empleado nunca recibe widgets de plata del negocio (US05)', () => {
    const layout = resolveLayout(
      [
        { id: 'cashToday', visible: true },
        { id: 'collect', visible: true },
      ],
      'STORE_EMPLOYEE',
      'BODEGA_PRO',
    );
    expect(layout.map((e) => e.id)).not.toContain('cashToday');
    expect(visibleIds(layout)).toEqual(['collect']);
    expect(availableWidgets('STORE_EMPLOYEE', 'BODEGA_PRO')).toEqual([
      'quickActions',
      'collect',
      'lowStock',
      'notices',
    ]);
  });

  it('el mes en curso exige el plan con reportes, igual que la pantalla de Reportes', () => {
    expect(availableWidgets('STORE_OWNER', 'CASERO')).not.toContain('monthSummary');
    expect(availableWidgets('STORE_OWNER', 'NEGOCIO_PLUS')).toContain('monthSummary');
  });

  it('respeta el orden guardado y agrega los widgets nuevos al final, ocultos', () => {
    const layout = resolveLayout(
      [
        { id: 'lowStock', visible: true },
        { id: 'quickActions', visible: false },
      ],
      'STORE_OWNER',
      'BODEGA_PRO',
    );
    expect(layout[0]).toEqual({ id: 'lowStock', visible: true });
    expect(layout[1]).toEqual({ id: 'quickActions', visible: false });
    expect(layout).toHaveLength(availableWidgets('STORE_OWNER', 'BODEGA_PRO').length);
    expect(visibleIds(layout)).toEqual(['lowStock']);
  });

  it('un diseño dañado vuelve al diseño inicial', () => {
    expect(resolveLayout([{ id: 'unknown', visible: true }], 'STORE_EMPLOYEE', 'CASERO')).toEqual(
      resolveLayout(null, 'STORE_EMPLOYEE', 'CASERO'),
    );
    expect(layoutSchema.safeParse('x').success).toBe(false);
    expect(
      layoutSchema.safeParse([
        { id: 'collect', visible: true },
        { id: 'collect', visible: false },
      ]).success,
    ).toBe(false);
  });
});
