import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { capitalReleases } from '@/core/domain/credit/account-balance';
import type { BillingCycle } from '@/core/domain/credit/billing-cycle';
import {
  settleCycle,
  type CycleSettlement,
  type DueInstallmentInput,
  type SettlementError,
  type SingleChargeInput,
} from '@/core/domain/credit/cycle-settlement';
import { Rate, type RateInput, type RatePeriod, type RateType } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import type { Result } from '@/core/domain/shared/result';
import { creditCharges, creditInstallments, settlementCycles } from '../schema';
import type { Tx } from '../with-tenant';

export type CycleRow = typeof settlementCycles.$inferSelect;
type ChargeRow = typeof creditCharges.$inferSelect;

/** Tasa congelada en un cargo; las columnas ya pasaron sus CHECK al guardarse. */
export function rateFromColumns(
  type: string,
  value: string,
  period: string,
  capitalization: string | null,
): Rate {
  const input: RateInput = {
    type: type as RateType,
    value,
    period: period as RatePeriod,
    capitalization: capitalization as RatePeriod | null,
  };
  const parsed = Rate.parse(input);
  if (!parsed.ok) throw new Error(`Tasa guardada inválida: ${parsed.error}`);
  return parsed.value;
}

const compensatoryOf = (c: ChargeRow) =>
  rateFromColumns(
    c.compensatoryRateType,
    c.compensatoryRateValue,
    c.compensatoryPeriod,
    c.compensatoryCapitalization,
  );

const moratoryOf = (
  c: Pick<
    ChargeRow,
    'moratoryRateType' | 'moratoryRateValue' | 'moratoryPeriod' | 'moratoryCapitalization'
  >,
) =>
  rateFromColumns(
    c.moratoryRateType,
    c.moratoryRateValue,
    c.moratoryPeriod,
    c.moratoryCapitalization,
  );

/**
 * El ciclo tal como se guardó (sus fechas no dependen de las condiciones de
 * hoy, que pudieron cambiar después de que se abrió).
 */
export function billingCycleFromRow(row: CycleRow): BillingCycle {
  const cutOffDate = BusinessDate.fromInstant(row.cutOffDate);
  const paymentDueDate = BusinessDate.fromInstant(row.paymentDueDate);
  return Object.freeze({
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    previousCutOffDate: BusinessDate.addMonths(cutOffDate, -1),
    cutOffDate,
    paymentDueDate,
    cutOffInstant: row.cutOffDate,
    paymentDueInstant: row.paymentDueDate,
  });
}

/** Cuota del ciclo con lo que hace falta para el saldo y la mora. */
type LedgerInstallment = DueInstallmentInput & {
  chargeId: string;
  moratoryRate: Rate;
  status: string;
};

export type CycleLedger = {
  cycle: BillingCycle;
  currency: Currency;
  charges: ChargeRow[];
  installments: LedgerInstallment[];
  settlement: CycleSettlement;
  /** Tasa moratoria congelada de cada línea (`charge:<id>` o `installment:<id>`). */
  moratoryRateOf: (lineId: string) => Rate;
  /** Capital original que libera cada cuota del ciclo (D3). */
  releaseOf: (installmentId: string) => Money;
};

/**
 * Lee y liquida un ciclo: sus cargos de pago único (los anulados entran como
 * anulación, P2) y las cuotas que vencen en su fecha de pago (por día de Lima,
 * D2b). El mismo cálculo sirve en el corte, en el cobro y en los correos, así
 * nunca se desalinean.
 */
export async function loadCycleLedger(
  tx: Tx,
  row: CycleRow,
  currency: Currency,
): Promise<Result<CycleLedger, SettlementError>> {
  const cycle = billingCycleFromRow(row);
  const charges = await tx
    .select()
    .from(creditCharges)
    .where(
      and(
        eq(creditCharges.settlementCycleId, row.id),
        eq(creditCharges.chargeModality, 'SINGLE_PAYMENT'),
      ),
    )
    .orderBy(asc(creditCharges.purchaseDate));

  const installmentRows = await tx
    .select({ installment: creditInstallments, charge: creditCharges })
    .from(creditInstallments)
    .innerJoin(creditCharges, eq(creditCharges.id, creditInstallments.creditChargeId))
    .where(
      and(
        eq(creditInstallments.creditAccountId, row.creditAccountId),
        ne(creditInstallments.status, 'VOIDED'),
        gte(creditInstallments.dueDate, BusinessDate.startInstant(cycle.paymentDueDate)),
        lte(creditInstallments.dueDate, BusinessDate.endInstant(cycle.paymentDueDate)),
      ),
    )
    .orderBy(asc(creditCharges.purchaseDate), asc(creditInstallments.installmentNumber));

  const money = (value: string) => Money.of(value, currency);
  const singleCharges: SingleChargeInput[] = charges.map((c) => ({
    id: c.id,
    principal: money(c.principalAmount),
    purchaseInstant: c.purchaseDate,
    compensatoryRate: compensatoryOf(c),
  }));
  const installments: LedgerInstallment[] = installmentRows.map(({ installment, charge }) => ({
    id: installment.id,
    chargeId: charge.id,
    number: installment.installmentNumber,
    totalInstallments: installment.totalInstallments,
    dueDate: cycle.paymentDueDate,
    principal: money(installment.principalAmount),
    interest: money(installment.compensatoryInterest),
    moratoryRate: moratoryOf(charge),
    status: installment.status,
  }));

  const settled = settleCycle({
    cycle,
    currency,
    singleCharges,
    dueInstallments: installments,
    voids: charges.filter((c) => c.status === 'VOIDED').map((c) => ({ chargeId: c.id })),
  });
  if (!settled.ok) return settled;

  const releases = await releasesFor(tx, installmentRows, currency);
  const rates = new Map<string, Rate>([
    ...charges.map((c) => [`charge:${c.id}`, moratoryOf(c)] as const),
    ...installments.map((i) => [`installment:${i.id}`, i.moratoryRate] as const),
  ]);

  return {
    ok: true,
    value: {
      cycle,
      currency,
      charges,
      installments,
      settlement: settled.value,
      moratoryRateOf: (lineId) => {
        const rate = rates.get(lineId);
        if (!rate) throw new Error(`Línea sin tasa moratoria: ${lineId}`);
        return rate;
      },
      releaseOf: (installmentId) => releases.get(installmentId) ?? Money.zero(currency),
    },
  };
}

/** Capital liberado de cada cuota, recalculado desde todas las filas de su cargo (D3b). */
async function releasesFor(
  tx: Tx,
  rows: { installment: typeof creditInstallments.$inferSelect; charge: ChargeRow }[],
  currency: Currency,
): Promise<Map<string, Money>> {
  const chargeIds = [...new Set(rows.map((r) => r.charge.id))];
  if (chargeIds.length === 0) return new Map();
  const all = await tx
    .select()
    .from(creditInstallments)
    .where(inArray(creditInstallments.creditChargeId, chargeIds))
    .orderBy(asc(creditInstallments.creditChargeId), asc(creditInstallments.installmentNumber));

  const result = new Map<string, Money>();
  const done = new Set<string>();
  for (const { charge } of rows) {
    if (done.has(charge.id)) continue;
    done.add(charge.id);
    const schedule = all.filter((i) => i.creditChargeId === charge.id);
    const shares = capitalReleases(
      Money.of(charge.principalAmount, currency),
      Money.of(charge.capitalizedAmount ?? charge.principalAmount, currency),
      schedule.map((i) => Money.of(i.principalAmount, currency)),
    );
    schedule.forEach((i, index) => result.set(i.id, shares[index]!));
  }
  return result;
}
