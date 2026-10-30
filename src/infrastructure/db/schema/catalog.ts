import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, oneOf, updatedAt, uuidPk } from './columns';
import { stores, users } from './identity';

// 3. Catálogo, inventario y compras (Supporting Domain).

const qty = (name: string) => numeric(name, { precision: 10, scale: 3 });
const unitCost = (name: string) => numeric(name, { precision: 12, scale: 4 });

export const units = pgTable(
  'units',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 10 }).notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    allowDecimals: boolean('allow_decimals').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique('uq_units_store_code').on(t.storeId, t.code)],
);

export const categories = pgTable(
  'categories',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('uq_categories_store_name').on(t.storeId, t.name)],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    taxIdNumber: varchar('tax_id_number', { length: 15 }).notNull(),
    tradeName: varchar('trade_name', { length: 150 }).notNull(),
    contactName: varchar('contact_name', { length: 100 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 150 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('uq_suppliers_store_tax_id').on(t.storeId, t.taxIdNumber)],
);

export const products = pgTable(
  'products',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    defaultSupplierId: uuid('default_supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    sku: varchar('sku', { length: 50 }),
    barcode: varchar('barcode', { length: 50 }),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    brand: varchar('brand', { length: 100 }),
    isService: boolean('is_service').notNull().default(false),
    currentStock: qty('current_stock').notNull().default('0.000'),
    minimumStock: qty('minimum_stock').notNull().default('0.000'),
    cashPrice: money('cash_price').notNull(),
    creditPrice: money('credit_price').notNull(),
    allowsInstallments: boolean('allows_installments').notNull().default(false),
    currentAverageCost: unitCost('current_average_cost').notNull().default('0.0000'),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('chk_products_current_stock', sql`${t.currentStock} >= 0`),
    check('chk_products_minimum_stock', sql`${t.minimumStock} >= 0`),
    check('chk_products_cash_price', sql`${t.cashPrice} > 0`),
    check('chk_products_credit_price', sql`${t.creditPrice} >= ${t.cashPrice}`),
    check('chk_products_current_average_cost', sql`${t.currentAverageCost} >= 0`),
    check(
      'chk_products_service_stock',
      sql`NOT ${t.isService} OR (${t.currentStock} = 0 AND ${t.minimumStock} = 0)`,
    ),
    index('idx_products_store_active').on(t.storeId, t.isActive),
    uniqueIndex('uq_products_store_barcode')
      .on(t.storeId, t.barcode)
      .where(sql`${t.barcode} IS NOT NULL`),
    index('idx_products_store_low_stock')
      .on(t.storeId)
      .where(sql`${t.isService} = FALSE AND ${t.currentStock} <= ${t.minimumStock}`),
  ],
);

export const productPriceHistory = pgTable('product_price_history', {
  id: uuidPk(),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'restrict' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  oldCashPrice: money('old_cash_price').notNull(),
  newCashPrice: money('new_cash_price').notNull(),
  oldCreditPrice: money('old_credit_price').notNull(),
  newCreditPrice: money('new_credit_price').notNull(),
  reason: text('reason'),
  createdAt: createdAt(),
});

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('chk_purchase_orders_status', oneOf(t.status, ['DRAFT', 'SENT', 'RECEIVED', 'CANCELED'])),
    index('idx_purchase_orders_store_status').on(t.storeId, t.status),
  ],
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: qty('quantity').notNull(),
  },
  (t) => [
    unique('uq_purchase_order_items_product').on(t.purchaseOrderId, t.productId),
    check('chk_purchase_order_items_quantity', sql`${t.quantity} > 0`),
  ],
);

export const purchases = pgTable(
  'purchases',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    documentType: varchar('document_type', { length: 20 }).notNull(),
    series: varchar('series', { length: 10 }),
    documentNumber: varchar('document_number', { length: 20 }).notNull(),
    issueDate: date('issue_date').notNull(),
    totalAmount: money('total_amount').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'chk_purchases_document_type',
      oneOf(t.documentType, ['FACTURA', 'BOLETA', 'GUIA_REMISION', 'RECIBO']),
    ),
    check('chk_purchases_total_amount', sql`${t.totalAmount} > 0`),
  ],
);

export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: qty('quantity').notNull(),
    unitCost: unitCost('unit_cost').notNull(),
    subtotal: money('subtotal').notNull(),
  },
  (t) => [
    check('chk_purchase_items_quantity', sql`${t.quantity} > 0`),
    check('chk_purchase_items_unit_cost', sql`${t.unitCost} > 0`),
    check('chk_purchase_items_subtotal', sql`${t.subtotal} > 0`),
    index('idx_purchase_items_purchase').on(t.purchaseId),
  ],
);

export const purchaseAttachments = pgTable(
  'purchase_attachments',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('chk_purchase_attachments_file_size', sql`${t.fileSize} BETWEEN 1 AND 5242880`),
    check(
      'chk_purchase_attachments_mime_type',
      oneOf(t.mimeType, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    ),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    movementType: varchar('movement_type', { length: 30 }).notNull(),
    referenceId: uuid('reference_id'),
    quantity: qty('quantity').notNull(),
    unitCost: unitCost('unit_cost').notNull(),
    totalCost: money('total_cost').notNull(),
    stockAfter: qty('stock_after').notNull(),
    averageCostAfter: unitCost('average_cost_after').notNull(),
    notes: text('notes'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'chk_inventory_movements_movement_type',
      oneOf(t.movementType, [
        'PURCHASE_ENTRY',
        'SALE_EXIT',
        'WASTE_LOSS',
        'COUNT_ADJUSTMENT',
        'CUSTOMER_RETURN',
      ]),
    ),
    check('chk_inventory_movements_quantity', sql`${t.quantity} <> 0`),
    check('chk_inventory_movements_unit_cost', sql`${t.unitCost} >= 0`),
    check('chk_inventory_movements_stock_after', sql`${t.stockAfter} >= 0`),
    check('chk_inventory_movements_average_cost_after', sql`${t.averageCostAfter} >= 0`),
    check(
      'chk_inventory_reason',
      sql`${t.movementType} NOT IN ('WASTE_LOSS', 'COUNT_ADJUSTMENT') OR ${t.notes} IS NOT NULL`,
    ),
    index('idx_inventory_product_date').on(t.productId, t.createdAt.desc().nullsFirst()),
  ],
);
