import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, oneOf, tstz, updatedAt, uuidPk } from './columns';

// 1. Identidad, tienda y seguridad (incluye las tablas de Better Auth).

export const stores = pgTable(
  'stores',
  {
    id: uuidPk(),
    commercialName: varchar('commercial_name', { length: 150 }).notNull(),
    businessTurn: varchar('business_turn', { length: 50 }).notNull(),
    taxIdType: varchar('tax_id_type', { length: 10 }).notNull(),
    taxIdNumber: varchar('tax_id_number', { length: 15 }).notNull().unique(),
    ownerFullName: varchar('owner_full_name', { length: 150 }).notNull(),
    contactEmail: varchar('contact_email', { length: 150 }).notNull().unique(),
    contactPhone: varchar('contact_phone', { length: 20 }),
    address: text('address'),
    taxRegime: varchar('tax_regime', { length: 30 }).notNull().default('NUEVO_RUS'),
    rusCategory: smallint('rus_category').notNull().default(1),
    yapeNumber: varchar('yape_number', { length: 15 }),
    plinNumber: varchar('plin_number', { length: 15 }),
    bankName: varchar('bank_name', { length: 60 }),
    bankAccountNumber: varchar('bank_account_number', { length: 30 }),
    bankCci: varchar('bank_cci', { length: 20 }),
    paymentQrPath: text('payment_qr_path'),
    defaultLocale: varchar('default_locale', { length: 2 }).notNull().default('es'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('chk_stores_tax_id_type', oneOf(t.taxIdType, ['RUC', 'DNI'])),
    check('chk_stores_tax_regime', oneOf(t.taxRegime, ['NUEVO_RUS', 'RER', 'MYPE', 'GENERAL'])),
    check('chk_stores_rus_category', oneOf(t.rusCategory, [1, 2])),
    check('chk_stores_default_locale', oneOf(t.defaultLocale, ['es', 'en', 'qu'])),
  ],
);

export const storeSubscriptions = pgTable(
  'store_subscriptions',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .unique()
      .references(() => stores.id, { onDelete: 'restrict' }),
    planTier: varchar('plan_tier', { length: 20 }).notNull().default('CASERO'),
    billingInterval: varchar('billing_interval', { length: 10 }),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    trialEndsAt: tstz('trial_ends_at'),
    gracePeriodEndsAt: tstz('grace_period_ends_at'),
    mpPreapprovalId: varchar('mp_preapproval_id', { length: 100 }).unique(),
    currentPeriodStart: tstz('current_period_start').notNull().defaultNow(),
    currentPeriodEnd: tstz('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'chk_store_subscriptions_plan_tier',
      oneOf(t.planTier, ['CASERO', 'BODEGA_PRO', 'NEGOCIO_PLUS']),
    ),
    check(
      'chk_store_subscriptions_billing_interval',
      oneOf(t.billingInterval, ['MONTHLY', 'YEARLY']),
    ),
    check(
      'chk_store_subscriptions_status',
      oneOf(t.status, ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']),
    ),
    check('chk_subscription_trial', sql`${t.status} <> 'TRIALING' OR ${t.trialEndsAt} IS NOT NULL`),
    check(
      'chk_subscription_paid_plan',
      sql`${t.planTier} = 'CASERO' OR ${t.status} <> 'ACTIVE'
        OR (${t.billingInterval} IS NOT NULL AND ${t.currentPeriodEnd} IS NOT NULL)`,
    ),
  ],
);

export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => storeSubscriptions.id, { onDelete: 'restrict' }),
    mpPaymentId: varchar('mp_payment_id', { length: 100 }).notNull().unique(),
    planTier: varchar('plan_tier', { length: 20 }).notNull(),
    billingInterval: varchar('billing_interval', { length: 10 }).notNull(),
    amount: money('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('PEN'),
    status: varchar('status', { length: 20 }).notNull(),
    paidAt: tstz('paid_at'),
    receiptUrl: text('receipt_url'),
    rawPayload: jsonb('raw_payload').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('chk_subscription_payments_plan_tier', oneOf(t.planTier, ['BODEGA_PRO', 'NEGOCIO_PLUS'])),
    check(
      'chk_subscription_payments_billing_interval',
      oneOf(t.billingInterval, ['MONTHLY', 'YEARLY']),
    ),
    check('chk_subscription_payments_amount', sql`${t.amount} > 0`),
    check(
      'chk_subscription_payments_status',
      oneOf(t.status, ['APPROVED', 'REJECTED', 'REFUNDED']),
    ),
    index('idx_subscription_payments_store').on(t.storeId, t.createdAt.desc()),
  ],
);

// Better Auth: user (con additionalFields de Quina)
export const users = pgTable(
  'users',
  {
    id: uuidPk(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 150 }).notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'restrict' }),
    role: varchar('role', { length: 20 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    preferredLocale: varchar('preferred_locale', { length: 2 }).notNull().default('es'),
    isActive: boolean('is_active').notNull().default(true),
    failedLoginAttempts: smallint('failed_login_attempts').notNull().default(0),
    lockedUntil: tstz('locked_until'),
    lastLoginAt: tstz('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'chk_users_role',
      oneOf(t.role, [
        'PLATFORM_ADMIN',
        'STORE_OWNER',
        'STORE_EMPLOYEE',
        'CUSTOMER',
        'PENDING_OWNER',
      ]),
    ),
    check('chk_users_preferred_locale', oneOf(t.preferredLocale, ['es', 'en', 'qu'])),
    check('chk_users_failed_login_attempts', sql`${t.failedLoginAttempts} >= 0`),
    check(
      'chk_users_store_role',
      sql`(${t.role} IN ('STORE_OWNER', 'STORE_EMPLOYEE') AND ${t.storeId} IS NOT NULL)
        OR (${t.role} IN ('PLATFORM_ADMIN', 'CUSTOMER', 'PENDING_OWNER') AND ${t.storeId} IS NULL)`,
    ),
    index('idx_users_store_role')
      .on(t.storeId, t.role)
      .where(sql`${t.isActive} = TRUE`),
  ],
);

// Better Auth: session
export const sessions = pgTable(
  'sessions',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_sessions_user').on(t.userId)],
);

// Better Auth: account (contraseña Argon2id y Google OAuth)
export const accounts = pgTable(
  'accounts',
  {
    id: uuidPk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 30 }).notNull(),
    password: varchar('password', { length: 255 }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tstz('access_token_expires_at'),
    refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
    scope: text('scope'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('uq_accounts_provider_account').on(t.providerId, t.accountId),
    index('idx_accounts_user').on(t.userId),
  ],
);

// Better Auth: verification (OTP, enlaces mágicos y recuperación de contraseña)
export const verifications = pgTable(
  'verifications',
  {
    id: uuidPk(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_verifications_identifier').on(t.identifier)],
);

// Better Auth: rateLimit (persistido en base de datos para entornos serverless)
export const rateLimits = pgTable('rate_limits', {
  id: uuidPk(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  count: integer('count').notNull().default(0),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
