import { useTranslations } from 'next-intl';
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import type { ScoreBand } from '@/core/domain/credit/credit-score';
import { cn } from '@/presentation/lib/utils';

// DESIGN.md §2.4: Verde = al día, Ámbar = en riesgo, Rojo = moroso; el color nunca va solo
const STYLES: Record<ScoreBand, string> = {
  GREEN: 'bg-success/12 text-success-ink',
  YELLOW: 'bg-amber/12 text-amber-ink',
  RED: 'bg-error/12 text-error-ink',
};
const ICONS = { GREEN: CircleCheckIcon, YELLOW: TriangleAlertIcon, RED: CircleAlertIcon };

/** US19 crit. 2: puntaje de 0 a 100 con su categoría en texto. */
export function ScoreBadge({
  score,
  band,
  hasHistory,
}: {
  score: number;
  band: ScoreBand;
  hasHistory: boolean;
}) {
  const t = useTranslations('Portfolio.score');
  const Icon = ICONS[band];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap tabular-nums',
        STYLES[band],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {hasHistory ? t('value', { score, band: t(`bands.${band}`) }) : t('noHistory')}
    </span>
  );
}
