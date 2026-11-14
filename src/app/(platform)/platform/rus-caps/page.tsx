import { getTranslations } from 'next-intl/server';
import { listRusCaps } from '@/infrastructure/db/queries/platform';
import { requirePlatformAdmin } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { RusCapForm } from '@/presentation/components/platform/rus-cap-form';
import { formatDate } from '@/presentation/lib/format-date';

// Las fechas de vigencia son días de Lima: se muestran al mediodía para no cruzar de día
const dateOf = (iso: string) => formatDate(new Date(`${iso}T12:00:00-05:00`));

export default async function RusCapsPage() {
  await requirePlatformAdmin('/platform/rus-caps');
  const t = await getTranslations('Platform.rusCaps');
  const caps = await listRusCaps();

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
              <p className="font-medium text-ink">{t('category', { category: cap.category })}</p>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">{t('income')}</dt>
                  <dd>
                    <Money amount={cap.monthlyIncomeCap} currency="PEN" className="text-ink" />
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">{t('purchases')}</dt>
                  <dd>
                    <Money amount={cap.monthlyPurchasesCap} currency="PEN" className="text-ink" />
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-ink-soft">
                {cap.validTo
                  ? t('period', { from: dateOf(cap.validFrom), to: dateOf(cap.validTo) })
                  : t('inForce', { from: dateOf(cap.validFrom) })}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">{t('form.title')}</h2>
          <p className="text-sm text-ink-soft">{t('form.subtitle')}</p>
        </div>
        <RusCapForm />
      </section>
    </div>
  );
}
