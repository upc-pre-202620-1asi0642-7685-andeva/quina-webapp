import { and, asc, eq, gt, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { payableLines } from '@/core/domain/credit/debt-payment';
import type {
  CollectionsMail,
  CollectionsMailer,
  CollectionsMailLine,
  CollectionsMailKind,
} from '@/core/domain/ports/collections-mailer';
import type { DispatchResult } from '@/core/domain/ports/daily-process';
import { BusinessDate } from '@/core/domain/shared/business-date';
import type { Locale } from '@/core/domain/shared/locale';
import { Money, type Currency } from '@/core/domain/shared/money';
import { getAuth } from '../../auth/auth';
import { createPortalLink } from '../../auth/portal-link';
import { getCollectionsMailer } from '../../email/collections-mailers';
import {
  creditAccounts,
  creditCharges,
  customers,
  debtPayments,
  notificationLogs,
  products,
  saleItems,
  settlementCycles,
  stores,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';
import { loadCycleLedger } from './cycle-ledger';
import { COLLECTIONS_TYPES, type CollectionsLogType } from './notification-queue';

type LogRow = typeof notificationLogs.$inferSelect;

const KIND: Record<CollectionsLogType, CollectionsMailKind> = {
  CHARGE_DIGEST: 'charge-digest',
  CYCLE_STATEMENT: 'cycle-statement',
  PAYMENT_REMINDER: 'payment-reminder',
  LATE_PAYMENT: 'late-payment',
  PAYMENT_RECEIPT: 'payment-receipt',
};

/** Un envío que ya no aplica (ciclo pagado, sin cargos): no se reintenta. */
const SKIPPED = 'SKIPPED';
/** Los fallidos se reintentan durante 3 días; después dejan de intentarse. */
const RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const CONSENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Crea el enlace mágico al portal del vecino; `null` si no se pudo. */
export type PortalLinkCreator = (email: string, storeId: string) => Promise<string | null>;

const defaultPortalLink: PortalLinkCreator = (email, storeId) =>
  createPortalLink(getAuth(), process.env.APP_URL ?? 'http://localhost:3000/app', email, storeId);

/** US14.2: el comprobante no lleva enlace (P4). */
const WITH_PORTAL_LINK = new Set<CollectionsMailKind>([
  'charge-digest',
  'cycle-statement',
  'payment-reminder',
  'late-payment',
]);

type Built = { mail: CollectionsMail; onSent?: (tx: Tx, sentAt: Date) => Promise<void> };

const iso = (instant: Date) => BusinessDate.toISO(BusinessDate.fromInstant(instant));
const limaTime = (instant: Date) => {
  const lima = new Date(instant.getTime() - 5 * 60 * 60 * 1000);
  return `${String(lima.getUTCHours()).padStart(2, '0')}:${String(lima.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * Envía los correos de cobranza que están en cola o fallaron (D10): arma cada
 * uno desde su referencia, lo envía fuera de la transacción del negocio y marca
 * `SENT` o `FAILED`. Va uno por uno con pausa, por el límite de Resend.
 */
export class NotificationDispatcher {
  constructor(
    private readonly mailer: () => CollectionsMailer = getCollectionsMailer,
    private readonly pauseMs: number = process.env.EMAIL_TRANSPORT === 'outbox' ? 0 : 550,
    private readonly portalLink: PortalLinkCreator = defaultPortalLink,
  ) {}

  async dispatchStore(storeId: string, now: Date, deadline: Date): Promise<DispatchResult> {
    const today = iso(now);
    const rows = await withTenant(storeId, (tx) =>
      tx
        .select()
        .from(notificationLogs)
        .where(
          and(
            inArray(notificationLogs.notificationType, [...COLLECTIONS_TYPES]),
            or(
              eq(notificationLogs.status, 'QUEUED'),
              and(
                eq(notificationLogs.status, 'FAILED'),
                or(
                  isNull(notificationLogs.errorMessage),
                  ne(notificationLogs.errorMessage, SKIPPED),
                ),
              ),
            ),
            gt(notificationLogs.createdAt, new Date(now.getTime() - RETRY_WINDOW_MS)),
            // Un resumen de otro día que falló se reemplaza por el de hoy (D9)
            or(
              ne(notificationLogs.notificationType, 'CHARGE_DIGEST'),
              eq(notificationLogs.digestDate, today),
            ),
          ),
        )
        .orderBy(asc(notificationLogs.createdAt))
        .limit(200),
    );

    const result: DispatchResult = { sent: 0, failed: 0, pending: 0 };
    for (const row of rows) {
      if (Date.now() > deadline.getTime()) {
        result.pending += 1;
        continue;
      }
      const outcome = await this.deliver(storeId, row, now);
      if (outcome === 'SENT') result.sent += 1;
      else if (outcome === 'FAILED') result.failed += 1;
      if (this.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, this.pauseMs));
    }
    return result;
  }

  /** Envía un solo correo ya en cola (el recibo del mostrador, D10). */
  async dispatchOne(
    storeId: string,
    logId: string,
    now = new Date(),
  ): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    const [row] = await withTenant(storeId, (tx) =>
      tx.select().from(notificationLogs).where(eq(notificationLogs.id, logId)),
    );
    if (!row || row.status === 'SENT') return 'SKIPPED';
    return this.deliver(storeId, row, now);
  }

  /**
   * `sentAt` es la hora del proceso: con la fecha simulada (D17) las 48 h de
   * conformidad corren desde el día simulado, no desde el reloj real.
   */
  private async deliver(
    storeId: string,
    row: LogRow,
    sentAt: Date,
  ): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    let built: Built | null;
    try {
      built = await withTenant(storeId, (tx) => build(tx, row));
    } catch (error) {
      await mark(storeId, row.id, { status: 'FAILED', errorMessage: messageOf(error) });
      return 'FAILED';
    }
    if (!built) {
      await mark(storeId, row.id, { status: 'FAILED', errorMessage: SKIPPED });
      return 'SKIPPED';
    }
    if (WITH_PORTAL_LINK.has(built.mail.kind)) {
      // Sin enlace el correo igual sale: el vecino puede entrar con su documento
      const portalUrl = await this.portalLink(built.mail.to, storeId).catch(() => null);
      if (portalUrl) built.mail.portalUrl = portalUrl;
    }
    try {
      const { providerMessageId } = await this.mailer().send(built.mail);
      await withTenant(storeId, async (tx) => {
        await tx
          .update(notificationLogs)
          .set({ status: 'SENT', providerMessageId, sentAt, errorMessage: null, updatedAt: sentAt })
          .where(eq(notificationLogs.id, row.id));
        await built.onSent?.(tx, sentAt);
      });
      return 'SENT';
    } catch (error) {
      await mark(storeId, row.id, { status: 'FAILED', errorMessage: messageOf(error) });
      return 'FAILED';
    }
  }
}

function mark(storeId: string, id: string, values: { status: string; errorMessage: string }) {
  return withTenant(storeId, (tx) =>
    tx
      .update(notificationLogs)
      .set({ ...values, errorMessage: values.errorMessage.slice(0, 500), updatedAt: new Date() })
      .where(eq(notificationLogs.id, id)),
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function build(tx: Tx, row: LogRow): Promise<Built | null> {
  const type = row.notificationType as CollectionsLogType;
  if (type === 'CHARGE_DIGEST') return buildDigest(tx, row);
  if (!row.referenceId) return null;
  if (type === 'PAYMENT_RECEIPT') return buildReceipt(tx, row, row.referenceId);
  return buildCycleMail(tx, row, type, row.referenceId);
}

type Context = Omit<CollectionsMail, 'kind' | 'lines' | 'total'>;

async function contextFor(
  tx: Tx,
  row: LogRow,
  accountId: string,
): Promise<Context & { balance: string }> {
  const [found] = await tx
    .select({ store: stores, customer: customers, account: creditAccounts })
    .from(creditAccounts)
    .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
    .innerJoin(stores, eq(stores.id, creditAccounts.storeId))
    .where(eq(creditAccounts.id, accountId));
  if (!found) throw new Error('Cuenta no encontrada');
  const { store, customer, account } = found;
  return {
    to: row.recipientEmail,
    locale: row.locale as Locale,
    storeId: store.id,
    storeName: store.commercialName,
    storeContact: store.contactPhone ?? null,
    storeYape: store.yapeNumber ?? null,
    customerName: customer.firstName,
    currency: account.currency as Currency,
    balance: account.currentBalance,
  };
}

/** Productos de cada venta: `cantidad × nombre (subtotal)` (US11 crit. 2). */
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
    list.push({ name: r.name, quantity: trimQuantity(r.quantity), amount: r.subtotal });
    byId.set(r.saleId, list);
  }
  return byId;
}

const trimQuantity = (q: string) => q.replace(/\.?0+$/, '') || '0';

/** Líneas del ciclo; con `payableOnly` quedan solo las cobradas (sin compras anuladas). */
async function cycleLines(
  tx: Tx,
  cycle: typeof settlementCycles.$inferSelect,
  currency: Currency,
  payableOnly = false,
) {
  const ledger = await loadCycleLedger(tx, cycle, currency);
  if (!ledger.ok) throw new Error(`Ciclo inconsistente: ${ledger.error}`);
  const { settlement, charges } = ledger.value;
  const source = payableOnly ? payableLines(settlement) : settlement.lines;
  const items = await itemsOf(
    tx,
    charges.map((c) => c.saleId),
  );
  const lines: CollectionsMailLine[] = source.map((line): CollectionsMailLine => {
    if (line.kind === 'PURCHASE') {
      const charge = charges.find((c) => c.id === line.chargeId)!;
      return {
        kind: 'purchase',
        date: BusinessDate.toISO(line.date),
        items: items.get(charge.saleId) ?? [],
        days: line.days,
        interest: line.interest.toFixed2(),
        amount: line.amount.toFixed2(),
      };
    }
    if (line.kind === 'INSTALLMENT') {
      return {
        kind: 'installment',
        number: line.number,
        total: line.totalInstallments,
        amount: line.amount.toFixed2(),
      };
    }
    return { kind: 'void', amount: line.amount.toFixed2() };
  });
  return { lines, ledger: ledger.value };
}

async function buildCycleMail(
  tx: Tx,
  row: LogRow,
  type: Exclude<CollectionsLogType, 'CHARGE_DIGEST' | 'PAYMENT_RECEIPT'>,
  cycleId: string,
): Promise<Built | null> {
  const [cycle] = await tx.select().from(settlementCycles).where(eq(settlementCycles.id, cycleId));
  if (!cycle) return null;
  // Un aviso que ya no aplica no sale: ciclo pagado, recordatorio de un ciclo vencido, etc.
  const applies =
    type === 'CYCLE_STATEMENT'
      ? cycle.status === 'BILLED' || cycle.status === 'OVERDUE'
      : type === 'PAYMENT_REMINDER'
        ? cycle.status === 'BILLED'
        : cycle.status === 'OVERDUE';
  if (!applies) return null;

  const context = await contextFor(tx, row, cycle.creditAccountId);
  const { lines } =
    type === 'CYCLE_STATEMENT'
      ? await cycleLines(tx, cycle, context.currency)
      : { lines: [] as CollectionsMailLine[] };
  const rest = withoutBalance(context);
  return {
    mail: {
      ...rest,
      kind: KIND[type],
      lines,
      total: cycle.totalDue,
      cutOffDate: iso(cycle.cutOffDate),
      paymentDueDate: iso(cycle.paymentDueDate),
    },
    onSent:
      type === 'CYCLE_STATEMENT'
        ? async (t, sentAt) => {
            await t
              .update(settlementCycles)
              .set({ statementSentAt: sentAt })
              .where(eq(settlementCycles.id, cycle.id));
          }
        : undefined,
  };
}

async function buildReceipt(tx: Tx, row: LogRow, paymentId: string): Promise<Built | null> {
  const [payment] = await tx.select().from(debtPayments).where(eq(debtPayments.id, paymentId));
  if (!payment) return null;
  const [cycle] = await tx
    .select()
    .from(settlementCycles)
    .where(eq(settlementCycles.id, payment.settlementCycleId));
  if (!cycle) return null;
  const context = await contextFor(tx, row, payment.creditAccountId);
  const { lines: paid } = await cycleLines(tx, cycle, context.currency, true);
  if (Money.of(payment.moratoryInterestPaid, context.currency).isPositive()) {
    paid.push({ kind: 'moratory', days: payment.daysLate, amount: payment.moratoryInterestPaid });
  }
  const rest = withoutBalance(context);
  return {
    mail: {
      ...rest,
      kind: 'payment-receipt',
      lines: paid,
      total: payment.amountPaid,
      receiptNumber: payment.receiptNumber,
      paymentMethod: payment.paymentMethod as CollectionsMail['paymentMethod'],
      paidAt: iso(payment.paymentDate),
      cutOffDate: iso(cycle.cutOffDate),
      paymentDueDate: iso(cycle.paymentDueDate),
    },
  };
}

/** US11 crit. 2: cargos del vecino sin notificar, hasta el momento en que se encoló. */
async function buildDigest(tx: Tx, row: LogRow): Promise<Built | null> {
  if (!row.customerId) return null;
  const charges = await tx
    .select({ charge: creditCharges })
    .from(creditCharges)
    .innerJoin(creditAccounts, eq(creditAccounts.id, creditCharges.creditAccountId))
    .where(
      and(
        eq(creditAccounts.customerId, row.customerId),
        isNull(creditCharges.notifiedAt),
        ne(creditCharges.status, 'VOIDED'),
        lte(creditCharges.createdAt, row.createdAt),
      ),
    )
    .orderBy(asc(creditCharges.purchaseDate));
  if (charges.length === 0) return null;
  const accountId = charges[0]!.charge.creditAccountId;
  const context = await contextFor(tx, row, accountId);
  const items = await itemsOf(
    tx,
    charges.map((c) => c.charge.saleId),
  );
  const lines: CollectionsMailLine[] = charges.map(({ charge }) => ({
    kind: 'purchase',
    date: iso(charge.purchaseDate),
    time: limaTime(charge.purchaseDate),
    items: items.get(charge.saleId) ?? [],
    amount: charge.principalAmount,
  }));
  const total = Money.sum(
    charges.map((c) => Money.of(c.charge.principalAmount, context.currency)),
    context.currency,
  );
  const ids = charges.map((c) => c.charge.id);
  return {
    mail: { ...context, kind: 'charge-digest', lines, total: total.toFixed2() },
    // US11 crit. 4: las 48 h cuentan desde el envío real, nunca desde la compra
    onSent: async (t, sentAt) => {
      await t
        .update(creditCharges)
        .set({
          notifiedAt: sentAt,
          consentDeadline: new Date(sentAt.getTime() + CONSENT_WINDOW_MS),
          updatedAt: sentAt,
        })
        .where(and(inArray(creditCharges.id, ids), isNull(creditCharges.notifiedAt)));
    },
  };
}

/** El saldo solo va en el resumen diario. */
function withoutBalance<T extends { balance?: string }>(context: T): Omit<T, 'balance'> {
  const copy = { ...context };
  delete copy.balance;
  return copy;
}
