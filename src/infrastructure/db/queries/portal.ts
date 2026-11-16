import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { cycleFor } from '@/core/domain/credit/billing-cycle';
import { CreditLimit } from '@/core/domain/credit/credit-limit';
import type { PortalLink } from '@/core/domain/ports/portal-directory';
import { Money, type Currency } from '@/core/domain/shared/money';
import {
  creditAccounts,
  creditCharges,
  creditInstallments,
  customers,
  settlementCycles,
  stores,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';

export type PortalAccount = {
  storeId: string;
  storeName: string;
  /** Teléfono o WhatsApp de la tienda, para preguntar u observar por fuera. */
  storeContact: string | null;
  storeAddress: string | null;
  customerId: string;
  customerName: string;
  emailBouncedAt: Date | null;
  /** null: la tienda aún no le pactó condiciones de fiado. */
  account: {
    id: string;
    currency: Currency;
    balance: string;
    creditLimit: string;
    availableCredit: string;
    overLimit: boolean;
    usedPercent: number;
    status: string;
    cutOffDay: number;
    paymentDueDay: number;
    nextCutOffDate: Date;
    /** Ciclo más antiguo por pagar (D6 del Plan 4): lo que el vecino debe pagar primero. */
    payable: { cycleId: string; totalDue: string; paymentDueDate: Date; status: string } | null;
    /** Ciclo abierto en curso, para entrar en 1 toque cuando aún no hay deuda liquidada. */
    openCycle: { cycleId: string; amount: string; cutOffDate: Date } | null;
  } | null;
};

/** Cuentas del vecino en cada tienda donde está su correo (US14.6). */
export async function getPortalAccount(link: PortalLink, now: Date): Promise<PortalAccount | null> {
  return withTenant(link.storeId, async (tx) => {
    const [row] = await tx
      .select({ customer: customers, store: stores, account: creditAccounts })
      .from(customers)
      .innerJoin(stores, eq(stores.id, customers.storeId))
      .leftJoin(creditAccounts, eq(creditAccounts.customerId, customers.id))
      .where(eq(customers.id, link.customerId));
    if (!row) return null;
    const { customer, store, account } = row;

    let payable: NonNullable<PortalAccount['account']>['payable'] = null;
    let openCycle: NonNullable<PortalAccount['account']>['openCycle'] = null;
    if (account) {
      const currency = account.currency as Currency;
      const [[cycle], [latestOpen]] = await Promise.all([
        tx
          .select()
          .from(settlementCycles)
          .where(
            and(
              eq(settlementCycles.creditAccountId, account.id),
              inArray(settlementCycles.status, ['BILLED', 'OVERDUE']),
            ),
          )
          .orderBy(asc(settlementCycles.cutOffDate))
          .limit(1),
        tx
          .select()
          .from(settlementCycles)
          .where(
            and(
              eq(settlementCycles.creditAccountId, account.id),
              eq(settlementCycles.status, 'OPEN'),
            ),
          )
          .orderBy(desc(settlementCycles.cutOffDate))
          .limit(1),
      ]);
      if (cycle) {
        payable = {
          cycleId: cycle.id,
          totalDue: cycle.totalDue,
          paymentDueDate: cycle.paymentDueDate,
          status: cycle.status,
        };
      }
      if (latestOpen) {
        const charges = await tx
          .select({
            amount: creditCharges.principalAmount,
            modality: creditCharges.chargeModality,
            status: creditCharges.status,
          })
          .from(creditCharges)
          .where(eq(creditCharges.settlementCycleId, latestOpen.id));
        const openTotal = Money.sum(
          charges
            .filter((c) => c.modality === 'SINGLE_PAYMENT' && c.status !== 'VOIDED')
            .map((c) => Money.of(c.amount, currency)),
          currency,
        );
        openCycle = {
          cycleId: latestOpen.id,
          amount: openTotal.toFixed2(),
          cutOffDate: latestOpen.cutOffDate,
        };
      }
    }

    const currency = (account?.currency ?? 'PEN') as Currency;
    const usage = account
      ? CreditLimit.usage(account.currentBalance, account.creditLimit, currency)
      : null;

    return {
      storeId: store.id,
      storeName: store.commercialName,
      storeContact: store.contactPhone,
      storeAddress: store.address,
      customerId: customer.id,
      customerName: customer.firstName,
      emailBouncedAt: customer.emailBouncedAt,
      account:
        account && usage
          ? {
              id: account.id,
              currency,
              balance: account.currentBalance,
              creditLimit: account.creditLimit,
              availableCredit: usage.availableCredit,
              overLimit: usage.overLimit,
              usedPercent: usage.usedPercent,
              status: account.status,
              cutOffDay: account.cutOffDay,
              paymentDueDay: account.paymentDueDay,
              // La compra de hoy entra en este corte (US10 crit. 1)
              nextCutOffDate: cycleFor(now, account).cutOffInstant,
              payable,
              openCycle,
            }
          : null,
    };
  });
}

export type InstallmentRow = {
  number: number;
  total: number;
  dueDate: Date;
  installment: string;
  principal: string;
  interest: string;
  remainingBalance: string;
  status: string;
};

export type InstallmentPlan = {
  chargeId: string;
  purchaseDate: Date;
  principal: string;
  rows: InstallmentRow[];
};

/** Tabla francesa de cada compra en cuotas, con las pagadas y las por vencer (US14.7). */
export function getInstallmentPlans(
  storeId: string,
  accountId: string,
): Promise<InstallmentPlan[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({ installment: creditInstallments, charge: creditCharges })
      .from(creditInstallments)
      .innerJoin(creditCharges, eq(creditCharges.id, creditInstallments.creditChargeId))
      .where(eq(creditInstallments.creditAccountId, accountId))
      .orderBy(asc(creditCharges.purchaseDate), asc(creditInstallments.installmentNumber));
    const plans = new Map<string, InstallmentPlan>();
    for (const { installment, charge } of rows) {
      if (installment.status === 'VOIDED') continue;
      const plan = plans.get(charge.id) ?? {
        chargeId: charge.id,
        purchaseDate: charge.purchaseDate,
        principal: charge.principalAmount,
        rows: [],
      };
      plan.rows.push({
        number: installment.installmentNumber,
        total: installment.totalInstallments,
        dueDate: installment.dueDate,
        installment: installment.totalInstallmentAmount,
        principal: installment.principalAmount,
        interest: installment.compensatoryInterest,
        remainingBalance: installment.remainingBalance,
        status: installment.status,
      });
      plans.set(charge.id, plan);
    }
    return [...plans.values()];
  });
}
