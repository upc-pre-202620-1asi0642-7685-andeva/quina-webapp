import { and, count, eq, inArray } from 'drizzle-orm';
import type {
  PushSubscriptionInput,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/core/domain/ports/push-notifier';
import type { Locale } from '@/core/domain/shared/locale';
import { isLocale } from '@/presentation/i18n/resolve-locale';
import { pushSubscriptions } from '../db/schema';
import { withTenant } from '../db/with-tenant';

export class DrizzlePushRepository implements PushSubscriptionRepository {
  async upsert(input: PushSubscriptionInput): Promise<void> {
    const now = new Date();
    await withTenant(input.storeId, (tx) =>
      tx
        .insert(pushSubscriptions)
        .values({
          storeId: input.storeId,
          userId: input.userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent?.slice(0, 255) ?? null,
          locale: input.locale,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.storeId, pushSubscriptions.endpoint],
          set: {
            userId: input.userId,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            userAgent: input.userAgent?.slice(0, 255) ?? null,
            locale: input.locale,
            lastError: null,
            updatedAt: now,
          },
        }),
    );
  }

  async removeByEndpoint(storeId: string, userId: string, endpoint: string): Promise<number> {
    return withTenant(storeId, async (tx) => {
      const deleted = await tx
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
        .returning({ id: pushSubscriptions.id });
      return deleted.length;
    });
  }

  async removeByIds(storeId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await withTenant(storeId, (tx) =>
      tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, [...ids])),
    );
  }

  async listForStore(storeId: string): Promise<PushSubscriptionRecord[]> {
    const rows = await withTenant(storeId, (tx) => tx.select().from(pushSubscriptions));
    return rows.map(toRecord);
  }

  async listForUser(storeId: string, userId: string): Promise<PushSubscriptionRecord[]> {
    const rows = await withTenant(storeId, (tx) =>
      tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    );
    return rows.map(toRecord);
  }

  async countForUser(storeId: string, userId: string): Promise<number> {
    const [row] = await withTenant(storeId, (tx) =>
      tx
        .select({ total: count() })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId)),
    );
    return Number(row?.total ?? 0);
  }

  async markSent(storeId: string, ids: readonly string[], sentAt: Date): Promise<void> {
    if (ids.length === 0) return;
    await withTenant(storeId, (tx) =>
      tx
        .update(pushSubscriptions)
        .set({ lastSentAt: sentAt, lastError: null, updatedAt: sentAt })
        .where(inArray(pushSubscriptions.id, [...ids])),
    );
  }

  async markError(storeId: string, id: string, message: string): Promise<void> {
    await withTenant(storeId, (tx) =>
      tx
        .update(pushSubscriptions)
        .set({ lastError: message.slice(0, 500), updatedAt: new Date() })
        .where(eq(pushSubscriptions.id, id)),
    );
  }
}

function toRecord(row: typeof pushSubscriptions.$inferSelect): PushSubscriptionRecord {
  const locale: Locale = isLocale(row.locale) ? row.locale : 'es';
  return {
    id: row.id,
    storeId: row.storeId,
    userId: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    locale,
    lastSentAt: row.lastSentAt,
  };
}
