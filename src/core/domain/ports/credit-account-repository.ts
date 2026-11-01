import type { Subscription } from '../billing/plan-limits';
import type { ConsentRecord } from '../credit/customer-consent';
import type { RateCap } from '../credit/rate-cap';
import type { RateInput } from '../finance/rate';
import type { Currency } from '../shared/money';

/** Condiciones tal como se guardan en `credit_accounts` (US06). */
export type CreditAccountTerms = {
  currency: Currency;
  creditLimit: string;
  compensatory: RateInput;
  moratory: RateInput;
  cutOffDay: number;
  paymentDueDay: number;
  maxInstallmentMonths: number;
};

export type CreditAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';

/**
 * Decide, con la suscripción bloqueada, si cabe una cuenta activa más (US26).
 * El repositorio la llama dentro de la transacción para evitar carreras.
 */
export type OpenAccountGuard = (subscription: Subscription, activeAccounts: number) => boolean;

export type SaveTermsData = {
  storeId: string;
  actorId: string;
  customerId: string;
  terms: CreditAccountTerms;
  consent: ConsentRecord;
  canOpen: OpenAccountGuard;
  now: Date;
};

export type SaveTermsResult =
  | 'OPENED'
  | 'UPDATED'
  | 'NOT_FOUND'
  | 'CUSTOMER_INACTIVE'
  | 'PLAN_LIMIT_REACHED'
  | 'CURRENCY_LOCKED'
  // Plan 4, P7: con un ciclo abierto con compras o uno sin pagar no cambian los días
  | 'DAYS_LOCKED';

export type SetAccountStatusData = {
  storeId: string;
  actorId: string;
  customerId: string;
  status: Exclude<CreditAccountStatus, 'BLOCKED'>;
  canOpen: OpenAccountGuard;
  now: Date;
};

export interface CreditAccountRepository {
  /** Topes del BCRP (`credit_rate_caps`), de todas las vigencias. */
  rateCaps(): Promise<RateCap[]>;
  /** Abre la cuenta o cambia sus condiciones; inserta el consentimiento y la auditoría. */
  saveTerms(data: SaveTermsData): Promise<SaveTermsResult>;
  setStatus(data: SetAccountStatusData): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'>;
}
