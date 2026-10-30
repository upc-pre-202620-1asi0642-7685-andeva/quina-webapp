import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, oneOf, tstz, updatedAt, uuidPk } from './columns';
import { creditAccounts } from './credit';
import { stores, users } from './identity';
import { sales } from './sales';

// 5. Ciclos, cargos, cuotas y pagos (Core Domain).

const RATE_TYPES = ['EFFECTIVE', 'NOMINAL'] as const;
const PERIODS = ['ANNUAL', 'MONTHLY', 'DAILY'] as const;

export const settlementCycles = pgTable(
  'settlement_cycles',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    creditAccountId: uuid('credit_account_id')
      .notNull()
      .references(() => creditAccounts.id, { onDelete: 'restrict' }),
    cycleNumber: integer('cycle_number').notNull(),
    periodMonth: smallint('period_month').notNull(),
    periodYear: smallint('period_year').notNull(),
    cutOffDate: tstz('cut_off_date').notNull(),
    paymentDueDate: tstz('payment_due_date').notNull(),
    openingBalance: money('opening_balance').notNull().default('0.00'),
    purchasesTotal: money('purchases_total').notNull().default('0.00'),
    installmentsTotal: money('installments_total').notNull().default('0.00'),
    compensatoryInterestTotal: money('compensatory_interest_total').notNull().default('0.00'),
    moratoryInterestTotal: money('moratory_interest_total').notNull().default('0.00'),
    adjustmentsTotal: money('adjustments_total').notNull().default('0.00'),
    totalDue: money('total_due').notNull().default('0.00'),
    amountPaid: money('amount_paid').notNull().default('0.00'),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    statementSentAt: tstz('statement_sent_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('uq_cycles_account_number').on(t.creditAccountId, t.cycleNumber),
    unique('uq_cycles_account_period').on(t.creditAccountId, t.periodYear, t.periodMonth),
    check('chk_settlement_cycles_cycle_number', sql`${t.cycleNumber} > 0`),
    check('chk_settlement_cycles_period_month', sql`${t.periodMonth} BETWEEN 1 AND 12`),
    check('chk_settlement_cycles_period_year', sql`${t.periodYear} >= 2024`),
    check('chk_settlement_cycles_adjustments_total', sql`${t.adjustmentsTotal} >= 0`),
    check('chk_settlement_cycles_status', oneOf(t.status, ['OPEN', 'BILLED', 'PAID', 'OVERDUE'])),
    check('chk_cycles_dates', sql`${t.paymentDueDate} > ${t.cutOffDate}`),
    index('idx_settlement_account_cycle').on(t.creditAccountId, t.cycleNumber.desc().nullsFirst()),
    index('idx_settlement_store_status_due').on(t.storeId, t.status, t.paymentDueDate),
  ],
);

export const creditCharges = pgTable(
  'credit_charges',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    creditAccountId: uuid('credit_account_id')
      .notNull()
      .references(() => creditAccounts.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .unique()
      .references(() => sales.id, { onDelete: 'restrict' }),
    settlementCycleId: uuid('settlement_cycle_id')
      .notNull()
      .references(() => settlementCycles.id, { onDelete: 'restrict' }),
    chargeModality: varchar('charge_modality', { length: 20 }).notNull(),
    purchaseDate: tstz('purchase_date').notNull(),
    principalAmount: money('principal_amount').notNull(),
    installmentsCount: smallint('installments_count'),
    graceDays: smallint('grace_days'),
    capitalizedAmount: money('capitalized_amount'),
    compensatoryRateType: varchar('compensatory_rate_type', { length: 10 }).notNull(),
    compensatoryRateValue: numeric('compensatory_rate_value', { precision: 7, scale: 4 }).notNull(),
    compensatoryPeriod: varchar('compensatory_period', { length: 10 }).notNull(),
    compensatoryCapitalization: varchar('compensatory_capitalization', { length: 10 }),
    moratoryRateType: varchar('moratory_rate_type', { length: 10 }).notNull(),
    moratoryRateValue: numeric('moratory_rate_value', { precision: 7, scale: 4 }).notNull(),
    moratoryPeriod: varchar('moratory_period', { length: 10 }).notNull(),
    moratoryCapitalization: varchar('moratory_capitalization', { length: 10 }),
    compensatoryInterest: money('compensatory_interest'),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    consentStatus: varchar('consent_status', { length: 20 }).notNull().default('PENDING'),
    consentDeadline: tstz('consent_deadline'),
    notifiedAt: tstz('notified_at'),
    objectedAt: tstz('objected_at'),
    objectionNote: text('objection_note'),
    resolvedAt: tstz('resolved_at'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    resolutionNote: text('resolution_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'chk_credit_charges_charge_modality',
      oneOf(t.chargeModality, ['SINGLE_PAYMENT', 'INSTALLMENTS']),
    ),
    check('chk_credit_charges_principal_amount', sql`${t.principalAmount} > 0`),
    check('chk_credit_charges_installments_count', sql`${t.installmentsCount} BETWEEN 1 AND 24`),
    check('chk_credit_charges_grace_days', sql`${t.graceDays} >= 0`),
    check('chk_credit_charges_compensatory_rate_type', oneOf(t.compensatoryRateType, RATE_TYPES)),
    check('chk_credit_charges_compensatory_rate_value', sql`${t.compensatoryRateValue} >= 0`),
    check('chk_credit_charges_compensatory_period', oneOf(t.compensatoryPeriod, PERIODS)),
    check(
      'chk_credit_charges_compensatory_capitalization',
      oneOf(t.compensatoryCapitalization, PERIODS),
    ),
    check('chk_credit_charges_moratory_rate_type', oneOf(t.moratoryRateType, RATE_TYPES)),
    check('chk_credit_charges_moratory_rate_value', sql`${t.moratoryRateValue} >= 0`),
    check('chk_credit_charges_moratory_period', oneOf(t.moratoryPeriod, PERIODS)),
    check('chk_credit_charges_moratory_capitalization', oneOf(t.moratoryCapitalization, PERIODS)),
    check('chk_credit_charges_compensatory_interest', sql`${t.compensatoryInterest} >= 0`),
    check('chk_credit_charges_status', oneOf(t.status, ['PENDING', 'BILLED', 'PAID', 'VOIDED'])),
    check(
      'chk_credit_charges_consent_status',
      oneOf(t.consentStatus, ['PENDING', 'ACCEPTED', 'OBJECTED']),
    ),
    check(
      'chk_charges_installments',
      sql`(${t.chargeModality} = 'INSTALLMENTS'
          AND ${t.installmentsCount} IS NOT NULL AND ${t.graceDays} IS NOT NULL AND ${t.capitalizedAmount} IS NOT NULL)
        OR (${t.chargeModality} = 'SINGLE_PAYMENT'
          AND ${t.installmentsCount} IS NULL AND ${t.graceDays} IS NULL AND ${t.capitalizedAmount} IS NULL)`,
    ),
    check(
      'chk_charges_objection',
      sql`${t.consentStatus} <> 'OBJECTED' OR ${t.objectedAt} IS NOT NULL`,
    ),
    index('idx_charges_account_date').on(t.creditAccountId, t.purchaseDate.desc().nullsFirst()),
    index('idx_charges_cycle').on(t.settlementCycleId),
    index('idx_charges_pending_digest')
      .on(t.storeId, t.createdAt)
      .where(sql`${t.notifiedAt} IS NULL`),
    index('idx_charges_consent_pending')
      .on(t.consentDeadline)
      .where(sql`${t.consentStatus} = 'PENDING'`),
  ],
);

export const creditInstallments = pgTable(
  'credit_installments',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    creditChargeId: uuid('credit_charge_id')
      .notNull()
      .references(() => creditCharges.id, { onDelete: 'restrict' }),
    creditAccountId: uuid('credit_account_id')
      .notNull()
      .references(() => creditAccounts.id, { onDelete: 'restrict' }),
    installmentNumber: smallint('installment_number').notNull(),
    totalInstallments: smallint('total_installments').notNull(),
    dueDate: tstz('due_date').notNull(),
    initialBalance: money('initial_balance').notNull(),
    principalAmount: money('principal_amount').notNull(),
    compensatoryInterest: money('compensatory_interest').notNull(),
    totalInstallmentAmount: money('total_installment_amount').notNull(),
    remainingBalance: money('remaining_balance').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    paidAt: tstz('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('uq_installments_charge_number').on(t.creditChargeId, t.installmentNumber),
    check('chk_credit_installments_installment_number', sql`${t.installmentNumber} > 0`),
    check(
      'chk_credit_installments_total_installments',
      sql`${t.totalInstallments} >= ${t.installmentNumber}`,
    ),
    check(
      'chk_credit_installments_status',
      oneOf(t.status, ['PENDING', 'PAID', 'OVERDUE', 'VOIDED']),
    ),
    index('idx_installments_account_due')
      .on(t.creditAccountId, t.dueDate)
      .where(sql`${t.status} = 'PENDING'`),
  ],
);

export const debtPayments = pgTable(
  'debt_payments',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    creditAccountId: uuid('credit_account_id')
      .notNull()
      .references(() => creditAccounts.id, { onDelete: 'restrict' }),
    settlementCycleId: uuid('settlement_cycle_id')
      .notNull()
      .references(() => settlementCycles.id, { onDelete: 'restrict' }),
    userIdCollector: uuid('user_id_collector')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
    amountPaid: money('amount_paid').notNull(),
    compensatoryInterestPaid: money('compensatory_interest_paid').notNull().default('0.00'),
    moratoryInterestPaid: money('moratory_interest_paid').notNull().default('0.00'),
    principalPaid: money('principal_paid').notNull(),
    daysLate: smallint('days_late').notNull().default(0),
    paymentDate: tstz('payment_date').notNull().defaultNow(),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('uq_payments_store_receipt').on(t.storeId, t.receiptNumber),
    check(
      'chk_debt_payments_payment_method',
      oneOf(t.paymentMethod, ['CASH', 'YAPE', 'PLIN', 'TRANSFER']),
    ),
    check('chk_debt_payments_amount_paid', sql`${t.amountPaid} > 0`),
    check('chk_debt_payments_compensatory_interest_paid', sql`${t.compensatoryInterestPaid} >= 0`),
    check('chk_debt_payments_moratory_interest_paid', sql`${t.moratoryInterestPaid} >= 0`),
    check('chk_debt_payments_principal_paid', sql`${t.principalPaid} >= 0`),
    check('chk_debt_payments_days_late', sql`${t.daysLate} >= 0`),
    check(
      'chk_payments_breakdown',
      sql`${t.amountPaid} = ${t.principalPaid} + ${t.compensatoryInterestPaid} + ${t.moratoryInterestPaid}`,
    ),
  ],
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    debtPaymentId: uuid('debt_payment_id')
      .notNull()
      .references(() => debtPayments.id, { onDelete: 'restrict' }),
    creditChargeId: uuid('credit_charge_id').references(() => creditCharges.id, {
      onDelete: 'restrict',
    }),
    creditInstallmentId: uuid('credit_installment_id').references(() => creditInstallments.id, {
      onDelete: 'restrict',
    }),
    allocationType: varchar('allocation_type', { length: 25 }).notNull(),
    amount: money('amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'chk_payment_allocations_allocation_type',
      oneOf(t.allocationType, ['PRINCIPAL', 'COMPENSATORY_INTEREST', 'MORATORY_INTEREST']),
    ),
    check('chk_payment_allocations_amount', sql`${t.amount} > 0`),
    check(
      'chk_allocations_target',
      sql`(${t.creditChargeId} IS NOT NULL)::INT + (${t.creditInstallmentId} IS NOT NULL)::INT = 1`,
    ),
    index('idx_allocations_payment').on(t.debtPaymentId),
  ],
);

export const creditChargeVoids = pgTable(
  'credit_charge_voids',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    creditChargeId: uuid('credit_charge_id')
      .notNull()
      .unique()
      .references(() => creditCharges.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    appliedCycleId: uuid('applied_cycle_id')
      .notNull()
      .references(() => settlementCycles.id, { onDelete: 'restrict' }),
    voidedAmount: money('voided_amount').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('chk_credit_charge_voids_voided_amount', sql`${t.voidedAmount} > 0`),
    index('idx_charge_voids_cycle').on(t.appliedCycleId),
  ],
);
