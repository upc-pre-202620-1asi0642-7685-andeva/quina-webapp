import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AddRateCapData, RateCapRepository } from '@/core/domain/ports/platform-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { db, type Database } from '../connection';
import { getPlatformDb } from '../platform-connection';
import { auditLogs, creditRateCaps } from '../schema';

export class DrizzleRateCapRepository implements RateCapRepository {
  constructor(
    private readonly platform: Database = getPlatformDb(),
    private readonly app: Database = db,
  ) {}

  async add(data: AddRateCapData): Promise<'OK' | 'NOT_AFTER_CURRENT'> {
    const validFrom = BusinessDate.toISO(data.cap.validFrom);
    const created = await this.platform.transaction(async (tx) => {
      const sameRate = and(
        eq(creditRateCaps.rateKind, data.cap.kind),
        eq(creditRateCaps.currency, data.cap.currency),
      );
      // La última vigencia de esa tasa y moneda, bloqueada contra otra alta a la vez
      const [latest] = await tx
        .select({ id: creditRateCaps.id, validFrom: creditRateCaps.validFrom })
        .from(creditRateCaps)
        .where(sameRate)
        .orderBy(desc(creditRateCaps.validFrom))
        .limit(1)
        .for('update');
      if (latest && latest.validFrom >= validFrom) return null;
      if (latest) {
        await tx
          .update(creditRateCaps)
          .set({ validTo: sql`${validFrom}::date - 1` })
          .where(and(eq(creditRateCaps.id, latest.id), isNull(creditRateCaps.validTo)));
      }
      const [row] = await tx
        .insert(creditRateCaps)
        .values({
          rateKind: data.cap.kind,
          currency: data.cap.currency,
          maxEffectiveAnnualRate: data.cap.maxEffectiveAnnualRate,
          validFrom,
          sourceReference: data.source,
        })
        .returning({ id: creditRateCaps.id });
      return row!.id;
    });
    if (!created) return 'NOT_AFTER_CURRENT';

    // quina_platform puede no saltar RLS (0001_security.sql): la auditoría de
    // plataforma (store_id NULL) la escribe quina_app, que sí la admite.
    await this.app.insert(auditLogs).values({
      storeId: null,
      userId: data.adminId,
      action: 'ADD_RATE_CAP',
      entityName: 'credit_rate_caps',
      entityId: created,
      newData: {
        kind: data.cap.kind,
        currency: data.cap.currency,
        maxEffectiveAnnualRate: data.cap.maxEffectiveAnnualRate,
        validFrom,
        source: data.source,
      },
    });
    return 'OK';
  }
}
