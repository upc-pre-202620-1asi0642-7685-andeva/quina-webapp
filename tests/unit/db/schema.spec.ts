import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/db/schema';

// Lista literal de docs/quina-database-schema.md (sección 3).
const EXPECTED_TABLES = [
  'accounts',
  'ai_recommendation_quotas',
  'audit_logs',
  'categories',
  'credit_accounts',
  'credit_charge_voids',
  'credit_charges',
  'credit_installments',
  'credit_rate_caps',
  'customer_consents',
  'customers',
  'debt_payments',
  'inventory_movements',
  'notification_logs',
  'payment_allocations',
  'product_price_history',
  'products',
  'purchase_attachments',
  'purchase_items',
  'purchase_order_items',
  'purchase_orders',
  'purchases',
  'rate_limits',
  'rus_categories',
  'sale_items',
  'sales',
  'sessions',
  'settlement_cycles',
  'store_subscriptions',
  'stores',
  'subscription_payments',
  'suppliers',
  'units',
  'users',
  'verifications',
];

const tables = Object.values(schema).filter((value) => is(value, PgTable)) as PgTable[];

describe('esquema Drizzle', () => {
  it('define exactamente las 35 tablas del documento', () => {
    const names = tables.map((table) => getTableConfig(table).name).sort();
    expect(EXPECTED_TABLES).toHaveLength(35);
    expect(names).toEqual(EXPECTED_TABLES);
  });

  it('users conserva el check chk_users_store_role', () => {
    const config = getTableConfig(schema.users);
    expect(config.checks.map((c) => c.name)).toContain('chk_users_store_role');
  });

  it('expone las tablas de Better Auth con nombres plurales y claves esperadas', () => {
    expect(Object.keys(schema.users)).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'email',
        'emailVerified',
        'image',
        'createdAt',
        'updatedAt',
      ]),
    );
    expect(Object.keys(schema.sessions)).toEqual(
      expect.arrayContaining(['token', 'expiresAt', 'ipAddress', 'userAgent', 'userId']),
    );
    expect(Object.keys(schema.accounts)).toEqual(
      expect.arrayContaining(['accountId', 'providerId', 'password', 'accessTokenExpiresAt']),
    );
    expect(Object.keys(schema.verifications)).toEqual(
      expect.arrayContaining(['identifier', 'value', 'expiresAt']),
    );
    expect(Object.keys(schema.rateLimits)).toEqual(
      expect.arrayContaining(['key', 'count', 'lastRequest']),
    );
  });
});
