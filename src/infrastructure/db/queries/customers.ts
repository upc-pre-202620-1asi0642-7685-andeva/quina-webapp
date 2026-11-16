import { and, asc, desc, eq, gte, ilike, inArray, max, ne, or, sql } from 'drizzle-orm';
import {
  creditScoreBreakdown,
  suggestsLowerLimit,
  type CreditScoreBreakdown,
  type ScoredCycle,
} from '@/core/domain/credit/credit-score';
import type { CreditAccountTerms } from '@/core/domain/ports/credit-account-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import { termsFromRow } from '../repositories/drizzle-credit-account-repository';
import {
  creditAccounts,
  customerConsents,
  customers,
  debtPayments,
  settlementCycles,
} from '../schema';
import { withTenant } from '../with-tenant';

const DUE_SOON_DAYS = 3;
const SCORE_HISTORY_MONTHS = 9;

export type CustomerCollectionsSummary = {
  payableAmount: string;
  overdueAmount: string;
  payableCyclesCount: number;
  hasOverdue: boolean;
  hasDueSoon: boolean;
  nextDueDate: Date | null;
};

export type CustomerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  phone: string | null;
  isActive: boolean;
  account: {
    id: string;
    currency: string;
    creditLimit: string;
    currentBalance: string;
    status: string;
    cutOffDay: number;
    paymentDueDay: number;
  } | null;
  collections: CustomerCollectionsSummary;
};

export type CustomerDetail = Omit<CustomerListItem, 'collections'> & {
  /** Cuenta de fiado, para sus ciclos (Plan 4). */
  accountId: string | null;
  /** Último rebote del correo (US11 crit. 5). */
  emailBouncedAt: Date | null;
  email: string;
  address: string | null;
  preferredLocale: string | null;
  createdAt: Date;
  terms: CreditAccountTerms | null;
};

export type CustomerPaymentItem = {
  id: string;
  receiptNumber: string;
  amountPaid: string;
  paymentMethod: string;
  paymentDate: Date;
  cycleId: string;
  cycleNumber: number;
};

export type CustomerConsentItem = {
  id: string;
  consentType: string;
  policyVersion: string;
  acceptedAt: Date;
};

export type CustomerProfileExtras = {
  payments: CustomerPaymentItem[];
  consents: CustomerConsentItem[];
  score: {
    breakdown: CreditScoreBreakdown;
    suggestLowerLimit: boolean;
  } | null;
};

const EMPTY_COLLECTIONS: CustomerCollectionsSummary = {
  payableAmount: '0.00',
  overdueAmount: '0.00',
  payableCyclesCount: 0,
  hasOverdue: false,
  hasDueSoon: false,
  nextDueDate: null,
};

const LIST_LIMIT = 200;

/** Lista de vecinos de la tienda con búsqueda por nombre o documento y resumen exigible. */
export async function listCustomers(
  storeId: string,
  search = '',
  now = new Date(),
): Promise<CustomerListItem[]> {
  const term = search.trim().replace(/[%_\\]/g, '');
  const today = BusinessDate.fromInstant(now);

  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        documentType: customers.documentType,
        documentNumber: customers.documentNumber,
        phone: customers.phone,
        isActive: customers.isActive,
        accountId: creditAccounts.id,
        currency: creditAccounts.currency,
        creditLimit: creditAccounts.creditLimit,
        currentBalance: creditAccounts.currentBalance,
        status: creditAccounts.status,
        cutOffDay: creditAccounts.cutOffDay,
        paymentDueDay: creditAccounts.paymentDueDay,
      })
      .from(customers)
      .leftJoin(creditAccounts, eq(creditAccounts.customerId, customers.id))
      .where(
        and(
          eq(customers.storeId, storeId),
          term
            ? or(
                ilike(customers.documentNumber, `%${term}%`),
                ilike(sql`${customers.firstName} || ' ' || ${customers.lastName}`, `%${term}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(customers.isActive), asc(customers.firstName), asc(customers.lastName))
      .limit(LIST_LIMIT);

    const accountIds = rows.map((r) => r.accountId).filter((id): id is string => Boolean(id));

    const cyclesByAccount = new Map<
      string,
      { status: string; paymentDueDate: Date; totalDue: string; amountPaid: string }[]
    >();

    if (accountIds.length > 0) {
      const unpaid = await tx
        .select({
          accountId: settlementCycles.creditAccountId,
          status: settlementCycles.status,
          paymentDueDate: settlementCycles.paymentDueDate,
          totalDue: settlementCycles.totalDue,
          amountPaid: settlementCycles.amountPaid,
        })
        .from(settlementCycles)
        .where(
          and(
            eq(settlementCycles.storeId, storeId),
            inArray(settlementCycles.creditAccountId, accountIds),
            inArray(settlementCycles.status, ['BILLED', 'OVERDUE']),
          ),
        );
      for (const cycle of unpaid) {
        const list = cyclesByAccount.get(cycle.accountId) ?? [];
        list.push(cycle);
        cyclesByAccount.set(cycle.accountId, list);
      }
    }

    return rows.map(
      ({
        accountId,
        currency,
        creditLimit,
        currentBalance,
        status,
        cutOffDay,
        paymentDueDay,
        ...customer
      }) => {
        const hasAccount =
          accountId &&
          currency &&
          creditLimit &&
          currentBalance &&
          status &&
          cutOffDay !== null &&
          paymentDueDay !== null;

        if (!hasAccount) {
          return { ...customer, account: null, collections: EMPTY_COLLECTIONS };
        }

        const curr = currency as Currency;
        const unpaid = cyclesByAccount.get(accountId) ?? [];
        let payable = Money.zero(curr);
        let overdue = Money.zero(curr);
        let hasOverdue = false;
        let hasDueSoon = false;
        let nextDueDate: Date | null = null;

        for (const c of unpaid) {
          const left = Money.of(c.totalDue, curr).minus(Money.of(c.amountPaid, curr));
          if (!left.isPositive()) continue;
          payable = payable.plus(left);
          if (c.status === 'OVERDUE') {
            hasOverdue = true;
            overdue = overdue.plus(left);
          } else if (c.status === 'BILLED') {
            const due = BusinessDate.fromInstant(c.paymentDueDate);
            if (BusinessDate.daysBetween(today, due) <= DUE_SOON_DAYS) {
              hasDueSoon = true;
            }
          }
          if (!nextDueDate || c.paymentDueDate.getTime() < nextDueDate.getTime()) {
            nextDueDate = c.paymentDueDate;
          }
        }

        return {
          ...customer,
          account: {
            id: accountId,
            currency,
            creditLimit,
            currentBalance,
            status,
            cutOffDay,
            paymentDueDay,
          },
          collections: {
            payableAmount: payable.toFixed2(),
            overdueAmount: overdue.toFixed2(),
            payableCyclesCount: unpaid.length,
            hasOverdue,
            hasDueSoon,
            nextDueDate,
          },
        };
      },
    );
  });
}

export async function getCustomer(
  storeId: string,
  customerId: string,
): Promise<CustomerDetail | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({ customer: customers, account: creditAccounts })
      .from(customers)
      .leftJoin(creditAccounts, eq(creditAccounts.customerId, customers.id))
      .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)));
    if (!row) return null;
    const { customer, account } = row;
    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      phone: customer.phone,
      accountId: account?.id ?? null,
      emailBouncedAt: customer.emailBouncedAt,
      email: customer.email,
      address: customer.address,
      preferredLocale: customer.preferredLocale,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      account: account
        ? {
            id: account.id,
            currency: account.currency,
            creditLimit: account.creditLimit,
            currentBalance: account.currentBalance,
            status: account.status,
            cutOffDay: account.cutOffDay,
            paymentDueDay: account.paymentDueDay,
          }
        : null,
      terms: account ? termsFromRow(account) : null,
    };
  });
}

/** Pagos recientes, consentimientos y puntaje interno (solo si el rol tiene reports.view). */
export async function getCustomerProfileExtras(
  storeId: string,
  customerId: string,
  accountId: string | null,
  options: { includeScore: boolean; now?: Date },
): Promise<CustomerProfileExtras> {
  const now = options.now ?? new Date();
  const today = BusinessDate.fromInstant(now);
  const historyFrom = BusinessDate.addCalendarMonths(
    BusinessDate.of(today.year, today.month, 1),
    -SCORE_HISTORY_MONTHS,
  );

  return withTenant(storeId, async (tx) => {
    const consents = await tx
      .select({
        id: customerConsents.id,
        consentType: customerConsents.consentType,
        policyVersion: customerConsents.policyVersion,
        acceptedAt: customerConsents.acceptedAt,
      })
      .from(customerConsents)
      .where(
        and(eq(customerConsents.storeId, storeId), eq(customerConsents.customerId, customerId)),
      )
      .orderBy(desc(customerConsents.acceptedAt))
      .limit(10);

    if (!accountId) {
      return { payments: [], consents, score: null };
    }

    const payments = await tx
      .select({
        id: debtPayments.id,
        receiptNumber: debtPayments.receiptNumber,
        amountPaid: debtPayments.amountPaid,
        paymentMethod: debtPayments.paymentMethod,
        paymentDate: debtPayments.paymentDate,
        cycleId: settlementCycles.id,
        cycleNumber: settlementCycles.cycleNumber,
      })
      .from(debtPayments)
      .innerJoin(settlementCycles, eq(settlementCycles.id, debtPayments.settlementCycleId))
      .where(and(eq(debtPayments.storeId, storeId), eq(debtPayments.creditAccountId, accountId)))
      .orderBy(desc(debtPayments.paymentDate))
      .limit(10);

    if (!options.includeScore) {
      return { payments, consents, score: null };
    }

    const scoredRows = await tx
      .select({
        status: settlementCycles.status,
        cutOffDate: settlementCycles.cutOffDate,
        paymentDueDate: settlementCycles.paymentDueDate,
        paidAt: max(debtPayments.paymentDate),
      })
      .from(settlementCycles)
      .leftJoin(debtPayments, eq(debtPayments.settlementCycleId, settlementCycles.id))
      .where(
        and(
          eq(settlementCycles.storeId, storeId),
          eq(settlementCycles.creditAccountId, accountId),
          ne(settlementCycles.status, 'OPEN'),
          gte(settlementCycles.cutOffDate, BusinessDate.startInstant(historyFrom)),
        ),
      )
      .groupBy(settlementCycles.id);

    const scoredCycles: ScoredCycle[] = scoredRows.map((c) => ({
      cutOffDate: BusinessDate.fromInstant(c.cutOffDate),
      paymentDueDate: BusinessDate.fromInstant(c.paymentDueDate),
      paidOn: c.status === 'PAID' && c.paidAt ? BusinessDate.fromInstant(new Date(c.paidAt)) : null,
    }));

    return {
      payments,
      consents,
      score: {
        breakdown: creditScoreBreakdown(scoredCycles, today),
        suggestLowerLimit: suggestsLowerLimit(scoredCycles, today),
      },
    };
  });
}
