'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { LightbulbIcon, SparklesIcon } from 'lucide-react';
import type { Recommendation } from '@/core/domain/analytics/report';
import { analyzeReportAction } from '@/presentation/actions/reports';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';

type AnalyzeError = 'NOT_IN_PLAN' | 'QUOTA_EXHAUSTED' | 'UNAVAILABLE' | 'RANGE_INVALID';

/** US20 crit. 2-5: el dueño pide el análisis y ve las sugerencias como tarjetas. */
export function AiRecommendations({
  from,
  to,
  used: initialUsed,
  max,
}: {
  from: string;
  to: string;
  used: number;
  max: number;
}) {
  const t = useTranslations('Reports.ai');
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState<Recommendation[]>([]);
  const [used, setUsed] = useState(initialUsed);
  const [error, setError] = useState<AnalyzeError | null>(null);
  const exhausted = used >= max;

  function analyze() {
    setError(null);
    startTransition(async () => {
      const result = await analyzeReportAction(from, to);
      if (result.ok) {
        setCards(result.value.cards);
        setUsed(result.value.used);
      } else {
        if (result.error === 'QUOTA_EXHAUSTED') setUsed(max);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button onClick={analyze} disabled={pending || exhausted}>
          <SparklesIcon aria-hidden="true" />
          {pending ? t('analyzing') : t('analyze')}
        </Button>
        <span className="text-sm text-ink-soft tabular-nums">
          {t('quota', { left: Math.max(0, max - used), max })}
        </span>
      </div>
      <p className="text-[13px] text-ink-soft print:hidden">{t('privacy')}</p>

      {error ? (
        <Notice tone={error === 'QUOTA_EXHAUSTED' ? 'warning' : 'error'}>
          <p>{t(`errors.${error}`)}</p>
        </Notice>
      ) : null}

      {cards.length > 0 ? (
        <ul aria-live="polite" className="grid gap-3 sm:grid-cols-2">
          {cards.map((card, index) => (
            <li
              key={index}
              className="flex break-inside-avoid flex-col gap-2 rounded-card border border-line bg-soft p-4 text-soft-ink"
            >
              <p className="flex items-center gap-2 font-semibold">
                <LightbulbIcon aria-hidden="true" className="size-5 shrink-0" />
                {card.title}
              </p>
              <p className="text-sm">{card.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
