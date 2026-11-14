import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LockIcon } from 'lucide-react';
import { quotaPeriod } from '@/core/application/analytics/analyze-report';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { loadReport } from '@/infrastructure/db/queries/reports';
import { DrizzleAIQuotaRepository } from '@/infrastructure/db/repositories/drizzle-ai-quota-repository';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { AiRecommendations } from '@/presentation/components/reports/ai-recommendations';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { formatDate } from '@/presentation/lib/format-date';
import { parseReportRange } from '@/presentation/lib/report-range';
import { loadStoreContext } from '@/presentation/queries/store-context';

// Las fechas del rango son días de Lima: se muestran al mediodía para no cruzar de día
const dateOf = (iso: string) => formatDate(new Date(`${iso}T12:00:00-05:00`));

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireStoreUser('/reports', 'reports.view');
  const t = await getTranslations('Reports');
  const tPlans = await getTranslations('Plans');
  const params = await searchParams;
  const now = new Date();
  const store = await loadStoreContext(user.storeId);
  const limits = PlanLimits.of(store.tier);

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
      <p className="text-sm text-ink-soft">{t('subtitle')}</p>
    </header>
  );

  // D1: los reportes por rango son de Pro y Plus
  if (!limits.features.reportsExport) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className="flex items-start gap-3 rounded-card border border-line bg-surface p-6 text-sm text-ink-soft">
          <LockIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>
            {t('locked', { plan: tPlans(`names.${PlanLimits.featureTier('reportsExport')}`) })}{' '}
            <Link href="/settings#plans" className="font-medium text-link-active hover:underline">
              {t('seePlans')}
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const asked = parseReportRange(params.from, params.to, now);
  const invalid = Boolean((params.from || params.to) && !asked);
  const range = asked ?? parseReportRange(undefined, undefined, now)!;
  const from = BusinessDate.toISO(range.from);
  const to = BusinessDate.toISO(range.to);
  const maxQueries = limits.aiQueriesPerMonth ?? 0;
  const [report, used] = await Promise.all([
    loadReport(user.storeId, range.from, range.to),
    limits.features.ai
      ? new DrizzleAIQuotaRepository().used(user.storeId, quotaPeriod(now))
      : Promise.resolve(0),
  ]);

  const figures = [
    { key: 'cashSales', amount: report.cashSales },
    { key: 'creditSales', amount: report.creditSales },
    { key: 'compensatoryInterest', amount: report.compensatoryInterest },
    { key: 'moratoryInterest', amount: report.moratoryInterest },
    { key: 'costOfSales', amount: report.costOfSales },
    { key: 'grossMargin', amount: report.grossMargin },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Form action="" className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-from" className="text-sm font-medium text-ink">
            {t('from')}
          </label>
          <Input id="report-from" name="from" type="date" defaultValue={from} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-to" className="text-sm font-medium text-ink">
            {t('to')}
          </label>
          <Input id="report-to" name="to" type="date" defaultValue={to} required />
        </div>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          {t('submit')}
        </button>
        <PrintButton label={t('print')} />
      </Form>
      {invalid ? (
        <Notice tone="warning">
          <p>{t('rangeInvalid')}</p>
        </Notice>
      ) : null}

      {/* US20 crit. 1 y 6: este bloque es el que se imprime o se guarda como PDF */}
      <section
        aria-labelledby="report-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="report-title" className="text-lg font-semibold text-ink">
            {t('reportTitle', { store: store.name })}
          </h2>
          <p className="text-sm text-ink-soft">
            {t('range', { from: dateOf(from), to: dateOf(to) })} ·{' '}
            {t('salesCount', { count: report.salesCount })}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {figures.map((figure) => (
            <div
              key={figure.key}
              className="flex break-inside-avoid flex-col gap-1 rounded-field bg-paper-deep px-3 py-2.5"
            >
              <dt className="text-[13px] text-ink-soft">{t(`figures.${figure.key}`)}</dt>
              <dd>
                <Money
                  amount={figure.amount}
                  currency="PEN"
                  className="text-lg font-semibold text-ink"
                />
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-ink-soft">{t('note')}</p>
      </section>

      <section
        aria-labelledby="ai-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0"
      >
        <h2 id="ai-title" className="text-lg font-semibold text-ink">
          {t('ai.title')}
        </h2>
        {limits.features.ai && maxQueries > 0 ? (
          <AiRecommendations
            key={`${from}:${to}`}
            from={from}
            to={to}
            used={used}
            max={maxQueries}
          />
        ) : (
          <p className="text-sm text-ink-soft">
            {t('ai.locked', { plan: tPlans(`names.${PlanLimits.featureTier('ai')}`) })}
          </p>
        )}
      </section>
    </div>
  );
}
