import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/infrastructure/db/connection';
import {
  filterAndSortPortfolioRows,
  loadPortfolio,
  parsePortfolioQuery,
} from '@/infrastructure/db/queries/portfolio';
import { creditAccounts, debtPayments, settlementCycles } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { neighbor, storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

describe('cartera y puntaje (US19) contra PostgreSQL', () => {
  it('calcula las cuatro métricas, el puntaje y la serie mensual', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const late = await neighbor(ctx);
    const punctual = await neighbor(ctx);

    await withTenant(ctx.storeId, async (tx) => {
      await tx
        .update(creditAccounts)
        .set({ currentBalance: '100.00' })
        .where(eq(creditAccounts.id, late.accountId));
      await tx
        .update(creditAccounts)
        .set({ currentBalance: '50.00' })
        .where(eq(creditAccounts.id, punctual.accountId));

      const cycle = (
        accountId: string,
        cycleNumber: number,
        month: number,
        status: string,
        totalDue: string,
        amountPaid: string,
      ) => ({
        storeId: ctx.storeId,
        creditAccountId: accountId,
        cycleNumber,
        periodYear: 2026,
        periodMonth: month,
        // Corte el 20 y pago el 26, a las 23:59 de Lima
        cutOffDate: new Date(`2026-${String(month).padStart(2, '0')}-21T04:59:59Z`),
        paymentDueDate: new Date(`2026-${String(month).padStart(2, '0')}-27T04:59:59Z`),
        totalDue,
        amountPaid,
        status,
      });
      await tx
        .insert(settlementCycles)
        .values([
          cycle(late.accountId, 1, 10, 'OVERDUE', '100.00', '0.00'),
          cycle(punctual.accountId, 1, 11, 'BILLED', '50.00', '0.00'),
        ]);
      const [paid] = await tx
        .insert(settlementCycles)
        .values(cycle(punctual.accountId, 2, 10, 'PAID', '80.00', '80.00'))
        .returning({ id: settlementCycles.id });
      await tx.insert(debtPayments).values({
        storeId: ctx.storeId,
        creditAccountId: punctual.accountId,
        settlementCycleId: paid!.id,
        userIdCollector: ctx.ownerId,
        paymentMethod: 'CASH',
        amountPaid: '80.00',
        principalPaid: '80.00',
        paymentDate: new Date('2026-10-25T15:00:00Z'),
        receiptNumber: `R-${paid!.id.slice(0, 8)}`,
      });
    });

    const portfolio = await loadPortfolio(ctx.storeId, new Date('2026-11-13T15:00:00Z'));
    expect(portfolio.metrics).toEqual({
      lent: '150.00',
      overdue: '100.00',
      projected: '50.00',
      delinquentCustomers: 1,
    });

    const lateRow = portfolio.rows.find((r) => r.customerId === late.customerId);
    // 26/10 → 13/11 son 17 días en base 30/360: 100 − 51 = 49
    expect(lateRow).toMatchObject({
      score: 49,
      band: 'YELLOW',
      isDelinquent: true,
      overdueBalance: '100.00',
      dueSoonBalance: '0.00',
      maxDaysOverdue: 18,
      payableCyclesCount: 1,
      agingBucket: 'd16_30',
      utilizationPct: 10,
      isActiveCustomer: true,
      documentType: 'DNI',
      documentNumber: late.dni,
      accountStatus: 'ACTIVE',
      cutOffDay: 20,
      paymentDueDay: 26,
      scoreBreakdown: {
        score: 49,
        band: 'YELLOW',
        hasHistory: true,
        onTimeCycles: 0,
        lateCycles: 1,
        daysLate: 17,
      },
    });
    expect(lateRow?.nextDueDate).toEqual(new Date('2026-10-27T04:59:59Z'));

    const punctualRow = portfolio.rows.find((r) => r.customerId === punctual.customerId);
    expect(punctualRow).toMatchObject({
      score: 100,
      band: 'GREEN',
      hasHistory: true,
      isDelinquent: false,
      suggestLowerLimit: false,
      overdueBalance: '0.00',
      dueSoonBalance: '0.00',
      maxDaysOverdue: 0,
      payableCyclesCount: 1,
      agingBucket: 'current',
      utilizationPct: 5,
      scoreBreakdown: {
        score: 100,
        band: 'GREEN',
        hasHistory: true,
        onTimeCycles: 1,
        lateCycles: 0,
        daysLate: 0,
      },
    });

    expect(portfolio.aging).toEqual({
      current: { count: 1, amount: '50.00' },
      dueSoon: { count: 0, amount: '0.00' },
      d1_15: { count: 0, amount: '0.00' },
      d16_30: { count: 1, amount: '100.00' },
      d31_plus: { count: 0, amount: '0.00' },
    });
    expect(portfolio.bands).toEqual({
      GREEN: { count: 1, amount: '50.00' },
      YELLOW: { count: 1, amount: '100.00' },
      RED: { count: 0, amount: '0.00' },
      NO_HISTORY: { count: 0, amount: '0.00' },
    });

    expect(
      filterAndSortPortfolioRows(portfolio.rows, parsePortfolioQuery({ filter: 'overdue' })).map(
        (r) => r.customerId,
      ),
    ).toEqual([late.customerId]);
    expect(
      filterAndSortPortfolioRows(portfolio.rows, parsePortfolioQuery({ band: 'GREEN' })).map(
        (r) => r.customerId,
      ),
    ).toEqual([punctual.customerId]);
    expect(
      filterAndSortPortfolioRows(portfolio.rows, parsePortfolioQuery({ sort: 'utilization' })).map(
        (r) => r.customerId,
      ),
    ).toEqual([late.customerId, punctual.customerId]);

    expect(portfolio.months.map((m) => m.period)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(portfolio.months.at(-2)).toEqual({
      period: '2026-10',
      billed: '180.00',
      paid: '80.00',
      overdue: '100.00',
    });
  });
});
