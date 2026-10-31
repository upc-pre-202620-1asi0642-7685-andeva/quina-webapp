import { getTranslations } from 'next-intl/server';
import { RatePercent } from '@/core/domain/credit/rate-percent';
import { listRateCaps } from '@/infrastructure/db/queries/platform';
import { requirePlatformAdmin } from '@/presentation/auth/guards';
import { RateCapForm } from '@/presentation/components/platform/rate-cap-form';
import { formatDate } from '@/presentation/lib/format-date';

// Las fechas de vigencia son días de Lima: se muestran al mediodía para no cruzar de día
const dateOf = (iso: string) => formatDate(new Date(`${iso}T12:00:00-05:00`));

export default async function RateCapsPage() {
  await requirePlatformAdmin('/platform/rate-caps');
  const t = await getTranslations('Platform.caps');
  const caps = await listRateCaps();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{t('historyTitle')}</h2>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {caps.map((cap) => (
            <li key={cap.id} className="flex flex-col gap-1 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">
                  {t(`kinds.${cap.kind as 'COMPENSATORY'}`)} ·{' '}
                  {t(`currencies.${cap.currency as 'PEN'}`)}
                </p>
                <p className="text-lg font-semibold text-ink tabular-nums">
                  {t('rate', { percent: RatePercent.fromFraction(cap.maxEffectiveAnnualRate) })}
                </p>
              </div>
              <p className="text-sm text-ink-soft">
                {cap.validTo
                  ? t('period', { from: dateOf(cap.validFrom), to: dateOf(cap.validTo) })
                  : t('inForce', { from: dateOf(cap.validFrom) })}
              </p>
              <p className="text-[13px] text-ink-soft">{cap.source}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">{t('form.title')}</h2>
          <p className="text-sm text-ink-soft">{t('form.subtitle')}</p>
        </div>
        <RateCapForm />
      </section>
    </div>
  );
}
