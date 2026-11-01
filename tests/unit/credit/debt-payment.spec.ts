import { describe, expect, it } from 'vitest';
import { cycleClosingIn } from '@/core/domain/credit/billing-cycle';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import { settleCycle } from '@/core/domain/credit/cycle-settlement';
import {
  allocatePayment,
  moratoryBasesOf,
  oldestPayableCycle,
  quotePayment,
  validatePaymentAmount,
  type PayableCycle,
} from '@/core/domain/credit/debt-payment';
import { Rate } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { datasets } from '../finance/fixtures/datasets';

const pen = (amount: string) => Money.of(amount, 'PEN');
const days = { cutOffDay: 20, paymentDueDay: 26 };

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const scenario = (ds: (typeof datasets)[number]) => {
  const terms = CreditTerms.of(ds.terms as CreditTermsInput);
  const cycle = cycleClosingIn(2026, 9, days);
  const settlement = unwrap(
    settleCycle({
      cycle,
      currency: 'PEN',
      singleCharges: ds.singlePaymentCycle.charges.map((c) => ({
        id: c.id,
        principal: pen(c.principal),
        purchaseInstant: new Date(c.purchaseInstant),
        compensatoryRate: terms.compensatory,
      })),
      dueInstallments: [],
      voids: [],
    }),
  );
  const payable: PayableCycle = {
    id: `${ds.id}-cycle`,
    status: 'BILLED',
    cutOffDate: cycle.cutOffDate,
    paymentDueDate: cycle.paymentDueDate,
    totalDue: settlement.totalDue,
    moratoryBases: moratoryBasesOf(settlement, () => terms.moratory),
  };
  return { settlement, payable, terms };
};

describe('quotePayment (cálculo de US13)', () => {
  const { payable } = scenario(datasets[0]!);

  it('a tiempo cobra lo liquidado sin recalcular (crit. 1)', () => {
    const quote = unwrap(quotePayment(payable, new Date('2026-09-27T04:30:00Z'))); // 26/09 23:30 Lima
    expect(quote.daysLate).toBe(0);
    expect(quote.moratoryInterest.toFixed2()).toBe('0.00');
    expect(quote.amountDue.toFixed2()).toBe('76.05');
  });

  it('antes de la fecha pactada tampoco recalcula', () => {
    const quote = unwrap(quotePayment(payable, new Date('2026-09-22T15:00:00Z')));
    expect(quote.daysLate).toBe(0);
    expect(quote.amountDue.toFixed2()).toBe('76.05');
  });

  it('a las 00:10 del día siguiente ya hay 1 día de mora (crit. 2)', () => {
    const quote = unwrap(quotePayment(payable, new Date('2026-09-27T05:10:00Z')));
    expect(quote.daysLate).toBe(1);
    expect(quote.moratoryInterest.toFixed2()).toBe('0.03');
  });

  it.each(datasets.map((ds) => [ds.title, ds] as const))(
    '%s: mora por 10 días coincide con el oráculo (crit. 2 y 3)',
    (_title, ds) => {
      const late = ds.singlePaymentCycle.latePayment;
      const quote = unwrap(quotePayment(scenario(ds).payable, new Date(late.paymentInstant)));
      expect(quote.daysLate).toBe(late.daysLate);
      expect(quote.moratoryInterest.toFixed2()).toBe(late.moratoryInterest);
      expect(quote.amountDue.toFixed2()).toBe(late.amountDue);
    },
  );

  it('cada línea paga mora con su propia tasa congelada (decisión P1)', () => {
    const { settlement, terms } = scenario(datasets[0]!);
    const doubled = Rate.parse({ ...terms.moratory.input, value: '0.3000' });
    if (!doubled.ok) throw new Error(doubled.error);
    const rateOf = (lineId: string) =>
      lineId === 'charge:charge-2' ? doubled.value : terms.moratory;
    const quote = unwrap(
      quotePayment(
        { ...payable, moratoryBases: moratoryBasesOf(settlement, (l) => rateOf(l)) },
        new Date(datasets[0]!.singlePaymentCycle.latePayment.paymentInstant),
      ),
    );
    const byLine = Object.fromEntries(quote.moratoryByLine.map((m) => [m.lineId, m.amount]));
    const base = moratoryBasesOf(settlement, () => terms.moratory);
    const sameRate = unwrap(
      quotePayment(
        { ...payable, moratoryBases: base },
        new Date(datasets[0]!.singlePaymentCycle.latePayment.paymentInstant),
      ),
    );
    const sameByLine = Object.fromEntries(sameRate.moratoryByLine.map((m) => [m.lineId, m.amount]));
    expect(byLine['charge:charge-1']!.equals(sameByLine['charge:charge-1']!)).toBe(true);
    expect(byLine['charge:charge-2']!.compare(sameByLine['charge:charge-2']!)).toBe(1);
    expect(
      quote.moratoryInterest.equals(
        Money.sum(
          quote.moratoryByLine.map((m) => m.amount),
          'PEN',
        ),
      ),
    ).toBe(true);
  });

  it('rechaza bases de mora que no suman el total exigible', () => {
    expect(quotePayment({ ...payable, moratoryBases: [] }, new Date())).toEqual({
      ok: false,
      error: 'MORATORY_BASE_MISMATCH',
    });
  });

  it('un ciclo vencido (OVERDUE) también se cobra', () => {
    expect(
      quotePayment({ ...payable, status: 'OVERDUE' }, new Date('2026-10-06T15:00:00Z')).ok,
    ).toBe(true);
  });

  it('no cobra un ciclo abierto ni uno ya pagado (crit. 4)', () => {
    expect(quotePayment({ ...payable, status: 'OPEN' }, new Date())).toEqual({
      ok: false,
      error: 'CYCLE_NOT_BILLED',
    });
    expect(quotePayment({ ...payable, status: 'PAID' }, new Date())).toEqual({
      ok: false,
      error: 'CYCLE_ALREADY_PAID',
    });
  });
});

describe('validatePaymentAmount (crit. 4)', () => {
  const quote = unwrap(
    quotePayment(scenario(datasets[0]!).payable, new Date('2026-10-06T15:00:00Z')),
  );

  it('acepta solo el monto exacto', () => {
    expect(validatePaymentAmount(quote, pen('76.35'))).toEqual({ ok: true, value: undefined });
  });

  it('rechaza pagos parciales, de más o en otra moneda', () => {
    expect(validatePaymentAmount(quote, pen('76.34'))).toEqual({
      ok: false,
      error: 'PARTIAL_PAYMENT_NOT_ALLOWED',
    });
    expect(validatePaymentAmount(quote, pen('80.00'))).toEqual({
      ok: false,
      error: 'AMOUNT_EXCEEDS_DUE',
    });
    expect(validatePaymentAmount(quote, Money.of('76.35', 'USD'))).toEqual({
      ok: false,
      error: 'CURRENCY_MISMATCH',
    });
  });
});

describe('oldestPayableCycle (crit. 8)', () => {
  const d = BusinessDate.parse;
  it('elige el ciclo por pagar más antiguo e ignora abiertos y pagados', () => {
    const cycles = [
      { id: 'nov', status: 'BILLED' as const, cutOffDate: d('2026-11-20') },
      { id: 'sep', status: 'PAID' as const, cutOffDate: d('2026-09-20') },
      { id: 'oct', status: 'OVERDUE' as const, cutOffDate: d('2026-10-20') },
      { id: 'dec', status: 'OPEN' as const, cutOffDate: d('2026-12-20') },
    ];
    expect(oldestPayableCycle(cycles)?.id).toBe('oct');
  });

  it('sin ciclos por pagar devuelve null', () => {
    expect(oldestPayableCycle([{ status: 'OPEN', cutOffDate: d('2026-12-20') }])).toBeNull();
  });
});

describe('allocatePayment (crit. 5 y 7)', () => {
  it.each(datasets.map((ds) => [ds.title, ds] as const))(
    '%s: cada cargo carga su propia mora y el desglose cuadra',
    (_title, ds) => {
      const { settlement, payable } = scenario(ds);
      const late = ds.singlePaymentCycle.latePayment;
      const quote = unwrap(quotePayment(payable, new Date(late.paymentInstant)));
      const allocation = unwrap(allocatePayment(settlement, quote));

      const moratory = allocation.rows.filter((r) => r.type === 'MORATORY_INTEREST');
      expect(moratory.map((r) => r.amount.toFixed2())).toEqual(late.moratoryShares);
      expect(allocation.moratoryInterestPaid.equals(quote.moratoryInterest)).toBe(true);
      expect(allocation.principalPaid.toFixed2()).toBe(late.principalPaid);
      expect(allocation.compensatoryInterestPaid.toFixed2()).toBe(late.compensatoryInterestPaid);
      // Restricción de debt_payments: amount_paid = principal + compensatorio + moratorio.
      expect(allocation.amountPaid.equals(quote.amountDue)).toBe(true);
      expect(allocation.rows.every((r) => r.amount.isPositive())).toBe(true);
    },
  );

  it('una cuota del mes se cancela como capital más interés', () => {
    const terms = CreditTerms.of(datasets[0]!.terms as CreditTermsInput);
    const october = cycleClosingIn(2026, 10, days);
    const settlement = unwrap(
      settleCycle({
        cycle: october,
        currency: 'PEN',
        singleCharges: [],
        dueInstallments: [
          {
            id: 'inst-1',
            chargeId: 'charge-x',
            number: 1,
            totalInstallments: 3,
            dueDate: october.paymentDueDate,
            principal: pen('39.61'),
            interest: pen('1.85'),
          },
        ],
        voids: [],
      }),
    );
    const quote = unwrap(
      quotePayment(
        {
          id: 'oct',
          status: 'BILLED',
          cutOffDate: october.cutOffDate,
          paymentDueDate: october.paymentDueDate,
          totalDue: settlement.totalDue,
          moratoryBases: moratoryBasesOf(settlement, () => terms.moratory),
        },
        new Date('2026-10-26T15:00:00Z'),
      ),
    );
    const allocation = unwrap(allocatePayment(settlement, quote));
    expect(allocation.rows.map((r) => [r.target, r.type, r.amount.toFixed2()])).toEqual([
      [{ kind: 'INSTALLMENT', installmentId: 'inst-1' }, 'PRINCIPAL', '39.61'],
      [{ kind: 'INSTALLMENT', installmentId: 'inst-1' }, 'COMPENSATORY_INTEREST', '1.85'],
    ]);
    expect(allocation.amountPaid.toFixed2()).toBe('41.46');
  });

  it('rechaza una cotización de otro total', () => {
    const { settlement, payable } = scenario(datasets[0]!);
    const other = {
      ...payable,
      totalDue: pen('1.00'),
      moratoryBases: [
        {
          lineId: 'charge:x',
          amount: pen('1.00'),
          moratoryRate: payable.moratoryBases[0]!.moratoryRate,
        },
      ],
    };
    const quote = unwrap(quotePayment(other, new Date()));
    expect(allocatePayment(settlement, quote)).toEqual({ ok: false, error: 'SETTLEMENT_MISMATCH' });
  });

  it('con una compra anulada cobra solo las demás y sin mora sobre la anulada (P2)', () => {
    const terms = CreditTerms.of(datasets[0]!.terms as CreditTermsInput);
    const cycle = cycleClosingIn(2026, 9, days);
    const settlement = unwrap(
      settleCycle({
        cycle,
        currency: 'PEN',
        singleCharges: datasets[0]!.singlePaymentCycle.charges.map((c) => ({
          id: c.id,
          principal: pen(c.principal),
          purchaseInstant: new Date(c.purchaseInstant),
          compensatoryRate: terms.compensatory,
        })),
        dueInstallments: [],
        voids: [{ chargeId: 'charge-3' }],
      }),
    );
    const bases = moratoryBasesOf(settlement, () => terms.moratory);
    expect(bases.map((b) => b.lineId)).toEqual(['charge:charge-1', 'charge:charge-2']);
    const quote = unwrap(
      quotePayment(
        {
          id: 'c',
          status: 'OVERDUE',
          cutOffDate: cycle.cutOffDate,
          paymentDueDate: cycle.paymentDueDate,
          totalDue: settlement.totalDue,
          moratoryBases: bases,
        },
        new Date(datasets[0]!.singlePaymentCycle.latePayment.paymentInstant),
      ),
    );
    const allocation = unwrap(allocatePayment(settlement, quote));
    expect(
      allocation.rows.some((r) => r.target.kind === 'CHARGE' && r.target.chargeId === 'charge-3'),
    ).toBe(false);
    expect(allocation.amountPaid.equals(quote.amountDue)).toBe(true);
  });
});
