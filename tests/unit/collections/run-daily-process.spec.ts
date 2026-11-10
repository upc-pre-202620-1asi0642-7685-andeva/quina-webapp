import { describe, expect, it } from 'vitest';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import type { DailyProcessGateway, DailyStore } from '@/core/domain/ports/daily-process';

const NOW = new Date('2026-09-21T11:00:00Z'); // 06:00 en Lima

const pro: DailyStore = {
  id: 'pro',
  subscription: { planTier: 'BODEGA_PRO', status: 'ACTIVE', trialEndsAt: null },
};
const casero: DailyStore = {
  id: 'casero',
  subscription: { planTier: 'CASERO', status: 'ACTIVE', trialEndsAt: null },
};
const expiredTrial: DailyStore = {
  id: 'trial',
  subscription: {
    planTier: 'BODEGA_PRO',
    status: 'TRIALING',
    trialEndsAt: new Date('2026-09-01T00:00:00Z'),
  },
};

function gateway(stores: DailyStore[], failOn: string | null = null) {
  const calls: string[] = [];
  const step =
    (name: string) =>
    async (storeId: string, ...rest: unknown[]) => {
      const extra = name === 'overdue' ? `:${String(rest[1])}` : '';
      calls.push(`${name}:${storeId}${extra}`);
      if (failOn === `${name}:${storeId}`) throw new Error('boom');
      return 1;
    };
  const fake: DailyProcessGateway = {
    activeStores: async () => stores,
    acceptExpiredConsents: step('consent'),
    settleDueCycles: step('cutoff'),
    markOverdueCycles: step('overdue'),
    queueChargeDigests: step('digest'),
    queuePaymentReminders: step('reminder'),
    processSubscriptionLifecycle: step('subscription'),
    dispatchPending: async (storeId) => {
      calls.push(`dispatch:${storeId}`);
      return { sent: 1, failed: 0, pending: 0 };
    },
  };
  return { fake, calls };
}

describe('RunDailyProcessUseCase (docs §11.1, D1b, P5)', () => {
  it('corre los pasos en orden: conformidad, corte, mora, resumen, recordatorios y suscripción; envía al final', async () => {
    const { fake, calls } = gateway([pro]);
    await new RunDailyProcessUseCase(fake).execute({ now: NOW, budgetMs: 50_000 });
    expect(calls).toEqual([
      'consent:pro',
      'cutoff:pro',
      'overdue:pro:true',
      'digest:pro',
      'reminder:pro',
      'subscription:pro',
      'dispatch:pro',
    ]);
  });

  it('en Casero no encola resúmenes, recordatorios ni avisos de mora; el corte, la mora y la suscripción sí corren', async () => {
    const { fake, calls } = gateway([casero, expiredTrial]);
    await new RunDailyProcessUseCase(fake).execute({ now: NOW, budgetMs: 50_000 });
    expect(calls).toEqual([
      'consent:casero',
      'cutoff:casero',
      'overdue:casero:false',
      'subscription:casero',
      'consent:trial',
      'cutoff:trial',
      'overdue:trial:false',
      'subscription:trial',
      'dispatch:casero',
      'dispatch:trial',
    ]);
  });

  it('el error de una tienda no detiene a las demás y queda en el resumen', async () => {
    const other: DailyStore = { ...pro, id: 'pro2' };
    const { fake, calls } = gateway([pro, other], 'cutoff:pro');
    const summary = await new RunDailyProcessUseCase(fake).execute({ now: NOW, budgetMs: 50_000 });
    expect(calls).toContain('cutoff:pro2');
    expect(calls).toContain('digest:pro2');
    expect(summary.errors).toEqual([{ storeId: 'pro', step: 'cutoff', message: 'boom' }]);
  });

  it('suma lo que hizo cada paso', async () => {
    const { fake } = gateway([pro]);
    const summary = await new RunDailyProcessUseCase(fake).execute({ now: NOW, budgetMs: 50_000 });
    expect(summary.stores).toBe(1);
    expect(summary.steps).toEqual({
      consent: 1,
      cutoff: 1,
      overdue: 1,
      digest: 1,
      reminder: 1,
      subscription: 1,
    });
    expect(summary.mail).toEqual({ sent: 1, failed: 0, pending: 0 });
  });
});
