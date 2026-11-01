import { and, asc, eq, gte, inArray, isNull, lt, lte, max, ne, sql } from 'drizzle-orm';
import { cutOffBalanceIncrease } from '@/core/domain/credit/account-balance';
import { cycleWithPaymentOn, lastClosedCycle } from '@/core/domain/credit/billing-cycle';
import type { Subscription } from '@/core/domain/billing/plan-limits';
import type {
  DailyProcessGateway,
  DailyStore,
  DispatchResult,
} from '@/core/domain/ports/daily-process';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import { db } from '../connection';
import {
  creditAccounts,
  creditCharges,
  creditInstallments,
  customers,
  settlementCycles,
  stores,
  storeSubscriptions,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';
import { loadCycleLedger } from './cycle-ledger';
import { NotificationDispatcher } from './notification-dispatcher';
import { queueNotification } from './notification-queue';

const startOfToday = (now: Date) => BusinessDate.startInstant(BusinessDate.fromInstant(now));

export class DrizzleDailyProcess implements DailyProcessGateway {
  /**
   * `storeIds` acota el proceso a unas tiendas: las pruebas de integración lo
   * usan para no liquidar las tiendas de otras pruebas que corren en paralelo.
   */
  constructor(
    private readonly dispatcher: NotificationDispatcher = new NotificationDispatcher(),
    private readonly options: { storeIds?: readonly string[] } = {},
  ) {}

  async activeStores(): Promise<DailyStore[]> {
    const only = this.options.storeIds;
    const rows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(
        only
          ? and(eq(stores.isActive, true), inArray(stores.id, [...only]))
          : eq(stores.isActive, true),
      );
    const result: DailyStore[] = [];
    for (const { id } of rows) {
      const [sub] = await withTenant(id, (tx) =>
        tx
          .select({
            planTier: storeSubscriptions.planTier,
            status: storeSubscriptions.status,
            trialEndsAt: storeSubscriptions.trialEndsAt,
          })
          .from(storeSubscriptions)
          .where(eq(storeSubscriptions.storeId, id))
          .limit(1),
      );
      const subscription: Subscription = sub
        ? (sub as Subscription)
        : { planTier: 'CASERO', status: 'ACTIVE', trialEndsAt: null };
      result.push({ id, subscription });
    }
    return result;
  }

  acceptExpiredConsents(storeId: string, now: Date): Promise<number> {
    return withTenant(storeId, async (tx) => {
      const rows = await tx
        .update(creditCharges)
        .set({ consentStatus: 'ACCEPTED', updatedAt: now })
        .where(
          and(
            eq(creditCharges.consentStatus, 'PENDING'),
            lt(creditCharges.consentDeadline, now),
            ne(creditCharges.status, 'VOIDED'),
          ),
        )
        .returning({ id: creditCharges.id });
      return rows.length;
    });
  }

  /**
   * US10: cada cuenta en su propia transacción, con la cuenta bloqueada como
   * en la venta (D14 del Plan 3), así el corte y un fiado no se cruzan.
   */
  async settleDueCycles(storeId: string, now: Date): Promise<number> {
    const accountIds = await withTenant(storeId, async (tx) => {
      const open = await tx
        .selectDistinct({ id: settlementCycles.creditAccountId })
        .from(settlementCycles)
        .where(
          and(
            eq(settlementCycles.status, 'OPEN'),
            lt(settlementCycles.cutOffDate, startOfToday(now)),
          ),
        );
      // Cuotas que vencen pronto: su ciclo puede no existir si el vecino no compró (US10 crit. 7)
      const horizon = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      const pending = await tx
        .selectDistinct({ id: creditInstallments.creditAccountId })
        .from(creditInstallments)
        .where(
          and(eq(creditInstallments.status, 'PENDING'), lte(creditInstallments.dueDate, horizon)),
        );
      return [...new Set([...open, ...pending].map((r) => r.id))];
    });

    let settled = 0;
    for (const accountId of accountIds) {
      settled += await withTenant(storeId, (tx) => settleAccount(tx, storeId, accountId, now));
    }
    return settled;
  }

  markOverdueCycles(storeId: string, now: Date, queueNotices: boolean): Promise<number> {
    return withTenant(storeId, async (tx) => {
      const overdue = await tx
        .update(settlementCycles)
        .set({ status: 'OVERDUE', updatedAt: now })
        .where(
          and(
            eq(settlementCycles.status, 'BILLED'),
            lt(settlementCycles.paymentDueDate, startOfToday(now)),
          ),
        )
        .returning();
      for (const cycle of overdue) {
        const day = BusinessDate.fromInstant(cycle.paymentDueDate);
        await tx
          .update(creditInstallments)
          .set({ status: 'OVERDUE', updatedAt: now })
          .where(
            and(
              eq(creditInstallments.creditAccountId, cycle.creditAccountId),
              eq(creditInstallments.status, 'PENDING'),
              gte(creditInstallments.dueDate, BusinessDate.startInstant(day)),
              lte(creditInstallments.dueDate, BusinessDate.endInstant(day)),
            ),
          );
        if (queueNotices) {
          await queueCycleNotice(tx, storeId, cycle.creditAccountId, cycle.id, 'LATE_PAYMENT', now);
        }
      }
      return overdue.length;
    });
  }

  queueChargeDigests(storeId: string, now: Date): Promise<number> {
    return queueChargeDigests(storeId, now, startOfToday(now));
  }

  queuePaymentReminders(storeId: string, now: Date): Promise<number> {
    return queuePaymentReminders(storeId, now);
  }

  dispatchPending(storeId: string, now: Date, deadline: Date): Promise<DispatchResult> {
    return this.dispatcher.dispatchStore(storeId, now, deadline);
  }
}

/** Liquida los ciclos vencidos de una cuenta; devuelve cuántos liquidó. */
async function settleAccount(
  tx: Tx,
  storeId: string,
  accountId: string,
  now: Date,
): Promise<number> {
  const [account] = await tx
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.id, accountId))
    .for('update');
  if (!account) return 0;
  const currency = account.currency as Currency;
  const days = { cutOffDay: account.cutOffDay, paymentDueDay: account.paymentDueDay };
  const today = BusinessDate.fromInstant(now);
  const closed = lastClosedCycle(today, days);

  await openInstallmentOnlyCycles(tx, storeId, accountId, days, closed.cutOffDate, now);

  const due = await tx
    .select()
    .from(settlementCycles)
    .where(
      and(
        eq(settlementCycles.creditAccountId, accountId),
        eq(settlementCycles.status, 'OPEN'),
        lt(settlementCycles.cutOffDate, startOfToday(now)),
      ),
    )
    .orderBy(asc(settlementCycles.cutOffDate));

  let balance = Money.of(account.currentBalance, currency);
  for (const cycle of due) {
    const ledger = await loadCycleLedger(tx, cycle, currency);
    if (!ledger.ok) throw new Error(`No se pudo liquidar el ciclo ${cycle.id}: ${ledger.error}`);
    const { settlement } = ledger.value;

    for (const line of settlement.lines) {
      if (line.kind !== 'PURCHASE') continue;
      const charge = ledger.value.charges.find((c) => c.id === line.chargeId)!;
      if (charge.status === 'VOIDED') continue;
      await tx
        .update(creditCharges)
        .set({ status: 'BILLED', compensatoryInterest: line.interest.toFixed2(), updatedAt: now })
        .where(eq(creditCharges.id, charge.id));
    }

    const opening = balance;
    balance = balance.plus(cutOffBalanceIncrease(settlement, ledger.value.releaseOf));
    const zero = settlement.totalDue.isZero();
    await tx
      .update(settlementCycles)
      .set({
        openingBalance: opening.toFixed2(),
        purchasesTotal: settlement.purchasesTotal.toFixed2(),
        compensatoryInterestTotal: settlement.compensatoryInterestTotal.toFixed2(),
        installmentsTotal: settlement.installmentsTotal.toFixed2(),
        adjustmentsTotal: settlement.adjustmentsTotal.toFixed2(),
        totalDue: settlement.totalDue.toFixed2(),
        // D12: un ciclo en cero (todo anulado) queda pagado y sin estado de cuenta
        status: zero ? 'PAID' : 'BILLED',
        updatedAt: now,
      })
      .where(eq(settlementCycles.id, cycle.id));
    if (!zero) await queueCycleNotice(tx, storeId, accountId, cycle.id, 'CYCLE_STATEMENT', now);
  }

  if (due.length > 0) {
    await tx
      .update(creditAccounts)
      .set({ currentBalance: balance.toFixed2(), updatedAt: now })
      .where(eq(creditAccounts.id, accountId));
  }
  return due.length;
}

/**
 * US10 crit. 7: si en un ciclo ya cerrado vence una cuota y el vecino no compró
 * nada, el ciclo no existe; se crea aquí para liquidarlo en el mismo corte.
 */
async function openInstallmentOnlyCycles(
  tx: Tx,
  storeId: string,
  accountId: string,
  days: { cutOffDay: number; paymentDueDay: number },
  lastClosedCutOff: BusinessDate,
  now: Date,
) {
  const pending = await tx
    .select({ dueDate: creditInstallments.dueDate })
    .from(creditInstallments)
    .where(
      and(
        eq(creditInstallments.creditAccountId, accountId),
        eq(creditInstallments.status, 'PENDING'),
      ),
    );
  const seen = new Set<string>();
  const missing = pending
    .map((r) => cycleWithPaymentOn(BusinessDate.fromInstant(r.dueDate), days))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c) => BusinessDate.compare(c.cutOffDate, lastClosedCutOff) <= 0)
    .filter((c) => {
      const key = `${c.periodYear}-${c.periodMonth}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => BusinessDate.compare(a.cutOffDate, b.cutOffDate));

  for (const cycle of missing) {
    const [exists] = await tx
      .select({ id: settlementCycles.id })
      .from(settlementCycles)
      .where(
        and(
          eq(settlementCycles.creditAccountId, accountId),
          eq(settlementCycles.periodYear, cycle.periodYear),
          eq(settlementCycles.periodMonth, cycle.periodMonth),
        ),
      );
    if (exists) continue;
    const [last] = await tx
      .select({ n: max(settlementCycles.cycleNumber) })
      .from(settlementCycles)
      .where(eq(settlementCycles.creditAccountId, accountId));
    await tx.insert(settlementCycles).values({
      storeId,
      creditAccountId: accountId,
      cycleNumber: (last?.n ?? 0) + 1,
      periodYear: cycle.periodYear,
      periodMonth: cycle.periodMonth,
      cutOffDate: cycle.cutOffInstant,
      paymentDueDate: cycle.paymentDueInstant,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** Pone en cola el aviso de un ciclo; el índice único impide duplicarlo (D10). */
export async function queueCycleNotice(
  tx: Tx,
  storeId: string,
  accountId: string,
  cycleId: string,
  type: 'CYCLE_STATEMENT' | 'PAYMENT_REMINDER' | 'LATE_PAYMENT',
  now: Date,
): Promise<boolean> {
  const [customer] = await tx
    .select({ id: customers.id, email: customers.email, locale: customers.preferredLocale })
    .from(creditAccounts)
    .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
    .where(eq(creditAccounts.id, accountId));
  if (!customer) return false;
  const id = await queueNotification(tx, {
    storeId,
    customerId: customer.id,
    type,
    recipientEmail: customer.email,
    customerLocale: customer.locale,
    referenceType: 'settlement_cycles',
    referenceId: cycleId,
    // La hora del proceso (simulada en pruebas y demo): así cae en los avisos de ese día
    createdAt: now,
  });
  return id !== null;
}

/**
 * US11 crit. 2: un resumen por vecino con sus cargos sin notificar creados
 * antes de `until`. El proceso diario usa el inicio de hoy; el botón de Casero,
 * el momento en que se presiona.
 */
export function queueChargeDigests(storeId: string, now: Date, until: Date): Promise<number> {
  return withTenant(storeId, async (tx) => {
    const pending = await tx
      .selectDistinct({
        customerId: customers.id,
        email: customers.email,
        locale: customers.preferredLocale,
      })
      .from(creditCharges)
      .innerJoin(creditAccounts, eq(creditAccounts.id, creditCharges.creditAccountId))
      .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
      .where(
        and(
          isNull(creditCharges.notifiedAt),
          ne(creditCharges.status, 'VOIDED'),
          lt(creditCharges.createdAt, until),
        ),
      );
    let queued = 0;
    for (const c of pending) {
      const ok = await queueNotification(tx, {
        storeId,
        customerId: c.customerId,
        type: 'CHARGE_DIGEST',
        recipientEmail: c.email,
        customerLocale: c.locale,
        digestDate: BusinessDate.toISO(BusinessDate.fromInstant(now)),
        createdAt: now,
      });
      if (ok) queued += 1;
    }
    return queued;
  });
}

/**
 * US12 crit. 1 y D1b: ciclos todavía `BILLED` cuyo pago vence entre hoy y
 * dentro de 3 días; el índice único deja un solo recordatorio por ciclo.
 */
export function queuePaymentReminders(storeId: string, now: Date): Promise<number> {
  return withTenant(storeId, async (tx) => {
    const today = BusinessDate.fromInstant(now);
    const limit = BusinessDate.endInstant(
      BusinessDate.fromInstant(
        new Date(BusinessDate.startInstant(today).getTime() + 3 * 86_400_000),
      ),
    );
    const cycles = await tx
      .select({ id: settlementCycles.id, accountId: settlementCycles.creditAccountId })
      .from(settlementCycles)
      .where(
        and(
          eq(settlementCycles.status, 'BILLED'),
          gte(settlementCycles.paymentDueDate, BusinessDate.startInstant(today)),
          lte(settlementCycles.paymentDueDate, limit),
        ),
      );
    let queued = 0;
    for (const c of cycles) {
      if (await queueCycleNotice(tx, storeId, c.accountId, c.id, 'PAYMENT_REMINDER', now))
        queued += 1;
    }
    return queued;
  });
}

/** Ids de los ciclos de un conjunto que siguen sin pagar (para omitir avisos viejos). */
export async function unpaidCycleIds(tx: Tx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: settlementCycles.id })
    .from(settlementCycles)
    .where(
      and(
        inArray(settlementCycles.id, ids),
        sql`${settlementCycles.status} IN ('BILLED', 'OVERDUE')`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}
