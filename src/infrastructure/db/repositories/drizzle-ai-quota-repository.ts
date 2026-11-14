import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { AIQuotaRepository, QuotaPeriod } from '@/core/domain/ports/ai-recommendations';
import { aiRecommendationQuotas } from '../schema';
import { withTenant } from '../with-tenant';

const inPeriod = (storeId: string, period: QuotaPeriod) =>
  and(
    eq(aiRecommendationQuotas.storeId, storeId),
    eq(aiRecommendationQuotas.periodYear, period.year),
    eq(aiRecommendationQuotas.periodMonth, period.month),
  );

export class DrizzleAIQuotaRepository implements AIQuotaRepository {
  reserve(storeId: string, period: QuotaPeriod, max: number, now: Date) {
    return withTenant(storeId, async (tx) => {
      // La fila del mes guarda el tope que regía en la última consulta, como referencia
      await tx
        .insert(aiRecommendationQuotas)
        .values({
          storeId,
          periodYear: period.year,
          periodMonth: period.month,
          maxMonthlyQuota: max,
        })
        .onConflictDoUpdate({
          target: [
            aiRecommendationQuotas.storeId,
            aiRecommendationQuotas.periodYear,
            aiRecommendationQuotas.periodMonth,
          ],
          set: { maxMonthlyQuota: max },
        });
      // Atómico: dos consultas a la vez no pasan juntas el tope
      const [row] = await tx
        .update(aiRecommendationQuotas)
        .set({
          requestsUsed: sql`${aiRecommendationQuotas.requestsUsed} + 1`,
          lastRequestAt: now,
          updatedAt: now,
        })
        .where(and(inPeriod(storeId, period), lt(aiRecommendationQuotas.requestsUsed, max)))
        .returning({ used: aiRecommendationQuotas.requestsUsed });
      return row ? row.used : null;
    });
  }

  async release(storeId: string, period: QuotaPeriod) {
    await withTenant(storeId, (tx) =>
      tx
        .update(aiRecommendationQuotas)
        .set({ requestsUsed: sql`${aiRecommendationQuotas.requestsUsed} - 1` })
        .where(and(inPeriod(storeId, period), gt(aiRecommendationQuotas.requestsUsed, 0))),
    );
  }

  async used(storeId: string, period: QuotaPeriod) {
    const [row] = await withTenant(storeId, (tx) =>
      tx
        .select({ used: aiRecommendationQuotas.requestsUsed })
        .from(aiRecommendationQuotas)
        .where(inPeriod(storeId, period)),
    );
    return row?.used ?? 0;
  }
}
