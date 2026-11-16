'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LightbulbIcon, LoaderCircleIcon, SparklesIcon } from 'lucide-react';
import { sileo } from 'sileo';
import type { Recommendation } from '@/core/domain/analytics/report';
import { analyzeReportAction } from '@/presentation/actions/reports';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

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
  const left = Math.max(0, max - used);
  const exhausted = left === 0;

  function analyze() {
    setError(null);
    startTransition(async () => {
      const result = await analyzeReportAction(from, to);
      if (result.ok) {
        setCards(result.value.cards);
        setUsed(result.value.used);
        sileo.success({ title: t('toasts.success') });
      } else {
        if (result.error === 'QUOTA_EXHAUSTED') {
          setUsed(max);
          sileo.warning({ title: t('errors.QUOTA_EXHAUSTED') });
        } else {
          sileo.error({ title: t(`errors.${result.error}`) });
        }
        setError(result.error);
      }
    });
  }

  return (
    <section
      aria-labelledby="ai-title"
      className={cn(
        'flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0',
        cards.length === 0 && 'print:hidden',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tabular-nums',
              exhausted
                ? 'bg-error/12 text-error-ink'
                : left <= 3
                  ? 'bg-amber/12 text-amber-ink'
                  : 'bg-paper-deep text-ink-soft',
            )}
          >
            {t('quota', { left, max })}
          </span>
          {exhausted ? (
            <Link
              href="/settings/subscription"
              className="text-xs font-medium text-link-active hover:underline"
            >
              {t('upgradeLink')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="primary" onClick={analyze} disabled={pending || exhausted}>
          {pending ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <SparklesIcon aria-hidden="true" />
          )}
          <span className="grid place-items-center">
            <span className={cn('col-start-1 row-start-1', pending && 'invisible')}>
              {t('analyze')}
            </span>
            <span className={cn('col-start-1 row-start-1', !pending && 'invisible')}>
              {t('analyzing')}
            </span>
          </span>
        </Button>
        <p className="text-[13px] text-ink-soft">{t('privacy')}</p>
      </div>

      {error ? (
        <Notice tone={error === 'QUOTA_EXHAUSTED' ? 'warning' : 'error'}>
          <p>{t(`errors.${error}`)}</p>
        </Notice>
      ) : null}

      {pending ? (
        <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="size-8 shrink-0 animate-pulse rounded-full bg-paper-deep motion-reduce:animate-none" />
                <span className="h-4 w-3/5 animate-pulse rounded-field bg-paper-deep motion-reduce:animate-none" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="h-3 w-full animate-pulse rounded-field bg-paper-deep motion-reduce:animate-none" />
                <span className="h-3 w-4/5 animate-pulse rounded-field bg-paper-deep motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      ) : cards.length > 0 ? (
        <ul aria-live="polite" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => (
            <li
              key={index}
              className="flex break-inside-avoid flex-col gap-2.5 rounded-card border border-line bg-surface p-4 text-ink"
            >
              <p className="flex items-center gap-2.5 font-semibold text-ink">
                <span
                  aria-hidden="true"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink"
                >
                  <LightbulbIcon className="size-4" />
                </span>
                <span>{card.title}</span>
              </p>
              <p className="text-sm leading-relaxed text-ink-soft">{card.body}</p>
            </li>
          ))}
        </ul>
      ) : !error ? (
        <p className="rounded-field border border-line bg-paper px-4 py-3.5 text-sm text-ink-soft print:hidden">
          {t('prePrompt')}
        </p>
      ) : null}
    </section>
  );
}
