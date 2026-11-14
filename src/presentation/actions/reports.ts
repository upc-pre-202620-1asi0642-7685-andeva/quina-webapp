'use server';

import { getLocale } from 'next-intl/server';
import {
  AnalyzeReportUseCase,
  type AnalyzeReportError,
  type AnalyzeReportResult,
} from '@/core/application/analytics/analyze-report';
import { isLocale } from '@/presentation/i18n/resolve-locale';
import { loadReport } from '@/infrastructure/db/queries/reports';
import { DrizzleAIQuotaRepository } from '@/infrastructure/db/repositories/drizzle-ai-quota-repository';
import { getAIRecommender } from '@/infrastructure/ai/groq-recommender';
import { authorizeStore } from '@/presentation/auth/guards';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { parseReportRange } from '@/presentation/lib/report-range';
import { loadStoreContext } from '@/presentation/queries/store-context';

export type AnalyzeState =
  | { ok: true; value: AnalyzeReportResult }
  | { ok: false; error: AnalyzeReportError | 'RANGE_INVALID' };

/**
 * US20 crit. 2-4: "Analizar con IA". El reporte se vuelve a calcular en el
 * servidor con el rango pedido; nunca se confía en montos del navegador.
 */
export async function analyzeReportAction(from: string, to: string): Promise<AnalyzeState> {
  const user = await authorizeStore('reports.view', { allowWhenReadOnly: true });
  if (!user) return actionRedirect('/login');
  const now = new Date();
  const range = parseReportRange(from, to, now);
  if (!range) return { ok: false, error: 'RANGE_INVALID' };

  const [store, summary, locale] = await Promise.all([
    loadStoreContext(user.storeId),
    loadReport(user.storeId, range.from, range.to),
    getLocale(),
  ]);
  return new AnalyzeReportUseCase(new DrizzleAIQuotaRepository(), getAIRecommender()).execute({
    storeId: user.storeId,
    tier: store.tier,
    summary,
    locale: isLocale(locale) ? locale : 'es',
    now,
  });
}
