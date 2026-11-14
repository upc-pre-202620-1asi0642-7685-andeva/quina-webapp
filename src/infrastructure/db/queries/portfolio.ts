import { and, eq, gte, inArray, max, ne, sql } from 'drizzle-orm';
import {
  creditScore,
  suggestsLowerLimit,
  type CreditScore,
  type ScoredCycle,
} from '@/core/domain/credit/credit-score';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { creditAccounts, customers, debtPayments, settlementCycles } from '../schema';
import { withTenant } from '../with-tenant';

export type PortfolioMetrics = {
  /** Deuda viva que consume los límites: capital e intereses liquidados sin pagar. */
  lent: string;
  /** Saldo de los ciclos vencidos, con su mora liquidada. */
  overdue: string;
  /** Saldo de los ciclos liquidados que vencen en el mes de Lima. */
  projected: string;
  delinquentCustomers: number;
};

export type PortfolioRow = CreditScore & {
  customerId: string;
  name: string;
  creditLimit: string;
  currentBalance: string;
  isDelinquent: boolean;
  /** US19 crit. 4: dos cortes seguidos en Rojo. */
  suggestLowerLimit: boolean;
};

export type PortfolioMonth = {
  /** `YYYY-MM` del corte. */
  period: string;
  billed: string;
  paid: string;
  overdue: string;
};

export type Portfolio = {
  metrics: PortfolioMetrics;
  rows: PortfolioRow[];
  months: PortfolioMonth[];
};

const pen = (amount: string | null | undefined) => Money.of(amount ?? '0', 'PEN');
const outstanding = sql<string>`(${settlementCycles.totalDue} - ${settlementCycles.amountPaid})`;

// El puntaje mira 6 meses atrás desde cada uno de los dos últimos cortes
const HISTORY_MONTHS = 9;
const CHART_MONTHS = 6;

/**
 * US19: cartera de la tienda en soles.
 * shortcut: solo cuentas en PEN (el fiado en USD está bloqueado desde el Plan 3);
 * si se habilita, separar métricas y filas por moneda.
 */
export async function loadPortfolio(storeId: string, now: Date): Promise<Portfolio> {
  const today = BusinessDate.fromInstant(now);
  const monthStart = BusinessDate.of(today.year, today.month, 1);
  const nextMonth = BusinessDate.addCalendarMonths(monthStart, 1);
  const historyFrom = BusinessDate.addCalendarMonths(monthStart, -HISTORY_MONTHS);

  const data = await withTenant(storeId, async (tx) => {
    const accounts = await tx
      .select({
        accountId: creditAccounts.id,
        customerId: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        creditLimit: creditAccounts.creditLimit,
        currentBalance: creditAccounts.currentBalance,
      })
      .from(creditAccounts)
      .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
      .where(and(eq(creditAccounts.storeId, storeId), eq(creditAccounts.currency, 'PEN')));

    const cycles = await tx
      .select({
        accountId: settlementCycles.creditAccountId,
        status: settlementCycles.status,
        cutOffDate: settlementCycles.cutOffDate,
        paymentDueDate: settlementCycles.paymentDueDate,
        periodYear: settlementCycles.periodYear,
        periodMonth: settlementCycles.periodMonth,
        totalDue: settlementCycles.totalDue,
        amountPaid: settlementCycles.amountPaid,
        outstanding,
        paidAt: max(debtPayments.paymentDate),
      })
      .from(settlementCycles)
      .innerJoin(creditAccounts, eq(creditAccounts.id, settlementCycles.creditAccountId))
      .leftJoin(debtPayments, eq(debtPayments.settlementCycleId, settlementCycles.id))
      .where(
        and(
          eq(settlementCycles.storeId, storeId),
          eq(creditAccounts.currency, 'PEN'),
          ne(settlementCycles.status, 'OPEN'),
          gte(settlementCycles.cutOffDate, BusinessDate.startInstant(historyFrom)),
        ),
      )
      .groupBy(settlementCycles.id);

    // Los vencidos y por cobrar pueden ser más antiguos que la ventana del puntaje
    const unpaid = await tx
      .select({
        accountId: settlementCycles.creditAccountId,
        status: settlementCycles.status,
        paymentDueDate: settlementCycles.paymentDueDate,
        outstanding,
      })
      .from(settlementCycles)
      .innerJoin(creditAccounts, eq(creditAccounts.id, settlementCycles.creditAccountId))
      .where(
        and(
          eq(settlementCycles.storeId, storeId),
          eq(creditAccounts.currency, 'PEN'),
          inArray(settlementCycles.status, ['BILLED', 'OVERDUE']),
        ),
      );
    return { accounts, cycles, unpaid };
  });

  const overdue = data.unpaid.filter((c) => c.status === 'OVERDUE');
  const overdueAccounts = new Set(overdue.map((c) => c.accountId));
  const dueThisMonth = data.unpaid.filter(
    (c) =>
      c.status === 'BILLED' &&
      c.paymentDueDate >= BusinessDate.startInstant(monthStart) &&
      c.paymentDueDate < BusinessDate.startInstant(nextMonth),
  );
  const total = (list: { outstanding: string }[]) =>
    Money.sum(
      list.map((c) => pen(c.outstanding)),
      'PEN',
    ).toFixed2();

  const cyclesByAccount = new Map<string, ScoredCycle[]>();
  for (const c of data.cycles) {
    const list = cyclesByAccount.get(c.accountId) ?? [];
    list.push({
      cutOffDate: BusinessDate.fromInstant(c.cutOffDate),
      paymentDueDate: BusinessDate.fromInstant(c.paymentDueDate),
      // Un ciclo se paga entero (regla financiera 4): su último pago es el día que quedó saldado
      paidOn: c.status === 'PAID' && c.paidAt ? BusinessDate.fromInstant(new Date(c.paidAt)) : null,
    });
    cyclesByAccount.set(c.accountId, list);
  }

  const rows: PortfolioRow[] = data.accounts.map((a) => {
    const cycles = cyclesByAccount.get(a.accountId) ?? [];
    return {
      customerId: a.customerId,
      name: `${a.firstName} ${a.lastName}`,
      creditLimit: a.creditLimit,
      currentBalance: a.currentBalance,
      isDelinquent: overdueAccounts.has(a.accountId),
      suggestLowerLimit: suggestsLowerLimit(cycles, today),
      ...creditScore(cycles, today),
    };
  });

  // D6: liquidado, pagado y aún vencido por mes de corte, los últimos 6 meses
  const months: PortfolioMonth[] = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i -= 1) {
    const month = BusinessDate.addCalendarMonths(monthStart, -i);
    const inMonth = data.cycles.filter(
      (c) => c.periodYear === month.year && c.periodMonth === month.month,
    );
    const sum = (pick: (c: (typeof inMonth)[number]) => string) =>
      Money.sum(
        inMonth.map((c) => pen(pick(c))),
        'PEN',
      ).toFixed2();
    months.push({
      period: BusinessDate.toISO(month).slice(0, 7),
      billed: sum((c) => c.totalDue),
      paid: sum((c) => c.amountPaid),
      overdue: sum((c) => (c.status === 'OVERDUE' ? c.outstanding : '0')),
    });
  }

  return {
    metrics: {
      lent: Money.sum(
        data.accounts.map((a) => pen(a.currentBalance)),
        'PEN',
      ).toFixed2(),
      overdue: total(overdue),
      projected: total(dueThisMonth),
      delinquentCustomers: overdueAccounts.size,
    },
    rows,
    months,
  };
}
