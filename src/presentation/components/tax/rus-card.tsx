import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { rusProgress, type RusLevel } from '@/core/domain/tax/rus';
import type { RusStatus } from '@/infrastructure/db/queries/tax';
import { formatMoney } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { cn } from '@/presentation/lib/utils';

const BAR: Record<RusLevel, string> = { ok: 'bg-primary', warning: 'bg-amber', over: 'bg-error' };

/** US21: asistente tributario informativo con las ventas y compras del mes frente a los topes. */
export async function RusCard({ status }: { status: RusStatus }) {
  const t = await getTranslations('Tax.rus');
  const rows = status.caps
    ? (['sales', 'purchases'] as const).map((kind) => {
        const used = status[kind];
        const cap = kind === 'sales' ? status.caps!.income : status.caps!.purchases;
        return {
          kind,
          used,
          cap,
          ...rusProgress(MoneyValue.of(used, 'PEN'), MoneyValue.of(cap, 'PEN')),
        };
      })
    : [];
  const alert = rows.find((row) => row.level === 'over') ?? rows.find((r) => r.level !== 'ok');

  return (
    <section
      aria-labelledby="rus-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rus-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>
        <span className="text-sm text-ink-soft">
          {t('category', { category: status.category })}
        </span>
      </div>

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
    </section>
  );
}
