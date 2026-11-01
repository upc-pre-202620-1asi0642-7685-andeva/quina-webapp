import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import { loadCycleLedger } from '../collections/cycle-ledger';
import { COLLECTIONS_TYPES } from '../collections/notification-queue';
import {
  creditAccounts,
  creditChargeVoids,
  creditCharges,
  customers,
  debtPayments,
  notificationLogs,
  products,
  saleItems,
  settlementCycles,
  stores,
  users,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';

export type CycleStatus = 'OPEN' | 'BILLED' | 'PAID' | 'OVERDUE';

export type CycleSummary = {
  id: string;
  cycleNumber: number;
  status: CycleStatus;
  cutOffDate: Date;
  paymentDueDate: Date;
  /** Exigible liquidado; en un ciclo abierto, el capital comprado hasta hoy. */
  amount: string;
  amountPaid: string;
};

/** Ciclos de la cuenta de un vecino, del más nuevo al más antiguo. */
export async function listCycles(storeId: string, accountId: string): Promise<CycleSummary[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select()
      .from(settlementCycles)
      .where(eq(settlementCycles.creditAccountId, accountId))
      .orderBy(desc(settlementCycles.cutOffDate));
    const openIds = rows.filter((r) => r.status === 'OPEN').map((r) => r.id);
    const openTotals = new Map<string, Money>();
    if (openIds.length > 0) {
      const charges = await tx
        .select({
          cycleId: creditCharges.settlementCycleId,
          amount: creditCharges.principalAmount,
          modality: creditCharges.chargeModality,
          status: creditCharges.status,
        })
        .from(creditCharges)
        .where(inArray(creditCharges.settlementCycleId, openIds));
      for (const c of charges) {
        if (c.modality !== 'SINGLE_PAYMENT' || c.status === 'VOIDED') continue;
        const current = openTotals.get(c.cycleId) ?? Money.zero('PEN');
        openTotals.set(c.cycleId, current.plus(Money.of(c.amount, 'PEN')));
      }
    }
    return rows.map((r) => ({
      id: r.id,
      cycleNumber: r.cycleNumber,
      status: r.status as CycleStatus,
      cutOffDate: r.cutOffDate,
      paymentDueDate: r.paymentDueDate,
      amount: r.status === 'OPEN' ? (openTotals.get(r.id)?.toFixed2() ?? '0.00') : r.totalDue,
      amountPaid: r.amountPaid,
    }));
  });
}

export type ChargeConsent = 'PENDING' | 'ACCEPTED' | 'OBJECTED';

export type CycleDetailLine =
  | {
      kind: 'purchase';
      chargeId: string;
      date: Date;
      items: { name: string; quantity: string; amount: string }[];
      principal: string;
      /** null mientras el ciclo esté abierto: el interés se calcula en el corte. */
      days: number | null;
      interest: string | null;
      amount: string;
      chargeStatus: string;
      consentStatus: ChargeConsent;
      consentDeadline: Date | null;
      objectionNote: string | null;
      resolutionNote: string | null;
      voidReason: string | null;
    }
  | {
      kind: 'installment';
      chargeId: string;
      number: number;
      total: number;
      principal: string;
      interest: string;
      amount: string;
    }
  | { kind: 'void'; chargeId: string; amount: string };

/** Cargo en cuotas comprado en el ciclo: no se cobra en él, pero se puede observar. */
export type InstallmentPurchase = {
  chargeId: string;
  date: Date;
  items: { name: string; quantity: string; amount: string }[];
  principal: string;
  installments: number;
  chargeStatus: string;
  consentStatus: ChargeConsent;
  consentDeadline: Date | null;
  objectionNote: string | null;
  voidReason: string | null;
};

export type CycleDetail = {
  id: string;
  cycleNumber: number;
  status: CycleStatus;
  currency: Currency;
  cutOffDate: Date;
  paymentDueDate: Date;
  customer: { id: string; firstName: string; lastName: string; emailBouncedAt: Date | null };
  lines: CycleDetailLine[];
  installmentPurchases: InstallmentPurchase[];
  purchasesTotal: string;
  compensatoryInterestTotal: string;
  installmentsTotal: string;
  adjustmentsTotal: string;
  moratoryInterestTotal: string;
  totalDue: string;
  amountPaid: string;
  statementSentAt: Date | null;
  payments: { id: string; receiptNumber: string; amountPaid: string; paymentDate: Date }[];
};

async function itemsOf(tx: Tx, saleIds: string[]) {
  const byId = new Map<string, { name: string; quantity: string; amount: string }[]>();
  if (saleIds.length === 0) return byId;
  const rows = await tx
    .select({
      saleId: saleItems.saleId,
      name: products.name,
      quantity: saleItems.quantity,
      subtotal: saleItems.subtotal,
    })
    .from(saleItems)
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(inArray(saleItems.saleId, saleIds));
  for (const r of rows) {
    const list = byId.get(r.saleId) ?? [];
    list.push({
      name: r.name,
      quantity: r.quantity.replace(/\.?0+$/, '') || '0',
      amount: r.subtotal,
    });
    byId.set(r.saleId, list);
  }
  return byId;
}

/** Estado de cuenta de un ciclo (US10 crit. 4): compras por fecha, intereses, cuotas y anulaciones. */
export async function getCycleDetail(
  storeId: string,
  customerId: string,
  cycleId: string,
): Promise<CycleDetail | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({ cycle: settlementCycles, account: creditAccounts, customer: customers })
      .from(settlementCycles)
      .innerJoin(creditAccounts, eq(creditAccounts.id, settlementCycles.creditAccountId))
      .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
      .where(and(eq(settlementCycles.id, cycleId), eq(customers.id, customerId)));
    if (!row) return null;
    const { cycle, account, customer } = row;
    const currency = account.currency as Currency;

    const allCharges = await tx
      .select({ charge: creditCharges, voidReason: creditChargeVoids.reason })
      .from(creditCharges)
      .leftJoin(creditChargeVoids, eq(creditChargeVoids.creditChargeId, creditCharges.id))
      .where(eq(creditCharges.settlementCycleId, cycle.id))
      .orderBy(asc(creditCharges.purchaseDate));
    const items = await itemsOf(
      tx,
      allCharges.map((c) => c.charge.saleId),
    );
    const byCharge = new Map(allCharges.map((c) => [c.charge.id, c]));

    const ledger = await loadCycleLedger(tx, cycle, currency);
    if (!ledger.ok) throw new Error(`Ciclo inconsistente: ${ledger.error}`);
    const billed = cycle.status !== 'OPEN';

    const lines: CycleDetailLine[] = ledger.value.settlement.lines.map((line) => {
      if (line.kind === 'PURCHASE') {
        const found = byCharge.get(line.chargeId)!;
        const { charge } = found;
        return {
          kind: 'purchase',
          chargeId: charge.id,
          date: charge.purchaseDate,
          items: items.get(charge.saleId) ?? [],
          principal: line.principal.toFixed2(),
          days: billed ? line.days : null,
          interest: billed ? line.interest.toFixed2() : null,
          amount: (billed ? line.amount : line.principal).toFixed2(),
          chargeStatus: charge.status,
          consentStatus: charge.consentStatus as ChargeConsent,
          consentDeadline: charge.consentDeadline,
          objectionNote: charge.objectionNote,
          resolutionNote: charge.resolutionNote,
          voidReason: found.voidReason,
        };
      }
      if (line.kind === 'INSTALLMENT') {
        return {
          kind: 'installment',
          chargeId: line.chargeId,
          number: line.number,
          total: line.totalInstallments,
          principal: line.principal.toFixed2(),
          interest: line.interest.toFixed2(),
          amount: line.amount.toFixed2(),
        };
      }
      const amount = billed ? line.amount : line.principal;
      return { kind: 'void', chargeId: line.chargeId, amount: amount.toFixed2() };
    });

    const installmentPurchases: InstallmentPurchase[] = allCharges
      .filter((c) => c.charge.chargeModality === 'INSTALLMENTS')
      .map(({ charge, voidReason }) => ({
        chargeId: charge.id,
        date: charge.purchaseDate,
        items: items.get(charge.saleId) ?? [],
        principal: charge.principalAmount,
        installments: charge.installmentsCount ?? 0,
        chargeStatus: charge.status,
        consentStatus: charge.consentStatus as ChargeConsent,
        consentDeadline: charge.consentDeadline,
        objectionNote: charge.objectionNote,
        voidReason,
      }));

    const payments = await tx
      .select({
        id: debtPayments.id,
        receiptNumber: debtPayments.receiptNumber,
        amountPaid: debtPayments.amountPaid,
        paymentDate: debtPayments.paymentDate,
      })
      .from(debtPayments)
      .where(eq(debtPayments.settlementCycleId, cycle.id));

    const settlement = ledger.value.settlement;
    return {
      id: cycle.id,
      cycleNumber: cycle.cycleNumber,
      status: cycle.status as CycleStatus,
      currency,
      cutOffDate: cycle.cutOffDate,
      paymentDueDate: cycle.paymentDueDate,
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        emailBouncedAt: customer.emailBouncedAt,
      },
      lines,
      installmentPurchases,
      purchasesTotal: billed ? cycle.purchasesTotal : settlement.purchasesTotal.toFixed2(),
      compensatoryInterestTotal: cycle.compensatoryInterestTotal,
      installmentsTotal: billed ? cycle.installmentsTotal : settlement.installmentsTotal.toFixed2(),
      adjustmentsTotal: cycle.adjustmentsTotal,
      moratoryInterestTotal: cycle.moratoryInterestTotal,
      totalDue: billed
        ? cycle.totalDue
        : settlement.purchasesTotal
            .plus(settlement.installmentsTotal)
            .minus(
              Money.sum(
                lines.filter((l) => l.kind === 'void').map((l) => Money.of(l.amount, currency)),
                currency,
              ),
            )
            .toFixed2(),
      amountPaid: cycle.amountPaid,
      statementSentAt: cycle.statementSentAt,
      payments,
    };
  });
}

/** Día de Lima de un instante guardado, para las etiquetas de la interfaz. */
export const limaDay = (instant: Date) => BusinessDate.toISO(BusinessDate.fromInstant(instant));

export type Receipt = {
  id: string;
  receiptNumber: string;
  currency: Currency;
  paymentDate: Date;
  paymentMethod: string;
  amountPaid: string;
  principalPaid: string;
  compensatoryInterestPaid: string;
  moratoryInterestPaid: string;
  daysLate: number;
  notes: string | null;
  collector: string;
  store: { name: string; taxIdType: string; taxIdNumber: string };
  customer: { id: string; firstName: string; lastName: string; documentNumber: string };
  cycle: { id: string; cutOffDate: Date; paymentDueDate: Date };
};

/**
 * Recibo imprimible de un pago (US13 crit. 6). En el portal (US14.6) `customerId`
 * entra en la consulta: el recibo de otro vecino ni se carga.
 */
export function getReceipt(
  storeId: string,
  paymentId: string,
  customerId?: string,
): Promise<Receipt | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({
        payment: debtPayments,
        account: creditAccounts,
        customer: customers,
        cycle: settlementCycles,
        store: stores,
        collector: users.name,
      })
      .from(debtPayments)
      .innerJoin(creditAccounts, eq(creditAccounts.id, debtPayments.creditAccountId))
      .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
      .innerJoin(settlementCycles, eq(settlementCycles.id, debtPayments.settlementCycleId))
      .innerJoin(stores, eq(stores.id, debtPayments.storeId))
      .innerJoin(users, eq(users.id, debtPayments.userIdCollector))
      .where(
        and(eq(debtPayments.id, paymentId), customerId ? eq(customers.id, customerId) : undefined),
      );
    if (!row) return null;
    const { payment, account, customer, cycle, store } = row;
    return {
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      currency: account.currency as Currency,
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      amountPaid: payment.amountPaid,
      principalPaid: payment.principalPaid,
      compensatoryInterestPaid: payment.compensatoryInterestPaid,
      moratoryInterestPaid: payment.moratoryInterestPaid,
      daysLate: payment.daysLate,
      notes: payment.notes,
      collector: row.collector,
      store: {
        name: store.commercialName,
        taxIdType: store.taxIdType,
        taxIdNumber: store.taxIdNumber,
      },
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        documentNumber: customer.documentNumber,
      },
      cycle: { id: cycle.id, cutOffDate: cycle.cutOffDate, paymentDueDate: cycle.paymentDueDate },
    };
  });
}

export type CollectionRow = {
  cycleId: string;
  customerId: string;
  name: string;
  status: 'BILLED' | 'OVERDUE';
  currency: Currency;
  totalDue: string;
  paymentDueDate: Date;
};

/** Ciclos por cobrar y vencidos de la tienda, del pago más próximo al más lejano. */
export function listCollections(storeId: string): Promise<CollectionRow[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        cycleId: settlementCycles.id,
        customerId: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        status: settlementCycles.status,
        currency: creditAccounts.currency,
        totalDue: settlementCycles.totalDue,
        paymentDueDate: settlementCycles.paymentDueDate,
      })
      .from(settlementCycles)
      .innerJoin(creditAccounts, eq(creditAccounts.id, settlementCycles.creditAccountId))
      .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
      .where(inArray(settlementCycles.status, ['BILLED', 'OVERDUE']))
      .orderBy(asc(settlementCycles.paymentDueDate), asc(customers.firstName));
    return rows.map((r) => ({
      cycleId: r.cycleId,
      customerId: r.customerId,
      name: `${r.firstName} ${r.lastName}`,
      status: r.status as 'BILLED' | 'OVERDUE',
      currency: r.currency as Currency,
      totalDue: r.totalDue,
      paymentDueDate: r.paymentDueDate,
    }));
  });
}

export type TodayNotice = {
  id: string;
  type: string;
  status: string;
  customerId: string | null;
  name: string | null;
  recipientEmail: string;
  at: Date;
};

/** US12: avisos de cobranza del día en Lima, enviados o en cola. */
export function listTodayNotices(storeId: string, now: Date): Promise<TodayNotice[]> {
  const today = BusinessDate.fromInstant(now);
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: notificationLogs.id,
        type: notificationLogs.notificationType,
        status: notificationLogs.status,
        customerId: notificationLogs.customerId,
        firstName: customers.firstName,
        lastName: customers.lastName,
        recipientEmail: notificationLogs.recipientEmail,
        sentAt: notificationLogs.sentAt,
        createdAt: notificationLogs.createdAt,
      })
      .from(notificationLogs)
      .leftJoin(customers, eq(customers.id, notificationLogs.customerId))
      .where(
        and(
          inArray(notificationLogs.notificationType, [...COLLECTIONS_TYPES]),
          gte(notificationLogs.createdAt, BusinessDate.startInstant(today)),
          lte(notificationLogs.createdAt, BusinessDate.endInstant(today)),
        ),
      )
      .orderBy(desc(notificationLogs.createdAt));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      customerId: r.customerId,
      name: r.firstName ? `${r.firstName} ${r.lastName}` : null,
      recipientEmail: r.recipientEmail,
      at: r.sentAt ?? r.createdAt,
    }));
  });
}
