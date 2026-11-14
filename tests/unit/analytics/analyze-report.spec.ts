import { describe, expect, it } from 'vitest';
import { AnalyzeReportUseCase } from '@/core/application/analytics/analyze-report';
import type { ReportSummary } from '@/core/domain/analytics/report';
import type {
  AIQuotaRepository,
  AIRecommender,
  QuotaPeriod,
} from '@/core/domain/ports/ai-recommendations';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { buildPrompt } from '@/infrastructure/ai/groq-recommender';
import { parseReportRange } from '@/presentation/lib/report-range';

const summary: ReportSummary = {
  from: '2026-11-01',
  to: '2026-11-13',
  cashSales: '1200.00',
  creditSales: '800.00',
  compensatoryInterest: '24.00',
  moratoryInterest: '3.10',
  costOfSales: '1500.00',
  grossMargin: '500.00',
  salesCount: 42,
};

class MemoryQuotas implements AIQuotaRepository {
  usedCount = 0;
  lastMax = 0;
  async reserve(_storeId: string, _period: QuotaPeriod, max: number) {
    this.lastMax = max;
    if (this.usedCount >= max) return null;
    this.usedCount += 1;
    return this.usedCount;
  }
  async release() {
    this.usedCount = Math.max(0, this.usedCount - 1);
  }
  async used() {
    return this.usedCount;
  }
}

const answering: AIRecommender = {
  recommend: async () => [{ title: 'Cobra a tiempo', body: 'Recuerda la fecha de pago.' }],
};
const failing: AIRecommender = {
  recommend: async () => {
    throw new Error('timeout');
  },
};

const run = (
  quotas: AIQuotaRepository,
  ai: AIRecommender,
  tier: 'CASERO' | 'BODEGA_PRO' | 'NEGOCIO_PLUS',
) =>
  new AnalyzeReportUseCase(quotas, ai).execute({
    storeId: 'store',
    tier,
    summary,
    locale: 'es',
    now: new Date('2026-11-13T15:00:00Z'),
  });

describe('AnalyzeReportUseCase (US20 crit. 2 y 4)', () => {
  it('Casero no tiene IA y no gasta cuota', async () => {
    const quotas = new MemoryQuotas();
    expect(await run(quotas, answering, 'CASERO')).toEqual({ ok: false, error: 'NOT_IN_PLAN' });
    expect(quotas.usedCount).toBe(0);
  });

  it('Pro descuenta una de sus 20 consultas por respuesta', async () => {
    const quotas = new MemoryQuotas();
    const result = await run(quotas, answering, 'BODEGA_PRO');
    expect(result).toMatchObject({ ok: true, value: { used: 1, max: 20 } });
  });

  it('con la cuota agotada no llama al modelo', async () => {
    const quotas = new MemoryQuotas();
    quotas.usedCount = 20;
    let called = false;
    const spy: AIRecommender = {
      recommend: async () => {
        called = true;
        return [];
      },
    };
    expect(await run(quotas, spy, 'BODEGA_PRO')).toEqual({ ok: false, error: 'QUOTA_EXHAUSTED' });
    expect(called).toBe(false);
  });

  it('subir a Plus a mitad de mes da el nuevo tope al instante', async () => {
    const quotas = new MemoryQuotas();
    quotas.usedCount = 20;
    expect(await run(quotas, answering, 'NEGOCIO_PLUS')).toMatchObject({
      ok: true,
      value: { used: 21, max: 100 },
    });
    expect(quotas.lastMax).toBe(100);
  });

  it('si Groq falla o se pasa de tiempo, la consulta se devuelve', async () => {
    const quotas = new MemoryQuotas();
    expect(await run(quotas, failing, 'BODEGA_PRO')).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(quotas.usedCount).toBe(0);
  });
});

describe('buildPrompt (US20 crit. 3)', () => {
  it('solo envía montos agregados del reporte', () => {
    const [system, user] = buildPrompt(summary, 'es');
    expect(system!.content).toContain('Spanish');
    expect(Object.keys(JSON.parse(user!.content)).sort()).toEqual([
      'cashSales',
      'compensatoryInterestCollected',
      'costOfSales',
      'creditSales',
      'grossMargin',
      'moratoryInterestCollected',
      'numberOfSales',
      'period',
    ]);
  });

  it('el quechua recibe castellano', () => {
    expect(buildPrompt(summary, 'qu')[0]!.content).toContain('Spanish');
  });
});

describe('parseReportRange (US20)', () => {
  const now = new Date('2026-11-13T15:00:00Z');
  const iso = (range: ReturnType<typeof parseReportRange>) =>
    range && [BusinessDate.toISO(range.from), BusinessDate.toISO(range.to)];

  it('por defecto va del día 1 del mes a hoy en Lima', () => {
    expect(iso(parseReportRange(undefined, undefined, now))).toEqual(['2026-11-01', '2026-11-13']);
  });

  it('rechaza rangos al revés, de más de un año o con fechas inválidas', () => {
    expect(parseReportRange('2026-11-10', '2026-11-01', now)).toBeNull();
    expect(parseReportRange('2025-01-01', '2026-11-01', now)).toBeNull();
    expect(parseReportRange('2026-02-30', '2026-03-01', now)).toBeNull();
  });
});
