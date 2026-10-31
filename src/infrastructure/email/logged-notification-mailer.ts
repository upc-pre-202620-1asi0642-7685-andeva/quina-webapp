import type { MailContext, NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import { db, type Database } from '../db/connection';
import { notificationLogs } from '../db/schema';
import { withTenant } from '../db/with-tenant';

type LogType = 'WELCOME' | 'EMPLOYEE_INVITE';

/**
 * Envía con el transporte real y registra el resultado en `notification_logs`
 * (SENT o FAILED). El error se vuelve a lanzar: quien llama decide si aborta.
 */
export class LoggedNotificationMailer implements NotificationMailer {
  constructor(
    private readonly inner: NotificationMailer,
    private readonly database: Database = db,
  ) {}

  sendCustomerWelcome(
    input: Parameters<NotificationMailer['sendCustomerWelcome']>[0],
    context: MailContext,
  ): Promise<void> {
    return this.track('WELCOME', input.to, input.locale, context, () =>
      this.inner.sendCustomerWelcome(input, context),
    );
  }

  sendAccountSetup(
    input: Parameters<NotificationMailer['sendAccountSetup']>[0],
    context: MailContext,
  ): Promise<void> {
    const type = input.audience === 'employee' ? 'EMPLOYEE_INVITE' : 'WELCOME';
    return this.track(type, input.to, input.locale, context, () =>
      this.inner.sendAccountSetup(input, context),
    );
  }

  private async track(
    type: LogType,
    to: string,
    locale: Locale,
    context: MailContext,
    send: () => Promise<void>,
  ): Promise<void> {
    let failure: unknown;
    try {
      await send();
    } catch (error) {
      failure = error;
    }
    const row = {
      storeId: context.storeId,
      customerId: context.customerId ?? null,
      userId: context.userId ?? null,
      notificationType: type,
      recipientEmail: to,
      locale,
      status: failure ? 'FAILED' : 'SENT',
      errorMessage: failure ? String((failure as Error).message ?? failure).slice(0, 500) : null,
      sentAt: failure ? null : new Date(),
    };
    if (context.storeId) {
      await withTenant(
        context.storeId,
        (tx) => tx.insert(notificationLogs).values(row),
        this.database,
      );
    } else {
      await this.database.insert(notificationLogs).values(row);
    }
    if (failure) throw failure;
  }
}
