import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, ReceiptTextIcon } from 'lucide-react';
import type { ReportAnalytics, ReportSummary } from '@/core/domain/analytics/report';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { formatMoney, Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

function computeDelta(
  current: MoneyValue,
  previous: MoneyValue,
): {
  pct: number;
  direction: 'up' | 'down' | 'flat';
} | null {
  if (previous.isZero() || previous.isNegative()) return null;
  const pct = current
    .minus(previous)
    .decimal()
    .dividedBy(previous.decimal())
    .times(100)
    .toDecimalPlaces(1)
    .toNumber();
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return { pct, direction };
}

/** Resumen ejecutivo del período: trío de indicadores clave y desglose de 6 cifras. */
export async function ReportKpis({
  report,
  analytics,
  storeName,
  fromFormatted,
  toFormatted,
  canSell,
}: {
  report: ReportSummary;
  analytics: ReportAnalytics;
  storeName: string;
  fromFormatted: string;
  toFormatted: string;
  canSell: boolean;
}) {
  const t = await getTranslations('Reports');

  const cashMoney = MoneyValue.of(report.cashSales, 'PEN');
  const creditMoney = MoneyValue.of(report.creditSales, 'PEN');
  const totalSalesMoney = cashMoney.plus(creditMoney);
  const marginMoney = MoneyValue.of(report.grossMargin, 'PEN');

  const prevTotalMoney = MoneyValue.of(analytics.previousSummary.cashSales, 'PEN').plus(
    MoneyValue.of(analytics.previousSummary.creditSales, 'PEN'),
  );
  const salesDelta = computeDelta(totalSalesMoney, prevTotalMoney);

  const cashPct = totalSalesMoney.isPositive()
    ? Math.round(cashMoney.decimal().dividedBy(totalSalesMoney.decimal()).times(100).toNumber())
    : 0;
  const creditPct = totalSalesMoney.isPositive() ? 100 - cashPct : 0;

  const marginPct = totalSalesMoney.isPositive()
    ? marginMoney
        .decimal()
        .dividedBy(totalSalesMoney.decimal())
        .times(100)
        .toDecimalPlaces(1)
        .toNumber()
    : 0;

  const collectionsMoney = MoneyValue.of(analytics.collections.totalCollected, 'PEN');
  const purchasesMoney = MoneyValue.of(analytics.purchasesTotal, 'PEN');
  const realIncomeMoney = cashMoney.plus(collectionsMoney);
  const netCashFlowMoney = realIncomeMoney.minus(purchasesMoney);

  const figures = [
    { key: 'cashSales', amount: report.cashSales },
    { key: 'creditSales', amount: report.creditSales },
    { key: 'compensatoryInterest', amount: report.compensatoryInterest },
    { key: 'moratoryInterest', amount: report.moratoryInterest },
    { key: 'costOfSales', amount: report.costOfSales },
    { key: 'grossMargin', amount: report.grossMargin },
  ] as const;

  return (
    // US20 crit. 1 y 6: este bloque es el que se imprime o se guarda como PDF
    <section
      aria-labelledby="report-title"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-title" className="text-lg font-semibold text-ink">
          {t('reportTitle', { store: storeName })}
        </h2>
        <p className="text-sm text-ink-soft tabular-nums">
          {t('range', { from: fromFormatted, to: toFormatted })} ·{' '}
          {t('salesCount', { count: report.salesCount })}
        </p>
      </div>

      {/* Trío ejecutivo */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* 1. Ventas totales + barra contado/fiado + variación */}
        <div className="flex break-inside-avoid flex-col justify-between gap-3 rounded-field border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-ink-soft">{t('hero.totalSalesTitle')}</span>
            {salesDelta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                  salesDelta.direction === 'up'
                    ? 'bg-soft text-soft-ink'
                    : salesDelta.direction === 'down'
                      ? 'bg-error/12 text-error-ink'
                      : 'bg-paper-deep text-ink-soft',
                )}
              >
                {salesDelta.direction === 'up' ? (
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
                ) : salesDelta.direction === 'down' ? (
                  <ArrowDownRightIcon aria-hidden="true" className="size-3.5" />
                ) : (
                  <MinusIcon aria-hidden="true" className="size-3.5" />
                )}
                {salesDelta.pct > 0 ? `+${salesDelta.pct}` : salesDelta.pct} %
                <span className="sr-only"> {t('hero.vsPrevious')}</span>
              </span>
            ) : null}
          </div>

          <Money
            amount={totalSalesMoney.toFixed2()}
            currency="PEN"
            className="text-2xl font-bold tracking-tight text-ink sm:text-3xl"
          />

          <div className="flex flex-col gap-1.5">
            <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-paper-deep">
              {cashPct > 0 ? (
                <div className="h-full bg-success" style={{ width: `${cashPct}%` }} />
              ) : null}
              {creditPct > 0 ? (
                <div className="h-full bg-amber" style={{ width: `${creditPct}%` }} />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-soft tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-success" />
                {t('hero.cashShare', { pct: cashPct })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-amber" />
                {t('hero.creditShare', { pct: creditPct })}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Ganancia bruta + % margen + costo */}
        <div className="flex break-inside-avoid flex-col justify-between gap-3 rounded-field border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-ink-soft">{t('hero.grossMarginTitle')}</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                marginMoney.isNegative()
                  ? 'bg-error/12 text-error-ink'
                  : marginMoney.isPositive()
                    ? 'bg-soft text-soft-ink'
                    : 'bg-paper-deep text-ink-soft',
              )}
            >
              {marginPct} %
            </span>
          </div>

          <Money
            amount={report.grossMargin}
            currency="PEN"
            className={cn(
              'text-2xl font-bold tracking-tight sm:text-3xl',
              marginMoney.isNegative() ? 'text-error-ink' : 'text-ink',
            )}
          />

          <p className="text-[13px] text-ink-soft tabular-nums">
            {t('hero.costLine', { cost: formatMoney(report.costOfSales, 'PEN') })}
          </p>
        </div>

        {/* 3. Flujo de caja real (entradas contado+cobranzas - compras) */}
        <div className="flex break-inside-avoid flex-col justify-between gap-3 rounded-field border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-ink-soft">{t('hero.cashFlowTitle')}</span>
            <span className="inline-flex items-center rounded-full bg-paper-deep px-2 py-0.5 text-xs font-medium text-ink-soft tabular-nums">
              {t('hero.collectionsCount', { count: analytics.collections.paymentsCount })}
            </span>
          </div>

          <Money
            amount={netCashFlowMoney.toFixed2()}
            currency="PEN"
            className={cn(
              'text-2xl font-bold tracking-tight sm:text-3xl',
              netCashFlowMoney.isNegative()
                ? 'text-error-ink'
                : netCashFlowMoney.isPositive()
                  ? 'text-success-ink'
                  : 'text-ink',
            )}
          />

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-ink-soft tabular-nums">
            <span>
              {t('hero.inflowsLine', { amount: formatMoney(realIncomeMoney.toFixed2(), 'PEN') })}
            </span>
            <span>
              {t('hero.purchasesLine', { amount: formatMoney(analytics.purchasesTotal, 'PEN') })}
            </span>
          </div>
        </div>
      </div>

      {/* Aviso cuando el rango no tiene ventas registradas */}
      {report.salesCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-paper-deep px-4 py-3.5 text-sm print:hidden">
          <div className="flex items-center gap-3">
            <ReceiptTextIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium text-ink">{t('empty.title')}</p>
              <p className="text-[13px] text-ink-soft">{t('empty.body')}</p>
            </div>
          </div>
          {canSell ? (
            <Link href="/sales" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('empty.cta')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Desglose de 6 cifras (conserva etiquetas exactas de US20 crit. 1) */}
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
  );
}
