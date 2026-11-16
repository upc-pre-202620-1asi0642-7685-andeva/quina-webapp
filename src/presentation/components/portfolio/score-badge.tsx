'use client';

import { useTranslations } from 'next-intl';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { CreditScoreBreakdown, ScoreBand } from '@/core/domain/credit/credit-score';
import { Popover, PopoverContent, PopoverTrigger } from '@/presentation/components/ui/popover';
import { cn } from '@/presentation/lib/utils';

// DESIGN.md §2.4: Verde = al día, Ámbar = en riesgo, Rojo = moroso; sin historial = neutro
const STYLES: Record<ScoreBand, string> = {
  GREEN: 'bg-success/12 text-success-ink',
  YELLOW: 'bg-amber/12 text-amber-ink',
  RED: 'bg-error/12 text-error-ink',
};
const ICONS = { GREEN: CircleCheckIcon, YELLOW: TriangleAlertIcon, RED: CircleAlertIcon };

/** US19 crit. 2: puntaje de 0 a 100 con su categoría en texto (neutro si aún no hay historial). */
export function ScoreBadge({
  score,
  band,
  hasHistory,
  className,
}: {
  score: number;
  band: ScoreBand;
  hasHistory: boolean;
  className?: string;
}) {
  const t = useTranslations('Portfolio.score');
  const Icon = hasHistory ? ICONS[band] : CircleDashedIcon;
  const style = hasHistory ? STYLES[band] : 'bg-paper-deep text-ink-soft';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap tabular-nums',
        style,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {hasHistory ? t('value', { score, band: t(`bands.${band}`) }) : t('noHistory')}
    </span>
  );
}

/** Insignia interactiva con desglose de puntualidad, atrasos y días en mora (US19). */
export function ScoreBreakdownPopover({
  breakdown,
  suggestLowerLimit = false,
}: {
  breakdown: CreditScoreBreakdown;
  suggestLowerLimit?: boolean;
}) {
  const t = useTranslations('Portfolio.score');
  const label = breakdown.hasHistory
    ? t('breakdownTrigger', { score: breakdown.score, band: t(`bands.${breakdown.band}`) })
    : t('breakdownTriggerNoHistory');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="-my-2 inline-flex min-h-11 cursor-pointer items-center rounded-full py-2 text-left transition-transform duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-link-active active:scale-[0.97]"
        >
          <ScoreBadge
            score={breakdown.score}
            band={breakdown.band}
            hasHistory={breakdown.hasHistory}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 rounded-card border border-line bg-surface p-4 text-ink shadow-float"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
            <span className="text-sm font-semibold text-ink">{t('breakdown.title')}</span>
            <ScoreBadge
              score={breakdown.score}
              band={breakdown.band}
              hasHistory={breakdown.hasHistory}
            />
          </div>

          {breakdown.hasHistory ? (
            <>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">{t('breakdown.onTimeCycles')}</dt>
                  <dd className="font-semibold text-success-ink tabular-nums">
                    {breakdown.onTimeCycles}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">{t('breakdown.lateCycles')}</dt>
                  <dd
                    className={cn(
                      'font-semibold tabular-nums',
                      breakdown.lateCycles > 0 ? 'text-error-ink' : 'text-ink',
                    )}
                  >
                    {breakdown.lateCycles}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">{t('breakdown.daysLate')}</dt>
                  <dd
                    className={cn(
                      'font-semibold tabular-nums',
                      breakdown.daysLate > 0 ? 'text-error-ink' : 'text-ink',
                    )}
                  >
                    {breakdown.daysLate}
                  </dd>
                </div>
              </dl>
              <p className="text-[13px] text-ink-soft">{t('breakdown.formula')}</p>
            </>
          ) : (
            <p className="text-[13px] text-ink-soft">{t('breakdown.noHistoryNote')}</p>
          )}

          {suggestLowerLimit ? (
            <p className="rounded-field bg-error/12 px-2.5 py-1.5 text-[13px] font-medium text-error-ink">
              {t('breakdown.suggestLower')}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
