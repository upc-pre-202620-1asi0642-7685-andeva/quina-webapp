import { describe, expect, it } from 'vitest';
import {
  blocksPayment,
  confirmCharge,
  objectCharge,
  planVoid,
  type ResolvableCharge,
} from '@/core/domain/credit/charge-resolution';
import { Money } from '@/core/domain/shared/money';

const pen = (amount: string) => Money.of(amount, 'PEN');
const now = new Date('2026-09-18T15:00:00Z');

const single = (overrides: Partial<ResolvableCharge> = {}): ResolvableCharge => ({
  modality: 'SINGLE_PAYMENT',
  status: 'PENDING',
  consentStatus: 'PENDING',
  consentDeadline: new Date('2026-09-19T11:00:00Z'),
  principal: pen('25.50'),
  liquidatedInterest: null,
  cycleStatus: 'OPEN',
  anyInstallmentBilled: false,
  ...overrides,
});

describe('objectCharge (US11.4, decisión P4)', () => {
  it('registra la observación dentro de las 48 h', () => {
    expect(objectCharge(single(), now)).toEqual({ ok: true, value: undefined });
  });

  it('también antes de que salga el resumen (sin plazo todavía)', () => {
    expect(objectCharge(single({ consentDeadline: null }), now).ok).toBe(true);
  });

  it('rechaza observar después del plazo o un cargo ya conforme', () => {
    expect(objectCharge(single(), new Date('2026-09-19T11:00:01Z'))).toEqual({
      ok: false,
      error: 'OBJECTION_WINDOW_CLOSED',
    });
    expect(objectCharge(single({ consentStatus: 'ACCEPTED' }), now)).toEqual({
      ok: false,
      error: 'CHARGE_NOT_PENDING',
    });
    expect(objectCharge(single({ consentStatus: 'OBJECTED' }), now)).toEqual({
      ok: false,
      error: 'CHARGE_NOT_PENDING',
    });
  });

  it('rechaza observar un cargo pagado o anulado', () => {
    expect(objectCharge(single({ status: 'PAID' }), now).ok).toBe(false);
    expect(objectCharge(single({ status: 'VOIDED' }), now).ok).toBe(false);
  });
});

describe('confirmCharge (US11.7)', () => {
  it('solo confirma un cargo observado', () => {
    expect(confirmCharge(single({ consentStatus: 'OBJECTED' })).ok).toBe(true);
    expect(confirmCharge(single())).toEqual({ ok: false, error: 'CHARGE_NOT_OBJECTED' });
  });
});

describe('planVoid (US11.7, decisiones P2 y P3)', () => {
  it('en un ciclo abierto descuenta solo el capital', () => {
    const plan = planVoid(single({ consentStatus: 'OBJECTED' }));
    expect(plan.ok && plan.value.voidedAmount.toFixed2()).toBe('25.50');
    expect(plan.ok && plan.value.balanceDecrease.toFixed2()).toBe('25.50');
    expect(plan.ok && plan.value.recalculateCycle).toBe(false);
  });

  it('en un ciclo liquidado sin pagar descuenta capital más interés y recalcula el ciclo', () => {
    const plan = planVoid(
      single({
        consentStatus: 'OBJECTED',
        status: 'BILLED',
        cycleStatus: 'OVERDUE',
        liquidatedInterest: pen('0.30'),
      }),
    );
    expect(plan.ok && plan.value.voidedAmount.toFixed2()).toBe('25.80');
    expect(plan.ok && plan.value.balanceDecrease.toFixed2()).toBe('25.80');
    expect(plan.ok && plan.value.recalculateCycle).toBe(true);
  });

  it('solo anula cargos observados y sin pagos', () => {
    expect(planVoid(single())).toEqual({ ok: false, error: 'CHARGE_NOT_OBJECTED' });
    expect(planVoid(single({ consentStatus: 'OBJECTED', status: 'PAID' }))).toEqual({
      ok: false,
      error: 'CHARGE_HAS_PAYMENTS',
    });
    expect(planVoid(single({ consentStatus: 'OBJECTED', cycleStatus: 'PAID' }))).toEqual({
      ok: false,
      error: 'CHARGE_HAS_PAYMENTS',
    });
    expect(planVoid(single({ consentStatus: 'OBJECTED', status: 'VOIDED' }))).toEqual({
      ok: false,
      error: 'CHARGE_ALREADY_VOIDED',
    });
  });

  it('un cargo en cuotas se anula entero mientras ninguna cuota se liquidó', () => {
    const charge = single({
      modality: 'INSTALLMENTS',
      consentStatus: 'OBJECTED',
      principal: pen('120.00'),
    });
    const plan = planVoid(charge);
    expect(plan.ok && plan.value.voidedAmount.toFixed2()).toBe('120.00');
    expect(plan.ok && plan.value.recalculateCycle).toBe(false);
    expect(planVoid({ ...charge, anyInstallmentBilled: true })).toEqual({
      ok: false,
      error: 'INSTALLMENT_ALREADY_BILLED',
    });
  });

  it('el ciclo de la compra en cuotas puede quedar pagado en cero y aun así se anula (D12, P3)', () => {
    const plan = planVoid(
      single({
        modality: 'INSTALLMENTS',
        consentStatus: 'OBJECTED',
        principal: pen('120.00'),
        cycleStatus: 'PAID',
      }),
    );
    expect(plan.ok && plan.value.voidedAmount.toFixed2()).toBe('120.00');
  });
});

describe('blocksPayment (D8)', () => {
  it('una observación sin resolver bloquea el cobro del ciclo', () => {
    expect(blocksPayment([single(), single({ consentStatus: 'OBJECTED' })])).toBe(true);
    expect(blocksPayment([single(), single({ consentStatus: 'OBJECTED', status: 'VOIDED' })])).toBe(
      false,
    );
    expect(blocksPayment([single({ consentStatus: 'ACCEPTED' })])).toBe(false);
  });
});
