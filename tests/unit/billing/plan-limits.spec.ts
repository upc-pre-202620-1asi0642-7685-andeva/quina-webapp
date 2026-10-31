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
});
