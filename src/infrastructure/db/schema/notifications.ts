import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, oneOf, tstz, updatedAt, uuidPk } from './columns';
import { customers } from './credit';
import { stores, users } from './identity';

// 6. Notificaciones.

export const notificationLogs = pgTable(
  'notification_logs',
  {
    id: uuidPk(),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    notificationType: varchar('notification_type', { length: 30 }).notNull(),
    recipientEmail: varchar('recipient_email', { length: 150 }).notNull(),
    locale: varchar('locale', { length: 2 }).notNull().default('es'),
    referenceType: varchar('reference_type', { length: 30 }),
    referenceId: uuid('reference_id'),
    digestDate: date('digest_date'),
    providerMessageId: varchar('provider_message_id', { length: 100 }).unique(),
    status: varchar('status', { length: 20 }).notNull().default('QUEUED'),
    errorMessage: text('error_message'),
    sentAt: tstz('sent_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'chk_notification_logs_notification_type',
      oneOf(t.notificationType, [
        'CHARGE_DIGEST',
        'CYCLE_STATEMENT',
        'PAYMENT_REMINDER',
        'LATE_PAYMENT',
        'PAYMENT_RECEIPT',
        'WELCOME',
        'EMAIL_OTP',
        'MAGIC_LINK',
        'PASSWORD_RESET',
        'ACCOUNT_LOCKED',
        'EMPLOYEE_INVITE',
        'SUBSCRIPTION',
      ]),
    ),
    check('chk_notification_logs_locale', oneOf(t.locale, ['es', 'en', 'qu'])),
    check(
      'chk_notification_logs_status',
      oneOf(t.status, ['QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED']),
    ),
    check(
      'chk_notifications_digest',
      sql`(${t.notificationType} = 'CHARGE_DIGEST') = (${t.digestDate} IS NOT NULL AND ${t.customerId} IS NOT NULL)`,
    ),
    index('idx_notifications_store_date').on(t.storeId, t.createdAt.desc()),
    index('idx_notifications_customer_date').on(t.customerId, t.createdAt.desc()),
    // Un solo resumen diario por vecino y un solo aviso por ciclo
    uniqueIndex('uq_notifications_daily_digest')
      .on(t.customerId, t.digestDate)
      .where(sql`${t.notificationType} = 'CHARGE_DIGEST'`),
    uniqueIndex('uq_notifications_cycle_once')
      .on(t.notificationType, t.referenceId)
      .where(sql`${t.notificationType} IN ('PAYMENT_REMINDER', 'CYCLE_STATEMENT', 'LATE_PAYMENT')`),
  ],
);
