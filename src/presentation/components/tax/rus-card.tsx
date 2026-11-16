import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { rusProgress, type RusLevel } from '@/core/domain/tax/rus';
import type { RusStatus } from '@/infrastructure/db/queries/tax';
import { formatMoney } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { cn } from '@/presentation/lib/utils';

const BAR: Record<RusLevel, string> = { ok: 'bg-primary', warning: 'bg-amber', over: 'bg-error' };

/** US21: asistente tributario informativo con las ventas y compras del mes frente a los topes. */
export async function RusCard({
  status,
  embedded = false,
}: {
  status: RusStatus;
  embedded?: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('Tax.rus'), getLocale()]);
  const intlLocale = locale === 'qu' ? 'es-PE' : locale;
  const rawMonth = new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date());
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

  const rows = status.caps
    ? (['sales', 'purchases'] as const).map((kind) => {
        const used = status[kind];
        const cap = kind === 'sales' ? status.caps!.income : status.caps!.purchases;
        const usedMoney = MoneyValue.of(used, 'PEN');
        const capMoney = MoneyValue.of(cap, 'PEN');
        const diff = capMoney.minus(usedMoney);
        const over = diff.isNegative();
        const headroomAmount = formatMoney(
          (over ? usedMoney.minus(capMoney) : diff).toFixed2(),
          'PEN',
        );
        return {
          kind,
          used,
          cap,
          over,
          headroomAmount,
          ...rusProgress(usedMoney, capMoney),
        };
      })
    : [];
  const alert = rows.find((row) => row.level === 'over') ?? rows.find((r) => r.level !== 'ok');

  const body = (
    <>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex w-fit rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
            {t('category', { category: status.category })}
          </span>
          <span className="text-xs text-ink-soft tabular-nums">{monthLabel}</span>
        </div>
      ) : null}

      {status.caps ? (
        <>
          {alert ? (
            <Notice tone={alert.level === 'over' ? 'error' : 'warning'}>
              <p>{t(`alerts.${alert.level as 'warning' | 'over'}.${alert.kind}`)}</p>
            </Notice>
          ) : null}
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li key={row.kind} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-ink">{t(`${row.kind}Label`)}</span>
                  <span className="font-semibold text-ink tabular-nums">
                    {t('usedOf', {
                      used: formatMoney(row.used, 'PEN'),
                      cap: formatMoney(row.cap, 'PEN'),
                      percent: row.percent,
                    })}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={t(`${row.kind}Label`)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(row.percent, 100)}
                  aria-valuetext={t('meterText', { percent: row.percent })}
                  className="h-2 overflow-hidden rounded-full bg-paper-deep"
                >
                  <div
                    className={cn('h-full rounded-full', BAR[row.level])}
                    style={{ width: `${Math.min(row.percent, 100)}%` }}
                  />
                </div>
                <p
                  className={cn(
                    'text-xs tabular-nums',
                    row.over
                      ? 'font-medium text-error-ink'
                      : row.level === 'warning'
                        ? 'font-medium text-amber-ink'
                        : 'text-ink-soft',
                  )}
                >
                  {row.over
                    ? t('exceededBy', { amount: row.headroomAmount })
                    : t('remaining', { amount: row.headroomAmount })}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-soft">{t('noCap')}</p>
      )}

      <p className="text-[13px] text-ink-soft">
        {t('disclaimer')}{' '}
        <Link href="/settings#tax" className="font-medium text-link-active hover:underline">
          {t('changeCategory')}
        </Link>
      </p>
    </>
  );

  if (embedded) return <div className="flex flex-1 flex-col justify-between gap-4">{body}</div>;

  return (
    <section
      aria-labelledby="rus-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rus-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>
        <div className="flex flex-wrap items-baseline gap-2 text-sm text-ink-soft">
          <span>{t('category', { category: status.category })}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{monthLabel}</span>
        </div>
      </div>
      {body}
    </section>
  );
}
