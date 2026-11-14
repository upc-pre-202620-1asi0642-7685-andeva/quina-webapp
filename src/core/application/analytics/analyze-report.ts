import type { Recommendation, ReportSummary } from '@/core/domain/analytics/report';
import { PlanLimits, type PlanTier } from '@/core/domain/billing/plan-limits';
import type {
  AIQuotaRepository,
  AIRecommender,
  QuotaPeriod,
} from '@/core/domain/ports/ai-recommendations';
import { BusinessDate } from '@/core/domain/shared/business-date';
import type { Locale } from '@/core/domain/shared/locale';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type AnalyzeReportError = 'NOT_IN_PLAN' | 'QUOTA_EXHAUSTED' | 'UNAVAILABLE';

export type AnalyzeReportResult = { cards: Recommendation[]; used: number; max: number };

/** Mes de Lima de la cuota (US20 crit. 4). */
export function quotaPeriod(now: Date): QuotaPeriod {
  const today = BusinessDate.fromInstant(now);
  return { year: today.year, month: today.month };
}

/**
 * US20: "Analizar con IA". El tope sale siempre del plan vigente, así una
 * subida de plan rige al instante; la consulta se cobra solo si hubo respuesta.
 */
export class AnalyzeReportUseCase {
  constructor(
    private readonly quotas: AIQuotaRepository,
    private readonly ai: AIRecommender,
  ) {}

  async execute(input: {
    storeId: string;
    tier: PlanTier;
    summary: ReportSummary;
    locale: Locale;
    now: Date;
  }): Promise<Result<AnalyzeReportResult, AnalyzeReportError>> {
    const limits = PlanLimits.of(input.tier);
    const max = limits.aiQueriesPerMonth ?? Number.MAX_SAFE_INTEGER;
    if (!limits.features.ai || max === 0) return err('NOT_IN_PLAN');

    const period = quotaPeriod(input.now);
    const used = await this.quotas.reserve(input.storeId, period, max, input.now);
    if (used === null) return err('QUOTA_EXHAUSTED');
    try {
      const cards = await this.ai.recommend(input.summary, input.locale);
      return ok({ cards, used, max });
    } catch (error) {
      console.error('[ai] no se pudo generar la recomendación', error);
      await this.quotas.release(input.storeId, period);
      return err('UNAVAILABLE');
    }
  }
}
