import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, oneOf, tstz, updatedAt, uuidPk } from './columns';
import { stores, users } from './identity';

// 2. Clientes y condiciones de crédito (Core Domain).
// Los ciclos, cargos, cuotas y pagos viven en ledger.ts para que sales.ts pueda
// depender de customers sin crear un ciclo de importaciones.

const RATE_TYPES = ['EFFECTIVE', 'NOMINAL'] as const;
const PERIODS = ['ANNUAL', 'MONTHLY', 'DAILY'] as const;

export const customers = pgTable(
  'customers',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    documentType: varchar('document_type', { length: 10 }).notNull(),
    documentNumber: varchar('document_number', { length: 15 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 150 }).notNull(),
    emailBouncedAt: tstz('email_bounced_at'),
    preferredLocale: varchar('preferred_locale', { length: 2 }),
    address: text('address'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('uq_customers_store_document').on(t.storeId, t.documentType, t.documentNumber),
    check('chk_customers_document_type', oneOf(t.documentType, ['DNI', 'CE', 'PASAPORTE'])),
    check('chk_customers_preferred_locale', oneOf(t.preferredLocale, ['es', 'en', 'qu'])),
    check(
      'chk_customers_dni',
      sql`${t.documentType} <> 'DNI' OR ${t.documentNumber} ~ '^[0-9]{8}$'`,
    ),
    index('idx_customers_store_active').on(t.storeId, t.isActive),
    index('idx_customers_user')
      .on(t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
  ],
);

export const customerConsents = pgTable(
  'customer_consents',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    consentType: varchar('consent_type', { length: 50 }).notNull(),
    policyVersion: varchar('policy_version', { length: 20 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent').notNull(),
    acceptedAt: tstz('accepted_at').notNull().defaultNow(),
    evidenceText: text('evidence_text').notNull(),
  },
  (t) => [
    check(
      'chk_customer_consents_consent_type',
      oneOf(t.consentType, ['DATA_PROTECTION_LAW_29733', 'CREDIT_TERMS']),
    ),
  ],
);

export const creditAccounts = pgTable(
  'credit_accounts',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .unique()
      .references(() => customers.id, { onDelete: 'restrict' }),
    currency: varchar('currency', { length: 3 }).notNull().default('PEN'),
    creditLimit: money('credit_limit').notNull(),
    currentBalance: money('current_balance').notNull().default('0.00'),
    compensatoryRateType: varchar('compensatory_rate_type', { length: 10 }).notNull(),
    compensatoryRateValue: numeric('compensatory_rate_value', { precision: 7, scale: 4 }).notNull(),
    compensatoryPeriod: varchar('compensatory_period', { length: 10 }).notNull().default('MONTHLY'),
    compensatoryCapitalization: varchar('compensatory_capitalization', { length: 10 }),
    moratoryRateType: varchar('moratory_rate_type', { length: 10 }).notNull(),
    moratoryRateValue: numeric('moratory_rate_value', { precision: 7, scale: 4 }).notNull(),
    moratoryPeriod: varchar('moratory_period', { length: 10 }).notNull().default('DAILY'),
    moratoryCapitalization: varchar('moratory_capitalization', { length: 10 }),
    maxInstallmentMonths: smallint('max_installment_months').notNull().default(6),
    cutOffDay: smallint('cut_off_day').notNull(),
    paymentDueDay: smallint('payment_due_day').notNull(),
    internalCreditScore: smallint('internal_credit_score').notNull().default(100),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('chk_credit_accounts_currency', oneOf(t.currency, ['PEN', 'USD'])),
    check('chk_credit_accounts_credit_limit', sql`${t.creditLimit} > 0`),
    check('chk_credit_accounts_current_balance', sql`${t.currentBalance} >= 0`),
    check('chk_credit_accounts_compensatory_rate_type', oneOf(t.compensatoryRateType, RATE_TYPES)),
    check('chk_credit_accounts_compensatory_rate_value', sql`${t.compensatoryRateValue} >= 0`),
    check('chk_credit_accounts_compensatory_period', oneOf(t.compensatoryPeriod, PERIODS)),
    check(
      'chk_credit_accounts_compensatory_capitalization_value',
      oneOf(t.compensatoryCapitalization, PERIODS),
    ),
    check('chk_credit_accounts_moratory_rate_type', oneOf(t.moratoryRateType, RATE_TYPES)),
    check('chk_credit_accounts_moratory_rate_value', sql`${t.moratoryRateValue} >= 0`),
    check('chk_credit_accounts_moratory_period', oneOf(t.moratoryPeriod, PERIODS)),
    check(
      'chk_credit_accounts_moratory_capitalization_value',
      oneOf(t.moratoryCapitalization, PERIODS),
    ),
    check(
      'chk_credit_accounts_max_installment_months',
      sql`${t.maxInstallmentMonths} BETWEEN 1 AND 24`,
    ),
    check('chk_credit_accounts_cut_off_day', sql`${t.cutOffDay} BETWEEN 1 AND 28`),
    check('chk_credit_accounts_payment_due_day', sql`${t.paymentDueDay} BETWEEN 1 AND 28`),
    check(
      'chk_credit_accounts_internal_credit_score',
      sql`${t.internalCreditScore} BETWEEN 0 AND 100`,
    ),
    check('chk_credit_accounts_status', oneOf(t.status, ['ACTIVE', 'SUSPENDED', 'BLOCKED'])),
    check(
      'chk_credit_compensatory_capitalization',
      sql`(${t.compensatoryRateType} = 'NOMINAL') = (${t.compensatoryCapitalization} IS NOT NULL)`,
    ),
    check(
      'chk_credit_moratory_capitalization',
      sql`(${t.moratoryRateType} = 'NOMINAL') = (${t.moratoryCapitalization} IS NOT NULL)`,
    ),
    index('idx_credit_accounts_store_status').on(t.storeId, t.status),
  ],
);

// De plataforma: topes de tasas del BCRP
export const creditRateCaps = pgTable(
  'credit_rate_caps',
  {
    id: uuidPk(),
    rateKind: varchar('rate_kind', { length: 15 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    maxEffectiveAnnualRate: numeric('max_effective_annual_rate', {
      precision: 7,
      scale: 4,
    }).notNull(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    sourceReference: text('source_reference').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('uq_rate_caps_period').on(t.rateKind, t.currency, t.validFrom),
    check('chk_credit_rate_caps_rate_kind', oneOf(t.rateKind, ['COMPENSATORY', 'MORATORY'])),
    check('chk_credit_rate_caps_currency', oneOf(t.currency, ['PEN', 'USD'])),
    check('chk_credit_rate_caps_max_rate', sql`${t.maxEffectiveAnnualRate} > 0`),
  ],
);
