import { and, eq, gte, inArray, max, ne, sql } from 'drizzle-orm';
import {
  creditScoreBreakdown,
  suggestsLowerLimit,
  type CreditScore,
  type CreditScoreBreakdown,
  type ScoreBand,
  type ScoredCycle,
} from '@/core/domain/credit/credit-score';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Dec } from '@/core/domain/shared/decimal';
import { Money } from '@/core/domain/shared/money';
import { creditAccounts, customers, debtPayments, settlementCycles } from '../schema';
import { withTenant } from '../with-tenant';

export const AGING_BUCKETS = ['current', 'dueSoon', 'd1_15', 'd16_30', 'd31_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const PORTFOLIO_BANDS = ['GREEN', 'YELLOW', 'RED', 'NO_HISTORY'] as const;
export type PortfolioBandKey = ScoreBand | 'NO_HISTORY';

export const PORTFOLIO_FILTERS = [
  'all',
  'overdue',
  'dueSoon',
  'highUtilization',
  'suggestLower',
] as const;
export type PortfolioFilter = (typeof PORTFOLIO_FILTERS)[number];

export const PORTFOLIO_SORTS = ['debt', 'score', 'utilization'] as const;
export type PortfolioSort = (typeof PORTFOLIO_SORTS)[number];

export type PortfolioQuery = {
  q: string;
  filter: PortfolioFilter;
  band?: PortfolioBandKey;
  aging?: AgingBucket;
  sort: PortfolioSort;
};

export type BucketSummary = {
  count: number;
  amount: string;
};

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
  overdueBalance: string;
  dueSoonBalance: string;
  maxDaysOverdue: number;
  nextDueDate: Date | null;
  payableCyclesCount: number;
  agingBucket: AgingBucket;
  utilizationPct: number;
  scoreBreakdown: CreditScoreBreakdown;
  isActiveCustomer: boolean;
  documentType: string;
  documentNumber: string;
  accountStatus: string;
  cutOffDay: number;
  paymentDueDay: number;
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
  aging: Record<AgingBucket, BucketSummary>;
  bands: Record<PortfolioBandKey, BucketSummary>;
};

const pen = (amount: string | null | undefined) => Money.of(amount ?? '0', 'PEN');
const outstanding = sql<string>`(${settlementCycles.totalDue} - ${settlementCycles.amountPaid})`;

// El puntaje mira 6 meses atrás desde cada uno de los dos últimos cortes
const HISTORY_MONTHS = 9;
const CHART_MONTHS = 6;
const DUE_SOON_DAYS = 3;
const HIGH_UTILIZATION_PCT = 85;

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
        isActiveCustomer: customers.isActive,
        documentType: customers.documentType,
        documentNumber: customers.documentNumber,
        creditLimit: creditAccounts.creditLimit,
        currentBalance: creditAccounts.currentBalance,
        accountStatus: creditAccounts.status,
        cutOffDay: creditAccounts.cutOffDay,
        paymentDueDay: creditAccounts.paymentDueDay,
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

  const unpaidByAccount = new Map<string, (typeof data.unpaid)[number][]>();
  for (const c of data.unpaid) {
    const list = unpaidByAccount.get(c.accountId) ?? [];
    list.push(c);
    unpaidByAccount.set(c.accountId, list);
  }

  const rows: PortfolioRow[] = data.accounts.map((a) => {
    const cycles = cyclesByAccount.get(a.accountId) ?? [];
    const accountUnpaid = unpaidByAccount.get(a.accountId) ?? [];
    const overdueCycles = accountUnpaid.filter((c) => c.status === 'OVERDUE');
    const dueSoonCycles = accountUnpaid.filter((c) => {
      if (c.status !== 'BILLED') return false;
      const due = BusinessDate.fromInstant(c.paymentDueDate);
      return BusinessDate.daysBetween(today, due) <= DUE_SOON_DAYS;
    });

    let maxDaysOverdue = 0;
    for (const c of overdueCycles) {
      const due = BusinessDate.fromInstant(c.paymentDueDate);
      maxDaysOverdue = Math.max(maxDaysOverdue, BusinessDate.daysBetween(due, today));
    }

    let nextDueDate: Date | null = null;
    for (const c of accountUnpaid) {
      if (!nextDueDate || c.paymentDueDate.getTime() < nextDueDate.getTime()) {
        nextDueDate = c.paymentDueDate;
      }
    }

    const isDelinquent = overdueAccounts.has(a.accountId);
    const agingBucket: AgingBucket = isDelinquent
      ? maxDaysOverdue >= 31
        ? 'd31_plus'
        : maxDaysOverdue >= 16
          ? 'd16_30'
          : 'd1_15'
      : dueSoonCycles.length > 0
        ? 'dueSoon'
        : 'current';

    const limitDec = new Dec(a.creditLimit);
    const utilizationPct = limitDec.isZero()
      ? 0
      : new Dec(a.currentBalance).dividedBy(limitDec).times(100).toDecimalPlaces(1).toNumber();

    const breakdown = creditScoreBreakdown(cycles, today);

    return {
      customerId: a.customerId,
      name: `${a.firstName} ${a.lastName}`,
      creditLimit: a.creditLimit,
      currentBalance: a.currentBalance,
      isDelinquent,
      suggestLowerLimit: suggestsLowerLimit(cycles, today),
      overdueBalance: total(overdueCycles),
      dueSoonBalance: total(dueSoonCycles),
      maxDaysOverdue,
      nextDueDate,
      payableCyclesCount: accountUnpaid.length,
      agingBucket,
      utilizationPct,
      score: breakdown.score,
      band: breakdown.band,
      hasHistory: breakdown.hasHistory,
      scoreBreakdown: breakdown,
      isActiveCustomer: a.isActiveCustomer,
      documentType: a.documentType,
      documentNumber: a.documentNumber,
      accountStatus: a.accountStatus,
      cutOffDay: a.cutOffDay,
      paymentDueDay: a.paymentDueDay,
    };
  });

  const summarize = (list: readonly PortfolioRow[]): BucketSummary => ({
    count: list.length,
    amount: Money.sum(
      list.map((r) => pen(r.currentBalance)),
      'PEN',
    ).toFixed2(),
  });

  const aging = Object.fromEntries(
    AGING_BUCKETS.map((bucket) => [
      bucket,
      summarize(rows.filter((r) => r.agingBucket === bucket)),
    ]),
  ) as Record<AgingBucket, BucketSummary>;

  const bands = Object.fromEntries(
    PORTFOLIO_BANDS.map((bandKey) => [
      bandKey,
      summarize(
        rows.filter((r) =>
          bandKey === 'NO_HISTORY' ? !r.hasHistory : r.hasHistory && r.band === bandKey,
        ),
      ),
    ]),
  ) as Record<PortfolioBandKey, BucketSummary>;

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
    aging,
    bands,
  };
}

export function parsePortfolioQuery(raw: {
  q?: string;
  filter?: string;
  band?: string;
  aging?: string;
  sort?: string;
}): PortfolioQuery {
  const q = (raw.q ?? '').trim().slice(0, 60);
  const filter: PortfolioFilter = (PORTFOLIO_FILTERS as readonly string[]).includes(
    raw.filter ?? '',
  )
    ? (raw.filter as PortfolioFilter)
    : 'all';
  const band = (PORTFOLIO_BANDS as readonly string[]).includes(raw.band ?? '')
    ? (raw.band as PortfolioBandKey)
    : undefined;
  const aging = (AGING_BUCKETS as readonly string[]).includes(raw.aging ?? '')
    ? (raw.aging as AgingBucket)
    : undefined;
  const sort: PortfolioSort = (PORTFOLIO_SORTS as readonly string[]).includes(raw.sort ?? '')
    ? (raw.sort as PortfolioSort)
    : 'debt';

  return { q, filter, band, aging, sort };
}

const COMPARE: Record<PortfolioSort, (a: PortfolioRow, b: PortfolioRow) => number> = {
  debt: (a, b) =>
    pen(b.currentBalance).compare(pen(a.currentBalance)) || a.name.localeCompare(b.name),
  score: (a, b) => a.score - b.score || a.name.localeCompare(b.name),
  utilization: (a, b) =>
    b.utilizationPct - a.utilizationPct ||
    pen(b.currentBalance).compare(pen(a.currentBalance)) ||
    a.name.localeCompare(b.name),
};

export function filterAndSortPortfolioRows(
  rows: readonly PortfolioRow[],
  query: PortfolioQuery,
): PortfolioRow[] {
  const needle = query.q.toLowerCase();

  return rows
    .filter((row) => {
      if (needle) {
        const matchesName = row.name.toLowerCase().includes(needle);
        const matchesDoc = row.documentNumber.toLowerCase().includes(needle);
        if (!matchesName && !matchesDoc) return false;
      }
      if (query.filter === 'overdue' && !row.isDelinquent) return false;
      if (query.filter === 'dueSoon' && !pen(row.dueSoonBalance).isPositive()) return false;
      if (query.filter === 'highUtilization' && row.utilizationPct < HIGH_UTILIZATION_PCT) {
        return false;
      }
      if (query.filter === 'suggestLower' && !row.suggestLowerLimit) return false;
      if (query.band) {
        if (query.band === 'NO_HISTORY' && row.hasHistory) return false;
        if (query.band !== 'NO_HISTORY' && (!row.hasHistory || row.band !== query.band)) {
          return false;
        }
      }
      if (query.aging && row.agingBucket !== query.aging) return false;
      return true;
    })
    .sort(COMPARE[query.sort]);
}

export function portfolioQueryString(
  query: PortfolioQuery,
  patch: Partial<{
    q: string | null;
    filter: PortfolioFilter | null;
    band: PortfolioBandKey | null;
    aging: AgingBucket | null;
    sort: PortfolioSort | null;
  }> = {},
): string {
  const next = {
    q: patch.q === undefined ? query.q : (patch.q ?? ''),
    filter: patch.filter === undefined ? query.filter : (patch.filter ?? 'all'),
    band: patch.band === undefined ? query.band : (patch.band ?? undefined),
    aging: patch.aging === undefined ? query.aging : (patch.aging ?? undefined),
    sort: patch.sort === undefined ? query.sort : (patch.sort ?? 'debt'),
  };

  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.filter !== 'all') params.set('filter', next.filter);
  if (next.band) params.set('band', next.band);
  if (next.aging) params.set('aging', next.aging);
  if (next.sort !== 'debt') params.set('sort', next.sort);
  return params.toString();
}

export function portfolioHref(
  query: PortfolioQuery,
  patch: Parameters<typeof portfolioQueryString>[1] = {},
): string {
  const qs = portfolioQueryString(query, patch);
  return qs ? `/portfolio?${qs}` : '/portfolio';
}
