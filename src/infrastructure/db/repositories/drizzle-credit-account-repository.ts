import { and, count, eq, inArray, ne } from 'drizzle-orm';
import type { RateCap, RateKind } from '@/core/domain/credit/rate-cap';
import type { RateInput, RatePeriod, RateType } from '@/core/domain/finance/rate';
import type {
  CreditAccountRepository,
  CreditAccountTerms,
  OpenAccountGuard,
  SaveTermsData,
  SaveTermsResult,
  SetAccountStatusData,
} from '@/core/domain/ports/credit-account-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import type { Database } from '../connection';
import { db } from '../connection';
import {
  auditLogs,
  creditAccounts,
  creditCharges,
  creditInstallments,
  creditRateCaps,
  customerConsents,
  customers,
  settlementCycles,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';
import { selectSubscription } from './drizzle-subscription-repository';

function termColumns(terms: CreditAccountTerms) {
  return {
    currency: terms.currency,
    creditLimit: terms.creditLimit,
    compensatoryRateType: terms.compensatory.type,
    compensatoryRateValue: terms.compensatory.value,
    compensatoryPeriod: terms.compensatory.period,
    compensatoryCapitalization: terms.compensatory.capitalization,
    moratoryRateType: terms.moratory.type,
    moratoryRateValue: terms.moratory.value,
    moratoryPeriod: terms.moratory.period,
    moratoryCapitalization: terms.moratory.capitalization,
    cutOffDay: terms.cutOffDay,
    paymentDueDay: terms.paymentDueDay,
    maxInstallmentMonths: terms.maxInstallmentMonths,
  };
}

/** Cuenta tal como sale de la base, para leerla de vuelta como condiciones. */
export function termsFromRow(row: typeof creditAccounts.$inferSelect): CreditAccountTerms {
  const rate = (
    type: string,
    value: string,
    period: string,
    capitalization: string | null,
  ): RateInput => ({
    type: type as RateType,
    value,
    period: period as RatePeriod,
    capitalization: capitalization as RatePeriod | null,
  });
  return {
    currency: row.currency as Currency,
    creditLimit: row.creditLimit,
    compensatory: rate(
      row.compensatoryRateType,
      row.compensatoryRateValue,
      row.compensatoryPeriod,
      row.compensatoryCapitalization,
    ),
    moratory: rate(
      row.moratoryRateType,
      row.moratoryRateValue,
      row.moratoryPeriod,
      row.moratoryCapitalization,
    ),
    cutOffDay: row.cutOffDay,
    paymentDueDay: row.paymentDueDay,
    maxInstallmentMonths: row.maxInstallmentMonths,
  };
}

/**
 * Bloquea la suscripción (FOR UPDATE) y cuenta las cuentas activas: dos
 * aperturas a la vez no pueden pasar ambas el límite del plan (US26 crit. 8).
 */
async function hasRoomForActive(tx: Tx, storeId: string, canOpen: OpenAccountGuard) {
  const current = await selectSubscription(tx, storeId, { forUpdate: true });
  if (!current) return false;
  const [active] = await tx
    .select({ total: count() })
    .from(creditAccounts)
    .where(and(eq(creditAccounts.storeId, storeId), eq(creditAccounts.status, 'ACTIVE')));
  return canOpen(current, active?.total ?? 0);
}

/**
 * P7: los ciclos ya creados guardan sus fechas; mover los días mientras haya
 * un ciclo abierto con compras, uno sin pagar o cuotas por vencer los desalinearía.
 */
async function cyclesPending(tx: Tx, accountId: string): Promise<boolean> {
  const [unpaid] = await tx
    .select({ id: settlementCycles.id })
    .from(settlementCycles)
    .where(
      and(
        eq(settlementCycles.creditAccountId, accountId),
        inArray(settlementCycles.status, ['BILLED', 'OVERDUE']),
      ),
    )
    .limit(1);
  if (unpaid) return true;
  const [openCharge] = await tx
    .select({ id: creditCharges.id })
    .from(creditCharges)
    .innerJoin(settlementCycles, eq(settlementCycles.id, creditCharges.settlementCycleId))
    .where(
      and(
        eq(creditCharges.creditAccountId, accountId),
        eq(settlementCycles.status, 'OPEN'),
        ne(creditCharges.status, 'VOIDED'),
      ),
    )
    .limit(1);
  if (openCharge) return true;
  const [installment] = await tx
    .select({ id: creditInstallments.id })
    .from(creditInstallments)
    .where(
      and(
        eq(creditInstallments.creditAccountId, accountId),
        inArray(creditInstallments.status, ['PENDING', 'OVERDUE']),
      ),
    )
    .limit(1);
  return Boolean(installment);
}

export class DrizzleCreditAccountRepository implements CreditAccountRepository {
  constructor(private readonly database: Database = db) {}

  async rateCaps(): Promise<RateCap[]> {
    // Tabla de plataforma sin RLS: quina_app la lee sin contexto de tienda
    const rows = await this.database.select().from(creditRateCaps);
    return rows.map((row) => ({
      kind: row.rateKind as RateKind,
      currency: row.currency as Currency,
      maxEffectiveAnnualRate: row.maxEffectiveAnnualRate,
      validFrom: BusinessDate.parse(row.validFrom),
      validTo: row.validTo ? BusinessDate.parse(row.validTo) : null,
    }));
  }

  async saveTerms(data: SaveTermsData): Promise<SaveTermsResult> {
    return withTenant(
      data.storeId,
      async (tx) => {
        const [customer] = await tx
          .select({ isActive: customers.isActive })
          .from(customers)
          .where(and(eq(customers.id, data.customerId), eq(customers.storeId, data.storeId)))
          .for('update');
        if (!customer) return 'NOT_FOUND';
        if (!customer.isActive) return 'CUSTOMER_INACTIVE';

        const [existing] = await tx
          .select()
          .from(creditAccounts)
          .where(eq(creditAccounts.customerId, data.customerId))
          .for('update');
        const next = termColumns(data.terms);

        let result: 'OPENED' | 'UPDATED';
        let accountId: string;
        if (existing) {
          const owes = !Money.of(existing.currentBalance, existing.currency as Currency).isZero();
          if (owes && existing.currency !== data.terms.currency) return 'CURRENCY_LOCKED';
          const daysChanged =
            existing.cutOffDay !== data.terms.cutOffDay ||
            existing.paymentDueDay !== data.terms.paymentDueDay;
          if (daysChanged && (await cyclesPending(tx, existing.id))) return 'DAYS_LOCKED';
          // US06 crit. 6: los cargos guardan su copia; cambiar aquí solo afecta compras futuras
          await tx
            .update(creditAccounts)
            .set({ ...next, updatedAt: data.now })
            .where(eq(creditAccounts.id, existing.id));
          await tx.insert(auditLogs).values({
            storeId: data.storeId,
            userId: data.actorId,
            action: 'UPDATE_CREDIT_TERMS',
            entityName: 'credit_accounts',
            entityId: existing.id,
            oldData: termsFromRow(existing),
            newData: data.terms,
            ipAddress: data.consent.ip.slice(0, 45),
            userAgent: data.consent.userAgent,
          });
          result = 'UPDATED';
          accountId = existing.id;
        } else {
          if (!(await hasRoomForActive(tx, data.storeId, data.canOpen))) {
            return 'PLAN_LIMIT_REACHED';
          }
          const [created] = await tx
            .insert(creditAccounts)
            .values({ storeId: data.storeId, customerId: data.customerId, ...next })
            .returning({ id: creditAccounts.id });
          accountId = created!.id;
          await tx.insert(auditLogs).values({
            storeId: data.storeId,
            userId: data.actorId,
            action: 'OPEN_CREDIT_ACCOUNT',
            entityName: 'credit_accounts',
            entityId: accountId,
            newData: data.terms,
            ipAddress: data.consent.ip.slice(0, 45),
            userAgent: data.consent.userAgent,
          });
          result = 'OPENED';
        }

        await tx.insert(customerConsents).values({
          storeId: data.storeId,
          customerId: data.customerId,
          consentType: data.consent.type,
          policyVersion: data.consent.version,
          ipAddress: data.consent.ip.slice(0, 45),
          userAgent: data.consent.userAgent,
          acceptedAt: data.now,
          evidenceText: data.consent.text,
        });
        return result;
      },
      this.database,
    );
  }

  async setStatus(data: SetAccountStatusData): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'> {
    return withTenant(
      data.storeId,
      async (tx) => {
        const [account] = await tx
          .select({ id: creditAccounts.id, status: creditAccounts.status })
          .from(creditAccounts)
          .where(
            and(
              eq(creditAccounts.customerId, data.customerId),
              eq(creditAccounts.storeId, data.storeId),
            ),
          )
          .for('update');
        if (!account) return 'NOT_FOUND';
        if (account.status === data.status) return 'OK';
        if (data.status === 'ACTIVE' && !(await hasRoomForActive(tx, data.storeId, data.canOpen))) {
          return 'PLAN_LIMIT_REACHED';
        }
        await tx
          .update(creditAccounts)
          .set({ status: data.status, updatedAt: data.now })
          .where(eq(creditAccounts.id, account.id));
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'SET_CREDIT_ACCOUNT_STATUS',
          entityName: 'credit_accounts',
          entityId: account.id,
          oldData: { status: account.status },
          newData: { status: data.status },
        });
        return 'OK';
      },
      this.database,
    );
  }
}
