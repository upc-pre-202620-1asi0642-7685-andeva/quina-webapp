import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, oneOf, tstz, updatedAt, uuidPk } from './columns';
import { stores, users } from './identity';

// 7. Auditoría, cuotas de IA y topes tributarios.

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuidPk(),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    action: varchar('action', { length: 50 }).notNull(),
    entityName: varchar('entity_name', { length: 50 }).notNull(),
    entityId: uuid('entity_id'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('idx_audit_store_date').on(t.storeId, t.createdAt.desc())],
);

export const aiRecommendationQuotas = pgTable(
  'ai_recommendation_quotas',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    periodMonth: smallint('period_month').notNull(),
    periodYear: smallint('period_year').notNull(),
    requestsUsed: integer('requests_used').notNull().default(0),
    maxMonthlyQuota: integer('max_monthly_quota').notNull().default(0),
    lastRequestAt: tstz('last_request_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('uq_ai_quotas_store_period').on(t.storeId, t.periodYear, t.periodMonth),
    check('chk_ai_recommendation_quotas_period_month', sql`${t.periodMonth} BETWEEN 1 AND 12`),
    check('chk_ai_recommendation_quotas_period_year', sql`${t.periodYear} >= 2024`),
    check('chk_ai_recommendation_quotas_requests_used', sql`${t.requestsUsed} >= 0`),
    check('chk_ai_recommendation_quotas_max_monthly_quota', sql`${t.maxMonthlyQuota} >= 0`),
  ],
);

// De plataforma: topes del Nuevo RUS
export const rusCategories = pgTable(
  'rus_categories',
  {
    id: uuidPk(),
    category: smallint('category').notNull(),
    monthlyIncomeCap: numeric('monthly_income_cap', { precision: 12, scale: 2 }).notNull(),
    monthlyPurchasesCap: numeric('monthly_purchases_cap', { precision: 12, scale: 2 }).notNull(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('uq_rus_categories_period').on(t.category, t.validFrom),
    check('chk_rus_categories_category', oneOf(t.category, [1, 2])),
    check('chk_rus_categories_monthly_income_cap', sql`${t.monthlyIncomeCap} > 0`),
    check('chk_rus_categories_monthly_purchases_cap', sql`${t.monthlyPurchasesCap} > 0`),
  ],
);
