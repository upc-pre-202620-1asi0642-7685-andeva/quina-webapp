import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { products } from './catalog';
import { createdAt, money, oneOf, tstz, uuidPk } from './columns';
import { customers } from './credit';
import { stores, users } from './identity';

// 4. Ventas y mostrador (Transaction Operations).

export const sales = pgTable(
  'sales',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    userIdCashier: uuid('user_id_cashier')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    saleModality: varchar('sale_modality', { length: 30 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
    totalAmount: money('total_amount').notNull(),
    amountReceived: money('amount_received'),
    changeGiven: money('change_given'),
    totalCost: money('total_cost').notNull().default('0.00'),
    profitMargin: money('profit_margin').notNull().default('0.00'),
    saleDate: tstz('sale_date').notNull().defaultNow(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'chk_sales_sale_modality',
      oneOf(t.saleModality, ['CASH', 'SINGLE_PAYMENT_CREDIT', 'INSTALLMENTS_CREDIT']),
    ),
    check(
      'chk_sales_payment_method',
      oneOf(t.paymentMethod, ['CASH', 'YAPE', 'PLIN', 'CARD', 'CREDIT']),
    ),
    check('chk_sales_total_amount', sql`${t.totalAmount} > 0`),
    check('chk_sales_change_given', sql`${t.changeGiven} >= 0`),
    check(
      'chk_sales_modality_payment',
      sql`(${t.saleModality} = 'CASH' AND ${t.paymentMethod} <> 'CREDIT')
        OR (${t.saleModality} <> 'CASH' AND ${t.paymentMethod} = 'CREDIT' AND ${t.customerId} IS NOT NULL)`,
    ),
    index('idx_sales_store_date').on(t.storeId, t.saleDate.desc().nullsFirst()),
    index('idx_sales_customer').on(t.customerId, t.saleDate.desc().nullsFirst()),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull(),
    unitPrice: money('unit_price').notNull(),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 12, scale: 4 }).notNull(),
    subtotal: money('subtotal').notNull(),
  },
  (t) => [
    check('chk_sale_items_quantity', sql`${t.quantity} > 0`),
    check('chk_sale_items_unit_price', sql`${t.unitPrice} > 0`),
    check('chk_sale_items_unit_cost_snapshot', sql`${t.unitCostSnapshot} >= 0`),
    check('chk_sale_items_subtotal', sql`${t.subtotal} > 0`),
    index('idx_sale_items_sale').on(t.saleId),
  ],
);
