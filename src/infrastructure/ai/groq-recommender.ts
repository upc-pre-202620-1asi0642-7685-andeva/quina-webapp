import Groq from 'groq-sdk';
import { z } from 'zod';
import type { Recommendation, ReportSummary } from '@/core/domain/analytics/report';
import type { AIRecommender } from '@/core/domain/ports/ai-recommendations';
import type { Locale } from '@/core/domain/shared/locale';

// US20 pedía Llama 3, pero Groq ya no ofrece modelos Llama de chat (probado el
// 2026-11-13). gpt-oss-120b con razonamiento bajo responde en ~1 s (crit. 2).
const MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 3_000;

// El modelo no escribe quechua con confianza: el borrador qu recibe castellano
const LANGUAGE: Record<Locale, string> = { es: 'Spanish', en: 'English', qu: 'Spanish' };

const answerSchema = z.object({
  cards: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        body: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(5),
});

/**
 * US20 crit. 3: el mensaje se arma solo con los montos agregados del reporte;
 * `ReportSummary` no tiene nombres, documentos ni identificadores.
 */
export function buildPrompt(summary: ReportSummary, locale: Locale) {
  return [
    {
      role: 'system' as const,
      content:
        'You advise owners of small neighborhood shops (bodegas) in Peru that sell on credit ("fiado"). ' +
        `Answer in ${LANGUAGE[locale]} with simple, warm, practical words, no banking jargon. ` +
        'Give 3 to 5 concrete recommendations based only on the figures. Amounts are Peruvian soles (S/). ' +
        // En la prueba real ambos modelos sugirieron recargos: la tasa la fija el BCRP y se pacta antes
        'Never suggest new fees, surcharges or higher interest rates: rates are agreed in advance and capped by law. ' +
        'Reply with JSON: {"cards":[{"title":"short title","body":"one or two sentences"}]}.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        period: { from: summary.from, to: summary.to },
        cashSales: summary.cashSales,
        creditSales: summary.creditSales,
        compensatoryInterestCollected: summary.compensatoryInterest,
        moratoryInterestCollected: summary.moratoryInterest,
        costOfSales: summary.costOfSales,
        grossMargin: summary.grossMargin,
        numberOfSales: summary.salesCount,
      }),
    },
  ];
}

export class GroqRecommender implements AIRecommender {
  private readonly client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  }

  async recommend(summary: ReportSummary, locale: Locale): Promise<Recommendation[]> {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: buildPrompt(summary, locale),
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
      temperature: 0.4,
      // Incluye los tokens de razonamiento del modelo
      max_completion_tokens: 1200,
    });
    const content = completion.choices[0]?.message.content ?? '';
    return answerSchema.parse(JSON.parse(content)).cards;
  }
}

/** Sin red ni clave (pruebas y desarrollo local): tarjetas fijas a partir de los montos. */
export class FakeRecommender implements AIRecommender {
  async recommend(summary: ReportSummary): Promise<Recommendation[]> {
    return [
      {
        title: 'Revisa tu fiado',
        body: `Vendiste S/ ${summary.creditSales} al fiado y S/ ${summary.cashSales} al contado.`,
      },
    ];
  }
}

class MissingKeyRecommender implements AIRecommender {
  async recommend(): Promise<Recommendation[]> {
    throw new Error('GROQ_API_KEY is required for AI recommendations');
  }
}

let cached: AIRecommender | undefined;

export function getAIRecommender(env: NodeJS.ProcessEnv = process.env): AIRecommender {
  if (cached) return cached;
  const production = env.VERCEL_ENV === 'production';
  const transport = env.AI_TRANSPORT || (env.GROQ_API_KEY || production ? 'groq' : 'fake');
  if (transport === 'fake') {
    if (production) throw new Error('AI_TRANSPORT=fake is not allowed when VERCEL_ENV=production');
    cached = new FakeRecommender();
  } else if (transport === 'groq') {
    // Sin clave cada consulta falla dentro del caso de uso: "IA no disponible" y no se cobra
    cached = env.GROQ_API_KEY ? new GroqRecommender(env.GROQ_API_KEY) : new MissingKeyRecommender();
  } else {
    throw new Error(`Unknown AI_TRANSPORT: ${transport}`);
  }
  return cached;
}
