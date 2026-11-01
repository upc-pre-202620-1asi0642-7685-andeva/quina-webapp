import { cycleFor, type BillingCycle } from '@/core/domain/credit/billing-cycle';
import { CreditTerms } from '@/core/domain/credit/credit-terms';
import { planInstallments, type InstallmentPlan } from '@/core/domain/credit/installment-plan';
import type {
  CreditAccountStatus,
  CreditAccountTerms,
} from '@/core/domain/ports/credit-account-repository';
import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';
import {
  priceSale,
  type CartLine,
  type PricedSale,
  type SalePricingError,
  type SaleProduct,
} from './sale-pricing';

/** Cuenta del vecino tal como se lee, bloqueada, dentro de la transacción del fiado. */
export type CreditAccountSnapshot = {
  id: string;
  customerActive: boolean;
  status: CreditAccountStatus;
  terms: CreditAccountTerms;
  /** `deuda_actual`: capital sin pagar más intereses liquidados (US08). */
  currentBalance: string;
  /** ¿Tiene algún ciclo `OVERDUE`? (US08 crit. 8). */
  hasOverdueCycle: boolean;
};

/** Pago único al corte, o en cuotas (D3) si todos los productos lo admiten. */
export type CreditPlan = { mode: 'SINGLE' } | { mode: 'INSTALLMENTS'; count: number };

export type CreditSaleError =
  | SalePricingError
  | {
      code:
        | 'CUSTOMER_INACTIVE'
        | 'ACCOUNT_SUSPENDED'
        | 'ACCOUNT_BLOCKED'
        | 'ACCOUNT_OVERDUE'
        | 'USD_ACCOUNT'
        | 'INSTALLMENTS_NOT_ALLOWED'
        | 'INSTALLMENTS_OUT_OF_RANGE';
    }
  | { code: 'EXCEEDS_MAX_INSTALLMENT_MONTHS'; max: number }
  | { code: 'EXCEEDS_AVAILABLE'; excess: string; available: string };

export type CreditSettlement = {
  priced: PricedSale;
  /** Ciclo al que va el cargo según la fecha de corte (US08 crit. 7). */
  cycle: BillingCycle;
  /** `null` en pago único: el interés se calcula en el corte. */
  installments: InstallmentPlan | null;
  balanceAfter: Money;
  availableAfter: Money;
};

/** Crédito disponible del vecino: límite − deuda actual (US08). */
export function availableCredit(
  account: Pick<CreditAccountSnapshot, 'terms' | 'currentBalance'>,
): Money {
  const { currency, creditLimit } = account.terms;
  return Money.of(creditLimit, currency).minus(Money.of(account.currentBalance, currency));
}

/**
 * Venta al fiado con la cuenta y los productos ya bloqueados (D9, D3): primero
 * los bloqueos de la cuenta, luego precio de crédito y stock, las cuotas y por
 * último el límite. El límite consume el capital de la compra, sin intereses
 * futuros (decisión financiera 1).
 */
export function settleCreditSale(input: {
  cart: readonly CartLine[];
  products: readonly SaleProduct[];
  account: CreditAccountSnapshot;
  plan: CreditPlan;
  now: Date;
}): Result<CreditSettlement, CreditSaleError> {
  const { account, plan, now } = input;
  if (!input.account.customerActive) return err({ code: 'CUSTOMER_INACTIVE' });
  if (account.status === 'SUSPENDED') return err({ code: 'ACCOUNT_SUSPENDED' });
  if (account.status === 'BLOCKED') return err({ code: 'ACCOUNT_BLOCKED' });
  if (account.hasOverdueCycle) return err({ code: 'ACCOUNT_OVERDUE' });
  // D4: el catálogo está en soles y no hay tipo de cambio
  if (account.terms.currency !== 'PEN') return err({ code: 'USD_ACCOUNT' });

  const priced = priceSale(input.cart, input.products, 'CREDIT');
  if (!priced.ok) return priced;
  const { total } = priced.value;

  const terms = CreditTerms.of(account.terms);
  let installments: InstallmentPlan | null = null;
  if (plan.mode === 'INSTALLMENTS') {
    if (!priced.value.allowsInstallments) return err({ code: 'INSTALLMENTS_NOT_ALLOWED' });
    const schedule = planInstallments({
      principal: total,
      purchaseInstant: now,
      terms,
      installments: plan.count,
    });
    if (!schedule.ok) {
      if (schedule.error === 'EXCEEDS_MAX_INSTALLMENT_MONTHS') {
        return err({ code: 'EXCEEDS_MAX_INSTALLMENT_MONTHS', max: terms.maxInstallmentMonths });
      }
      return err({ code: 'INSTALLMENTS_OUT_OF_RANGE' });
    }
    installments = schedule.value;
  }

  const available = availableCredit(account);
  if (total.compare(available) > 0) {
    return err({
      code: 'EXCEEDS_AVAILABLE',
      excess: total.minus(available).toFixed2(),
      available: available.toFixed2(),
    });
  }

  return ok({
    priced: priced.value,
    cycle: installments?.cycle ?? cycleFor(now, terms),
    installments,
    balanceAfter: Money.of(account.currentBalance, 'PEN').plus(total),
    availableAfter: available.minus(total),
  });
}
