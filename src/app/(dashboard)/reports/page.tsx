import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BarChart3Icon, LockIcon, PackageIcon, PrinterIcon, SparklesIcon } from 'lucide-react';
import { quotaPeriod } from '@/core/application/analytics/analyze-report';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { loadReport, loadReportAnalytics } from '@/infrastructure/db/queries/reports';
import { loadRusStatus } from '@/infrastructure/db/queries/tax';
import { DrizzleAIQuotaRepository } from '@/infrastructure/db/repositories/drizzle-ai-quota-repository';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Notice } from '@/presentation/components/notice';
import { AiRecommendations } from '@/presentation/components/reports/ai-recommendations';
import {
  ReportPaymentMethodsChart,
  ReportPerformanceChart,
} from '@/presentation/components/reports/report-charts';
import { ReportKpis } from '@/presentation/components/reports/report-kpis';
import { ReportProductsSection } from '@/presentation/components/reports/report-products-section';
import { ReportToolbar } from '@/presentation/components/reports/report-toolbar';
import { RusCard } from '@/presentation/components/tax/rus-card';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { detectReportPreset, parseReportRange } from '@/presentation/lib/report-range';
import { loadStoreContext } from '@/presentation/queries/store-context';

// Las fechas del rango son días de Lima: se muestran al mediodía para no cruzar de día
const dateOf = (iso: string) => formatDate(new Date(`${iso}T12:00:00-05:00`));

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireStoreUser('/reports', 'reports.view');
  const [t, tPlans, params, store] = await Promise.all([
    getTranslations('Reports'),
    getTranslations('Plans'),
    searchParams,
    loadStoreContext(user.storeId),
  ]);
  const now = new Date();
  const limits = PlanLimits.of(store.tier);
  const canViewRus = can(user.role, 'rus.view');

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
      <p className="text-sm text-ink-soft">{t('subtitle')}</p>
    </header>
  );

  // D1: los reportes por rango son de Pro y Plus; el asistente del Nuevo RUS sí se muestra en Casero
  if (!limits.features.reportsExport) {
    const rusStatus = canViewRus ? await loadRusStatus(user.storeId, now) : null;
    const proPlanName = tPlans(`names.${PlanLimits.featureTier('reportsExport')}`);
    const previewFeatures = [
      { key: 'charts', icon: BarChart3Icon },
      { key: 'products', icon: PackageIcon },
      { key: 'print', icon: PrinterIcon },
      { key: 'ai', icon: SparklesIcon },
    ] as const;

    return (
      <div className="flex flex-col gap-6">
        {header}

        <section
          aria-labelledby="reports-locked-title"
          className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink-soft"
              >
                <LockIcon className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 id="reports-locked-title" className="text-lg font-semibold text-ink">
                  {t('lockedTitle', { plan: proPlanName })}
                </h2>
                <p className="text-sm text-ink-soft">{t('locked', { plan: proPlanName })}</p>
              </div>
            </div>

            <Link href="/settings/subscription" className={buttonVariants({ variant: 'primary' })}>
              {t('seePlans')}
            </Link>
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {previewFeatures.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-start gap-3 rounded-field border border-line bg-paper p-3.5"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink"
                >
                  <Icon className="size-4" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">
                    {t(`previewFeatures.${key}.title`)}
                  </span>
                  <span className="text-[13px] text-ink-soft">
                    {t(`previewFeatures.${key}.body`)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {rusStatus ? <RusCard status={rusStatus} /> : null}
      </div>
    );
  }

  const asked = parseReportRange(params.from, params.to, now);
  const invalid = Boolean((params.from || params.to) && !asked);
  const range = asked ?? parseReportRange(undefined, undefined, now)!;
  const from = BusinessDate.toISO(range.from);
  const to = BusinessDate.toISO(range.to);
  const activePreset = detectReportPreset(range, now);
  const maxQueries = limits.aiQueriesPerMonth ?? 0;

  const [report, analytics, used, rusStatus] = await Promise.all([
    loadReport(user.storeId, range.from, range.to),
    loadReportAnalytics(user.storeId, range.from, range.to),
    limits.features.ai
      ? new DrizzleAIQuotaRepository().used(user.storeId, quotaPeriod(now))
      : Promise.resolve(0),
    canViewRus ? loadRusStatus(user.storeId, now) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {header}

      <ReportToolbar from={from} to={to} activePreset={activePreset} printLabel={t('print')} />

      {invalid ? (
        <Notice tone="warning" className="print:hidden">
          <p>{t('rangeInvalid')}</p>
        </Notice>
      ) : null}

      <ReportKpis
        report={report}
        analytics={analytics}
        storeName={store.name}
        fromFormatted={dateOf(from)}
        toFormatted={dateOf(to)}
        canSell={can(user.role, 'sales.create')}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ReportPerformanceChart dailySeries={analytics.dailySeries} />
        <ReportPaymentMethodsChart paymentMethods={analytics.paymentMethods} />
      </div>

      <ReportProductsSection
        topProducts={analytics.topProducts}
        byCategory={analytics.byCategory}
      />

      {limits.features.ai && maxQueries > 0 ? (
        <AiRecommendations key={`${from}:${to}`} from={from} to={to} used={used} max={maxQueries} />
      ) : (
        <section
          aria-labelledby="ai-title"
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 sm:p-6 print:hidden"
        >
          <h2 id="ai-title" className="text-lg font-semibold text-ink">
            {t('ai.title')}
          </h2>
          <p className="text-sm text-ink-soft">
            {t('ai.locked', { plan: tPlans(`names.${PlanLimits.featureTier('ai')}`) })}
          </p>
        </section>
      )}

      {rusStatus ? <RusCard status={rusStatus} /> : null}
    </div>
  );
}
