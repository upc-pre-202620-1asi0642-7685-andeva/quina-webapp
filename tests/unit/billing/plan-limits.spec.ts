import { describe, expect, it } from 'vitest';
import { PlanLimits, type Subscription } from '@/core/domain/billing/plan-limits';

const NOW = new Date('2026-11-15T15:00:00Z');

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return { planTier: 'CASERO', status: 'ACTIVE', trialEndsAt: null, ...overrides };
}

describe('PlanLimits (US26)', () => {
  it('coincide con la estrategia de precios (US26 crit. 1)', () => {
    expect(PlanLimits.of('CASERO')).toMatchObject({
      activeCreditCustomers: 15,
      users: 1,
      products: 50,
      receiptsPerMonth: 0,
      aiQueriesPerMonth: 0,
    });
    expect(PlanLimits.of('BODEGA_PRO')).toMatchObject({
      activeCreditCustomers: null,
      users: 3,
      products: null,
      receiptsPerMonth: 50,
      aiQueriesPerMonth: 20,
    });
    expect(PlanLimits.of('NEGOCIO_PLUS')).toMatchObject({
      activeCreditCustomers: null,
      users: null,
      products: null,
      receiptsPerMonth: null,
      aiQueriesPerMonth: 100,
    });
  });

  it('marca las funciones que el Casero no incluye (US26 crit. 5)', () => {
    expect(PlanLimits.of('CASERO').features).toEqual({
      receipts: false,
      kardexAverageCost: false,
      reportsExport: false,
      ai: false,
      automaticNotifications: false,
    });
    expect(Object.values(PlanLimits.of('BODEGA_PRO').features).every(Boolean)).toBe(true);
  });

  it('la prueba vigente cuenta como Bodega Pro y la vencida como Casero', () => {
    const trial = subscription({
      planTier: 'BODEGA_PRO',
      status: 'TRIALING',
      trialEndsAt: new Date('2026-11-20T05:00:00Z'),
    });
    expect(PlanLimits.effectiveTier(trial, NOW)).toBe('BODEGA_PRO');
    expect(
      PlanLimits.effectiveTier({ ...trial, trialEndsAt: new Date('2026-11-10T05:00:00Z') }, NOW),
    ).toBe('CASERO');
  });

  it('una suscripción cancelada vuelve al Casero', () => {
    expect(
      PlanLimits.effectiveTier(subscription({ planTier: 'BODEGA_PRO', status: 'CANCELED' }), NOW),
    ).toBe('CASERO');
  });

  it('bloquea el vecino 16, el segundo usuario en Casero y el cuarto en Bodega Pro (US26 crit. 2)', () => {
    expect(PlanLimits.canAdd('CASERO', 'activeCreditCustomers', 14)).toBe(true);
    expect(PlanLimits.canAdd('CASERO', 'activeCreditCustomers', 15)).toBe(false);
    expect(PlanLimits.canAdd('CASERO', 'users', 1)).toBe(false);
    expect(PlanLimits.canAdd('BODEGA_PRO', 'users', 2)).toBe(true);
    expect(PlanLimits.canAdd('BODEGA_PRO', 'users', 3)).toBe(false);
    expect(PlanLimits.canAdd('NEGOCIO_PLUS', 'users', 500)).toBe(true);
  });

  it('indica el plan más barato que habilita algo', () => {
    expect(PlanLimits.upgradeFor('users', 1)).toBe('BODEGA_PRO');
    expect(PlanLimits.upgradeFor('users', 3)).toBe('NEGOCIO_PLUS');
    expect(PlanLimits.featureTier('ai')).toBe('BODEGA_PRO');
  });

  it('mantiene el plan durante los 5 días hábiles de gracia en PAST_DUE y baja a Casero al vencer (US23 crit. 4)', () => {
    // Viernes 13 nov 2026 en Lima -> 5 días hábiles (lun, mar, mié, jue, vie) terminan el viernes 20 nov al fin del día
    const fridayFailure = new Date('2026-11-13T15:00:00Z');
    const graceEnd = PlanLimits.gracePeriodEnd(fridayFailure);
    const pastDue = subscription({
      planTier: 'BODEGA_PRO',
      status: 'PAST_DUE',
      gracePeriodEndsAt: graceEnd,
    });
    expect(PlanLimits.effectiveTier(pastDue, new Date('2026-11-20T20:00:00Z'))).toBe('BODEGA_PRO');
    expect(PlanLimits.graceDaysRemaining(pastDue, new Date('2026-11-18T15:00:00Z'))).toBe(2);
    expect(PlanLimits.effectiveTier(pastDue, new Date('2026-11-21T06:00:00Z'))).toBe('CASERO');
  });

  it('mantiene el plan con renovación cancelada hasta el fin del periodo pagado (US23 crit. 6)', () => {
    const canceledAtEnd = subscription({
      planTier: 'NEGOCIO_PLUS',
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2026-11-25T23:59:59Z'),
    });
    expect(PlanLimits.effectiveTier(canceledAtEnd, NOW)).toBe('NEGOCIO_PLUS');
    expect(PlanLimits.effectiveTier(canceledAtEnd, new Date('2026-11-26T00:00:01Z'))).toBe(
      'CASERO',
    );
  });

  it('activa el bloqueo de solo lectura cuando el uso supera los límites del plan efectivo (US26 crit. 7 / D1)', () => {
    const usage = { activeCreditCustomers: 18, users: 2, products: 60 };
    expect(PlanLimits.isReadOnly('BODEGA_PRO', usage)).toBe(false);
    expect(PlanLimits.isReadOnly('CASERO', usage)).toBe(true);
    expect(PlanLimits.overLimitResources('CASERO', usage)).toEqual([
      'activeCreditCustomers',
      'users',
      'products',
    ]);
    expect(PlanLimits.upgradeForUsage(usage)).toBe('BODEGA_PRO');
  });

  it('calcula precios mensuales y anuales con 20 % de descuento (US23 crit. 1 y 7)', () => {
    expect(PlanLimits.planPriceFor('BODEGA_PRO', 'MONTHLY')).toBe('29.00');
    expect(PlanLimits.planPriceFor('BODEGA_PRO', 'YEARLY')).toBe('279.00');
    expect(PlanLimits.planPriceFor('NEGOCIO_PLUS', 'MONTHLY')).toBe('69.00');
    expect(PlanLimits.planPriceFor('NEGOCIO_PLUS', 'YEARLY')).toBe('660.00');
  });
});
