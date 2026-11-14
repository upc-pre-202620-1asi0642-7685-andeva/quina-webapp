import { desc, eq, and, isNull, sql } from 'drizzle-orm';
import type { AddRusCapData, RusCapRepository } from '@/core/domain/ports/platform-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { db, type Database } from '../connection';
import { getPlatformDb } from '../platform-connection';
import { auditLogs, rusCategories } from '../schema';

/** Igual que los topes del BCRP: quina_app no escribe en `rus_categories` (0001_security). */
export class DrizzleRusCapRepository implements RusCapRepository {
  constructor(
    private readonly platform: Database = getPlatformDb(),
    private readonly app: Database = db,
  ) {}

  async add(data: AddRusCapData): Promise<'OK' | 'NOT_AFTER_CURRENT'> {
    const validFrom = BusinessDate.toISO(data.validFrom);
    const created = await this.platform.transaction(async (tx) => {
      // La última vigencia de la categoría, bloqueada contra otra alta a la vez
      const [latest] = await tx
        .select({ id: rusCategories.id, validFrom: rusCategories.validFrom })
        .from(rusCategories)
        .where(eq(rusCategories.category, data.category))
        .orderBy(desc(rusCategories.validFrom))
        .limit(1)
        .for('update');
      if (latest && latest.validFrom >= validFrom) return null;
      if (latest) {
        await tx
          .update(rusCategories)
          .set({ validTo: sql`${validFrom}::date - 1` })
          .where(and(eq(rusCategories.id, latest.id), isNull(rusCategories.validTo)));
      }
      const [row] = await tx
        .insert(rusCategories)
        .values({
          category: data.category,
          monthlyIncomeCap: data.monthlyIncomeCap,
          monthlyPurchasesCap: data.monthlyPurchasesCap,
          validFrom,
        })
        .returning({ id: rusCategories.id });
      return row!.id;
    });
    if (!created) return 'NOT_AFTER_CURRENT';

    await this.app.insert(auditLogs).values({
      storeId: null,
      userId: data.adminId,
      action: 'ADD_RUS_CAP',
      entityName: 'rus_categories',
      entityId: created,
      newData: {
        category: data.category,
        monthlyIncomeCap: data.monthlyIncomeCap,
        monthlyPurchasesCap: data.monthlyPurchasesCap,
        validFrom,
      },
    });
    return 'OK';
  }
}
