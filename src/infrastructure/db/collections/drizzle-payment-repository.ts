import { and, asc, eq, inArray, max, ne, sql } from 'drizzle-orm';
import { paymentBalanceDecrease } from '@/core/domain/credit/account-balance';
import {
  allocatePayment,
  moratoryBasesOf,
  quotePayment,
  validatePaymentAmount,
  type PayableCycle,
} from '@/core/domain/credit/debt-payment';
import type {
  PaymentError,
  PaymentPreview,
  PaymentRepository,
  PendingObjection,
  RegisteredPayment,
} from '@/core/domain/ports/payment-repository';
import { settleCashPayment } from '@/core/domain/sales/cash-payment';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';
import {
  creditAccounts,
  creditCharges,
  creditInstallments,
  customers,
  debtPayments,
  paymentAllocations,
  settlementCycles,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';
import { loadCycleLedger, type CycleLedger, type CycleRow } from './cycle-ledger';
import { queueNotification } from './notification-queue';

type Account = typeof creditAccounts.$inferSelect;

type Payable = {
  row: CycleRow;
  ledger: CycleLedger;
  payable: PayableCycle;
  objections: PendingObjection[];
  laterCycles: number;
};

async function accountOf(tx: Tx, customerId: string, lock: boolean): Promise<Account | null> {
  const query = tx.select().from(creditAccounts).where(eq(creditAccounts.customerId, customerId));
  const [account] = lock ? await query.for('update') : await query;
  return account ?? null;
}

/** El ciclo que toca cobrar: el más antiguo liquidado y sin pagar (US13 crit. 8, D6). */
async function oldestPayable(tx: Tx, account: Account): Promise<Result<Payable, PaymentError>> {
  const cycles = await tx
    .select()
    .from(settlementCycles)
    .where(
      and(
        eq(settlementCycles.creditAccountId, account.id),
        inArray(settlementCycles.status, ['BILLED', 'OVERDUE']),
      ),
    )
    .orderBy(asc(settlementCycles.cutOffDate));
  const row = cycles[0];
  if (!row) return err('NO_PAYABLE_CYCLE');

  const currency = account.currency as Currency;
  const ledger = await loadCycleLedger(tx, row, currency);
  if (!ledger.ok) return err('SETTLEMENT_MISMATCH');
  const { settlement } = ledger.value;
  const payable: PayableCycle = {
    id: row.id,
    status: row.status as PayableCycle['status'],
    cutOffDate: BusinessDate.fromInstant(row.cutOffDate),
    paymentDueDate: BusinessDate.fromInstant(row.paymentDueDate),
    totalDue: Money.of(row.totalDue, currency),
    moratoryBases: moratoryBasesOf(settlement, (lineId) => ledger.value.moratoryRateOf(lineId)),
  };
  return ok({
    row,
    ledger: ledger.value,
    payable,
    objections: await objectionsOf(tx, ledger.value),
    laterCycles: cycles.length - 1,
  });
}

/** D8: cargos del ciclo (o dueños de sus cuotas) observados y sin resolver. */
async function objectionsOf(tx: Tx, ledger: CycleLedger): Promise<PendingObjection[]> {
  const ids = [
    ...new Set([
      ...ledger.charges.filter((c) => c.status !== 'VOIDED').map((c) => c.id),
      ...ledger.installments.map((i) => i.chargeId),
    ]),
  ];
  if (ids.length === 0) return [];
  const rows = await tx
    .select({
      chargeId: creditCharges.id,
      cycleId: creditCharges.settlementCycleId,
      purchaseDate: creditCharges.purchaseDate,
    })
    .from(creditCharges)
    .where(
      and(
        inArray(creditCharges.id, ids),
        eq(creditCharges.consentStatus, 'OBJECTED'),
        ne(creditCharges.status, 'VOIDED'),
      ),
    )
    .orderBy(asc(creditCharges.purchaseDate));
  return rows;
}

/** D7: correlativo por tienda `R-000001`, serializado con un candado de la transacción. */
async function nextReceiptNumber(tx: Tx, storeId: string): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`receipt:${storeId}`}))`);
  const [row] = await tx
    .select({ last: max(debtPayments.receiptNumber) })
    .from(debtPayments)
    .where(eq(debtPayments.storeId, storeId));
  const last = row?.last ? Number(row.last.replace(/^R-/, '')) : 0;
  return `R-${String(last + 1).padStart(6, '0')}`;
}

export class DrizzlePaymentRepository implements PaymentRepository {
  preview(input: { storeId: string; customerId: string; now: Date }) {
    return withTenant(input.storeId, async (tx): Promise<Result<PaymentPreview, PaymentError>> => {
      const account = await accountOf(tx, input.customerId, false);
      if (!account) return err('ACCOUNT_NOT_FOUND');
      const found = await oldestPayable(tx, account);
      if (!found.ok) return found;
      const { row, payable, objections, laterCycles } = found.value;
      const quote = quotePayment(payable, input.now);
      if (!quote.ok) return quote;
      return ok({
        accountId: account.id,
        currency: account.currency as Currency,
        cycle: {
          id: row.id,
          cycleNumber: row.cycleNumber,
          status: payable.status as 'BILLED' | 'OVERDUE',
          cutOffDate: row.cutOffDate,
          paymentDueDate: row.paymentDueDate,
        },
        totalDue: quote.value.totalDue.toFixed2(),
        daysLate: quote.value.daysLate,
        moratoryInterest: quote.value.moratoryInterest.toFixed2(),
        amountDue: quote.value.amountDue.toFixed2(),
        objections,
        laterCycles,
      });
    });
  }

  register(input: {
    storeId: string;
    customerId: string;
    collectorId: string;
    cycleId: string;
    amount: string;
    method: 'CASH' | 'YAPE' | 'PLIN' | 'TRANSFER';
    amountReceived: string;
    now: Date;
  }) {
    return withTenant(
      input.storeId,
      async (tx): Promise<Result<RegisteredPayment, PaymentError>> => {
        const account = await accountOf(tx, input.customerId, true);
        if (!account) return err('ACCOUNT_NOT_FOUND');
        const currency = account.currency as Currency;
        const found = await oldestPayable(tx, account);
        if (!found.ok) return found;
        const { row, ledger, payable, objections } = found.value;
        // La pantalla cotizó otro ciclo (otro cobro se adelantó): se vuelve a cotizar
        if (row.id !== input.cycleId) return err('CYCLE_NOT_OLDEST');
        if (objections.length > 0) return err('OBJECTION_PENDING');

        const quote = quotePayment(payable, input.now);
        if (!quote.ok) return quote;
        if (!/^\d{1,10}(\.\d{1,2})?$/.test(input.amount)) return err('PARTIAL_PAYMENT_NOT_ALLOWED');
        const amount = Money.of(input.amount, currency);
        const exact = validatePaymentAmount(quote.value, amount);
        if (!exact.ok) return exact;
        const allocation = allocatePayment(ledger.settlement, quote.value);
        if (!allocation.ok) return allocation;
        const cash = settleCashPayment(
          quote.value.amountDue,
          input.method === 'CASH' ? 'CASH' : 'YAPE',
          input.amountReceived,
        );
        if (!cash.ok) return cash;

        const receiptNumber = await nextReceiptNumber(tx, input.storeId);
        const a = allocation.value;
        const [payment] = await tx
          .insert(debtPayments)
          .values({
            storeId: input.storeId,
            creditAccountId: account.id,
            settlementCycleId: row.id,
            userIdCollector: input.collectorId,
            paymentMethod: input.method,
            amountPaid: a.amountPaid.toFixed2(),
            compensatoryInterestPaid: a.compensatoryInterestPaid.toFixed2(),
            moratoryInterestPaid: a.moratoryInterestPaid.toFixed2(),
            principalPaid: a.principalPaid.toFixed2(),
            daysLate: quote.value.daysLate,
            paymentDate: input.now,
            receiptNumber,
            notes: cash.value.amountReceived
              ? `Recibido ${cash.value.amountReceived.toFixed2()}, vuelto ${cash.value.changeGiven!.toFixed2()}`
              : null,
            createdAt: input.now,
          })
          .returning({ id: debtPayments.id });
        const paymentId = payment!.id;

        if (a.rows.length > 0) {
          await tx.insert(paymentAllocations).values(
            a.rows.map((r) => ({
              storeId: input.storeId,
              debtPaymentId: paymentId,
              creditChargeId: r.target.kind === 'CHARGE' ? r.target.chargeId : null,
              creditInstallmentId: r.target.kind === 'INSTALLMENT' ? r.target.installmentId : null,
              allocationType: r.type,
              amount: r.amount.toFixed2(),
              createdAt: input.now,
            })),
          );
        }

        await markPaid(tx, ledger, input.now);
        await tx
          .update(settlementCycles)
          .set({
            status: 'PAID',
            amountPaid: a.amountPaid.toFixed2(),
            moratoryInterestTotal: a.moratoryInterestPaid.toFixed2(),
            updatedAt: input.now,
          })
          .where(eq(settlementCycles.id, row.id));
        // D3: la mora nunca entró al saldo, así que tampoco sale de él
        await tx
          .update(creditAccounts)
          .set({
            currentBalance: Money.of(account.currentBalance, currency)
              .minus(paymentBalanceDecrease(a))
              .toFixed2(),
            updatedAt: input.now,
          })
          .where(eq(creditAccounts.id, account.id));

        const [customer] = await tx
          .select({ id: customers.id, email: customers.email, locale: customers.preferredLocale })
          .from(customers)
          .where(eq(customers.id, input.customerId));
        const receiptLogId = customer
          ? await queueNotification(tx, {
              storeId: input.storeId,
              customerId: customer.id,
              type: 'PAYMENT_RECEIPT',
              recipientEmail: customer.email,
              customerLocale: customer.locale,
              referenceType: 'debt_payments',
              referenceId: paymentId,
              createdAt: input.now,
            })
          : null;

        return ok({
          paymentId,
          receiptNumber,
          amountPaid: a.amountPaid.toFixed2(),
          changeGiven: cash.value.changeGiven?.toFixed2() ?? null,
          receiptLogId,
        });
      },
    );
  }
}

/** Cargos únicos y cuotas del ciclo pasan a pagados; el cargo en cuotas, al pagar la última. */
async function markPaid(tx: Tx, ledger: CycleLedger, now: Date) {
  const single = ledger.charges.filter((c) => c.status !== 'VOIDED').map((c) => c.id);
  if (single.length > 0) {
    await tx
      .update(creditCharges)
      .set({ status: 'PAID', updatedAt: now })
      .where(inArray(creditCharges.id, single));
  }
  const installmentIds = ledger.installments.map((i) => i.id);
  if (installmentIds.length === 0) return;
  await tx
    .update(creditInstallments)
    .set({ status: 'PAID', paidAt: now, updatedAt: now })
    .where(inArray(creditInstallments.id, installmentIds));

  for (const chargeId of new Set(ledger.installments.map((i) => i.chargeId))) {
    const [open] = await tx
      .select({ id: creditInstallments.id })
      .from(creditInstallments)
      .where(
        and(
          eq(creditInstallments.creditChargeId, chargeId),
          inArray(creditInstallments.status, ['PENDING', 'OVERDUE']),
        ),
      )
      .limit(1);
    await tx
      .update(creditCharges)
      .set({ status: open ? 'BILLED' : 'PAID', updatedAt: now })
      .where(eq(creditCharges.id, chargeId));
  }
}
