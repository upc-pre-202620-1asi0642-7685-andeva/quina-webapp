import { beforeEach, describe, expect, it } from 'vitest';
import {
  SaveCreditTermsUseCase,
  SetCreditAccountStatusUseCase,
  type SaveCreditTermsCommand,
} from '@/core/application/credit/save-credit-terms';
import type { CustomerProfile } from '@/core/domain/ports/customer-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { InMemoryCustomerStore } from '../../fakes/in-memory-customer-repositories';

const NOW = new Date('2026-11-15T15:00:00Z');

const profile = (n: number): CustomerProfile => ({
  document: { type: 'DNI', number: String(40000000 + n) },
  firstName: 'Rosa',
  lastName: 'Quispe',
  phone: '987654321',
  email: `rosa${n}@correo.pe`,
  address: null,
  preferredLocale: null,
});

function command(overrides: Partial<SaveCreditTermsCommand> = {}): SaveCreditTermsCommand {
  return {
    storeId: 's-1',
    actorId: 'u-1',
    customerId: 'c-1',
    currency: 'PEN',
    creditLimit: '150',
    compensatory: { type: 'EFFECTIVE', percent: '20', period: 'ANNUAL', capitalization: null },
    moratory: { type: 'EFFECTIVE', percent: '15', period: 'ANNUAL', capitalization: null },
    cutOffDay: 20,
    paymentDueDay: 26,
    maxInstallmentMonths: 3,
    consentText: 'Límite S/ 150.00, TEA 20 %…',
    ip: '203.0.113.5',
    userAgent: 'Mozilla/5.0',
    now: NOW,
    ...overrides,
  };
}

describe('SaveCreditTermsUseCase (US06)', () => {
  let store: InMemoryCustomerStore;
  let useCase: SaveCreditTermsUseCase;

  beforeEach(async () => {
    store = new InMemoryCustomerStore();
    store.caps = [
      {
        kind: 'COMPENSATORY',
        currency: 'PEN',
        maxEffectiveAnnualRate: '1.1413',
        validFrom: BusinessDate.parse('2026-05-01'),
        validTo: null,
      },
      {
        kind: 'MORATORY',
        currency: 'PEN',
        maxEffectiveAnnualRate: '0.1711',
        validFrom: BusinessDate.parse('2026-05-01'),
        validTo: null,
      },
    ];
    await store.register({
      storeId: 's-1',
      actorId: 'u-1',
      profile: profile(1),
      consent: {} as never,
      now: NOW,
    });
    store.consents.length = 0;
    useCase = new SaveCreditTermsUseCase(store);
  });

  it('abre la cuenta guardando las tasas como fracción y deja constancia CREDIT_TERMS', async () => {
    expect(await useCase.execute(command())).toEqual({ ok: true, value: 'OPENED' });
    expect(store.accounts.get('c-1')?.terms).toEqual({
      currency: 'PEN',
      creditLimit: '150.00',
      compensatory: { type: 'EFFECTIVE', value: '0.2000', period: 'ANNUAL', capitalization: null },
      moratory: { type: 'EFFECTIVE', value: '0.1500', period: 'ANNUAL', capitalization: null },
      cutOffDay: 20,
      paymentDueDay: 26,
      maxInstallmentMonths: 3,
    });
    expect(store.consents).toEqual([
      expect.objectContaining({ type: 'CREDIT_TERMS', text: 'Límite S/ 150.00, TEA 20 %…' }),
    ]);
  });

  it('acepta una tasa nominal con su capitalización (crit. 1)', async () => {
    const result = await useCase.execute(
      command({
        compensatory: {
          type: 'NOMINAL',
          percent: '24',
          period: 'ANNUAL',
          capitalization: 'MONTHLY',
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('ignora la capitalización que llegue con una tasa efectiva', async () => {
    await useCase.execute(
      command({
        compensatory: {
          type: 'EFFECTIVE',
          percent: '20',
          period: 'ANNUAL',
          capitalization: 'DAILY',
        },
      }),
    );
    expect(store.accounts.get('c-1')?.terms.compensatory.capitalization).toBeNull();
  });

  it('rechaza tasas sobre el tope del BCRP (crit. 2)', async () => {
    expect(
      await useCase.execute(
        command({
          moratory: { type: 'EFFECTIVE', percent: '18', period: 'ANNUAL', capitalization: null },
        }),
      ),
    ).toEqual({ ok: false, error: 'MORATORY_RATE_ABOVE_CAP' });
  });

  it('rechaza un límite de cero y días fuera de 1 a 28 (crit. 3 y 4)', async () => {
    expect(await useCase.execute(command({ creditLimit: '0' }))).toEqual({
      ok: false,
      error: 'CREDIT_LIMIT_NOT_POSITIVE',
    });
    expect(await useCase.execute(command({ cutOffDay: 29 }))).toEqual({
      ok: false,
      error: 'CUT_OFF_DAY_OUT_OF_RANGE',
    });
    expect(await useCase.execute(command({ paymentDueDay: 0 }))).toEqual({
      ok: false,
      error: 'PAYMENT_DUE_DAY_OUT_OF_RANGE',
    });
  });

  it('acepta la tasa compensatoria de 0 % (crit. 5)', async () => {
    const result = await useCase.execute(
      command({
        compensatory: { type: 'EFFECTIVE', percent: '0', period: 'MONTHLY', capitalization: null },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('cambiar condiciones actualiza la cuenta sin abrir otra', async () => {
    await useCase.execute(command());
    expect(await useCase.execute(command({ creditLimit: '300' }))).toEqual({
      ok: true,
      value: 'UPDATED',
    });
    expect(store.accounts.get('c-1')?.terms.creditLimit).toBe('300.00');
    expect(store.consents).toHaveLength(2);
  });

  it('en Casero bloquea la cuenta activa número 16 (US26 crit. 2)', async () => {
    for (let n = 2; n <= 16; n++) {
      await store.register({
        storeId: 's-1',
        actorId: 'u-1',
        profile: profile(n),
        consent: {} as never,
        now: NOW,
      });
    }
    for (let n = 1; n <= 15; n++) {
      expect((await useCase.execute(command({ customerId: `c-${n}` }))).ok).toBe(true);
    }
    expect(await useCase.execute(command({ customerId: 'c-16' }))).toEqual({
      ok: false,
      error: 'PLAN_LIMIT_REACHED',
    });

    // Suspender una cuenta libera el cupo (crit. 3) y reactivarla lo vuelve a pedir
    const status = new SetCreditAccountStatusUseCase(store);
    const base = { storeId: 's-1', actorId: 'u-1', now: NOW };
    await status.execute({ ...base, customerId: 'c-1', status: 'SUSPENDED' });
    expect((await useCase.execute(command({ customerId: 'c-16' }))).ok).toBe(true);
    expect(await status.execute({ ...base, customerId: 'c-1', status: 'ACTIVE' })).toEqual({
      ok: false,
      error: 'PLAN_LIMIT_REACHED',
    });
  });

  it('durante la prueba Pro no hay límite de vecinos', async () => {
    store.subscriptions.set('s-1', {
      planTier: 'BODEGA_PRO',
      status: 'TRIALING',
      trialEndsAt: new Date('2026-11-20T05:00:00Z'),
    });
    for (let n = 2; n <= 17; n++) {
      await store.register({
        storeId: 's-1',
        actorId: 'u-1',
        profile: profile(n),
        consent: {} as never,
        now: NOW,
      });
    }
    for (let n = 1; n <= 17; n++) {
      expect((await useCase.execute(command({ customerId: `c-${n}` }))).ok).toBe(true);
    }
  });
});
