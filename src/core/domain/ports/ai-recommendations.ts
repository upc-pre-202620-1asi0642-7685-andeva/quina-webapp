import type { Recommendation, ReportSummary } from '../analytics/report';
import type { Locale } from '../shared/locale';

/** Modelo de lenguaje que convierte el reporte agregado en recomendaciones (US20). */
export interface AIRecommender {
  recommend(summary: ReportSummary, locale: Locale): Promise<Recommendation[]>;
}

export type QuotaPeriod = { year: number; month: number };

/** Contador mensual de `ai_recommendation_quotas` (US20 crit. 4). */
export interface AIQuotaRepository {
  /** Suma una consulta si aún queda cupo; devuelve las usadas o null si se agotó. */
  reserve(storeId: string, period: QuotaPeriod, max: number, now: Date): Promise<number | null>;
  /** Devuelve una consulta reservada que no llegó a dar respuesta. */
  release(storeId: string, period: QuotaPeriod): Promise<void>;
  used(storeId: string, period: QuotaPeriod): Promise<number>;
}
