import { cache } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  AwardIcon,
  BadgeCheckIcon,
  BanknoteIcon,
  CalendarRangeIcon,
  ChartColumnIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  CreditCardIcon,
  HandCoinsIcon,
  HistoryIcon,
  MailIcon,
  PackageIcon,
  ShoppingBasketIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UsersIcon,
  WalletIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import { PlanLimits, COUNTED_RESOURCES } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Dec } from '@/core/domain/shared/decimal';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { listProducts } from '@/infrastructure/db/queries/catalog';
import { listCollections, listTodayNotices } from '@/infrastructure/db/queries/collections';
import {
  loadDailyCashFlow,
  loadDailyPerformance,
  loadRecentSales,
  loadSalesByPaymentMethod,
  loadTopProducts,
} from '@/infrastructure/db/queries/dashboard-analytics';
import { loadPortfolio } from '@/infrastructure/db/queries/portfolio';
import { listDraftPurchaseOrders } from '@/infrastructure/db/queries/purchases';
import { loadReport } from '@/infrastructure/db/queries/reports';
import { loadDailySales, loadTodayCashBox } from '@/infrastructure/db/queries/sales';
import { loadRusStatus } from '@/infrastructure/db/queries/tax';
import { ReplenishButton } from '@/presentation/components/catalog/replenish-button';
import { Money } from '@/presentation/components/money';
import { ScoreBadge } from '@/presentation/components/portfolio/score-badge';
import { quickActions } from '@/presentation/components/shell/nav-items';
import { RusCard } from '@/presentation/components/tax/rus-card';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';
import { BentoList, CashMixBar } from './dashboard-bento-helpers';
import {
  CashFlowChart,
  MarginTrendChart,
  PaymentMethodsChart,
  PortfolioTrendChart,
} from './dashboard-charts';
import { SalesWeekChart } from './sales-week-chart';
import type { WidgetId } from './widgets';

export type WidgetProps = { storeId: string; role: Role; now: Date };

const COMPACT_LIMIT = 3;
const EXPANDED_LIMIT = 8;
const DUE_SOON_DAYS = 3;

// Los widgets de cartera comparten una sola consulta por petición
const portfolioOf = cache(loadPortfolio);

const sumPen = (amounts: string[]) =>
  MoneyValue.sum(
    amounts.map((a) => MoneyValue.of(a, 'PEN')),
    'PEN',
  ).toFixed2();

/** Marco común de cada widget (DESIGN.md §6): tarjeta, ícono, título y "Ver todo". */
export async function WidgetCard({
  id,
  icon: Icon,
  href,
  children,
  className,
}: {
  id: WidgetId;
  icon: LucideIcon;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = await getTranslations('Dashboard.widgets');
  return (
    <section
      aria-labelledby={`widget-${id}`}
      className={cn(
        'flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id={`widget-${id}`} className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
          <span className="truncate">{t(`${id}.title`)}</span>
        </h2>
        {href ? (
          <Link
            href={href}
            className="-my-2 inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-medium text-link-active hover:underline"
          >
            {t('seeAll')}
            <span className="sr-only">: {t(`${id}.title`)}</span>
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

// DESIGN.md §2.4: el color de alerta solo aparece cuando hay algo que atender
const TONES = {
  error: 'bg-error/12 text-error-ink',
  amber: 'bg-amber/12 text-amber-ink',
  neutral: 'bg-paper-deep text-ink-soft',
} as const;

function Stat({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-field px-3 py-2', TONES[tone])}>
      <dt className="text-[13px]">{label}</dt>
      <dd>
        <Money
          amount={amount}
          currency="PEN"
          className={cn('font-semibold', tone === 'neutral' && 'text-ink')}
        />
      </dd>
    </div>
  );
}

function Empty({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex flex-1 items-center gap-2 rounded-field bg-paper-deep px-4 py-5 text-sm text-ink-soft">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-success" />
      {children}
    </p>
  );
}

async function QuickActionsWidget({ role }: WidgetProps) {
  const t = await getTranslations('Shell.create');
  const tNav = await getTranslations('Shell.nav');
  const actions = quickActions(role);
  return (
    <WidgetCard id="quickActions" icon={ZapIcon}>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            // Una sola acción principal en verde por pantalla (DESIGN.md §12)
            className={buttonVariants({
              variant: action.key === 'newSale' ? 'primary' : 'secondary',
            })}
          >
            {action.key === 'newSale' ? <ShoppingBasketIcon aria-hidden="true" /> : null}
            {t(action.key)}
          </Link>
        ))}
        {can(role, 'payments.create') ? (
          <Link href="/collections" className={buttonVariants({ variant: 'secondary' })}>
            <HandCoinsIcon aria-hidden="true" />
            {tNav('collections')}
          </Link>
        ) : null}
      </div>
    </WidgetCard>
  );
}

async function CollectWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.collect');
  const rows = await listCollections(storeId);
  const today = BusinessDate.fromInstant(now);
  const withDays = rows.map((row) => ({
    ...row,
    days: BusinessDate.daysBetween(today, BusinessDate.fromInstant(row.paymentDueDate)),
  }));
  const overdue = withDays.filter((row) => row.status === 'OVERDUE');
  const soon = withDays.filter((row) => row.status === 'BILLED' && row.days <= DUE_SOON_DAYS);
  const all = [...overdue, ...soon];
  const list = all.slice(0, EXPANDED_LIMIT);
  const pen = (items: typeof rows) =>
    sumPen(items.filter((r) => r.currency === 'PEN').map((r) => r.totalDue));

  return (
    <WidgetCard id="collect" icon={HandCoinsIcon} href="/collections">
      <dl className="grid grid-cols-2 gap-3">
        <Stat
          label={t('overdue', { count: overdue.length })}
          amount={pen(overdue)}
          tone={overdue.length ? 'error' : 'neutral'}
        />
        <Stat
          label={t('soon', { count: soon.length })}
          amount={pen(soon)}
          tone={soon.length ? 'amber' : 'neutral'}
        />
      </dl>
      {list.length === 0 ? (
        <Empty icon={CircleCheckIcon}>{t('empty')}</Empty>
      ) : (
        <BentoList
          items={list.map((row) => (
            <li key={row.cycleId} className="flex items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/customers/${row.customerId}`}
                  className="truncate text-sm font-medium text-ink hover:underline"
                >
                  {row.name}
                </Link>
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    row.status === 'OVERDUE' ? 'text-error-ink' : 'text-amber-ink',
                  )}
                >
                  {row.status === 'OVERDUE'
                    ? t('lateBy', { days: Math.max(1, -row.days) })
                    : t('dueIn', { days: Math.max(0, row.days) })}
                </span>
              </div>
              <Money amount={row.totalDue} currency={row.currency} className="text-sm text-ink" />
              <Link
                href={`/customers/${row.customerId}/pay`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                {t('collectAction')}
                <span className="sr-only">: {row.name}</span>
              </Link>
            </li>
          ))}
        />
      )}
    </WidgetCard>
  );
}

async function CashTodayWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.cashBox');
  const cashBox = await loadTodayCashBox(storeId, now);
  const labels = {
    CASH: t('methods.CASH'),
    YAPE: t('methods.YAPE'),
    PLIN: t('methods.PLIN'),
    CARD: t('methods.CARD'),
  };
  const counts = Object.fromEntries(
    cashBox.byMethod.map((r) => [r.method, t('count', { count: r.count })]),
  ) as Record<'CASH' | 'YAPE' | 'PLIN' | 'CARD', string>;

  return (
    <WidgetCard id="cashToday" icon={BanknoteIcon} href="/reports">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Money amount={cashBox.total} currency="PEN" className="text-3xl font-semibold text-ink" />
        <span className="text-sm text-ink-soft tabular-nums">
          {t('count', { count: cashBox.count })}
        </span>
      </div>
      <CashMixBar
        total={cashBox.total}
        byMethod={cashBox.byMethod}
        labels={labels}
        counts={counts}
      />
      <dl className="grid grid-cols-2 gap-2">
        {cashBox.byMethod.map((row) => (
          <div
            key={row.method}
            className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-3 py-2"
          >
            <dt className="text-[13px] text-ink-soft">{labels[row.method]}</dt>
            <dd>
              <Money
                amount={row.total}
                currency="PEN"
                className="text-base font-semibold text-ink"
              />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] text-ink-soft">{t('hint')}</p>
    </WidgetCard>
  );
}

async function SalesWeekWidget({ storeId, now }: WidgetProps) {
  const days = await loadDailySales(storeId, now, 30);
  return (
    <WidgetCard id="salesWeek" icon={ChartColumnIcon} href="/reports">
      <SalesWeekChart days={days} />
    </WidgetCard>
  );
}

async function MoneyOutWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.moneyOut');
  const { metrics } = await portfolioOf(storeId, now);
  return (
    <WidgetCard id="moneyOut" icon={WalletIcon} href="/portfolio">
      <div className="flex flex-col gap-0.5">
        <Money amount={metrics.lent} currency="PEN" className="text-3xl font-semibold text-ink" />
        <span className="text-[13px] text-ink-soft">{t('lentHint')}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <Stat
          label={t('overdue')}
          amount={metrics.overdue}
          tone={MoneyValue.of(metrics.overdue, 'PEN').isZero() ? 'neutral' : 'error'}
        />
        <Stat label={t('projected')} amount={metrics.projected} tone="neutral" />
      </dl>
      <p className="text-sm text-ink-soft tabular-nums">
        {t('delinquent', { count: metrics.delinquentCustomers })}
      </p>
    </WidgetCard>
  );
}

async function RiskCustomersWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.riskCustomers');
  const { rows } = await portfolioOf(storeId, now);
  const risky = rows
    .filter((row) => row.band === 'RED' || row.isDelinquent || row.suggestLowerLimit)
    .sort((a, b) => a.score - b.score);
  const list = risky.slice(0, EXPANDED_LIMIT);

  return (
    <WidgetCard id="riskCustomers" icon={UsersIcon} href="/portfolio">
      {list.length === 0 ? (
        <Empty icon={CircleCheckIcon}>{t('empty')}</Empty>
      ) : (
        <BentoList
          items={list.map((row) => (
            <li key={row.customerId} className="flex items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/customers/${row.customerId}`}
                  className="truncate text-sm font-medium text-ink hover:underline"
                >
                  {row.name}
                </Link>
                <span className="text-[13px] text-ink-soft tabular-nums">
                  {row.suggestLowerLimit ? t('lowerLimit') : t('balance')}{' '}
                  <Money amount={row.currentBalance} currency="PEN" />
                </span>
              </div>
              <ScoreBadge score={row.score} band={row.band} hasHistory={row.hasHistory} />
            </li>
          ))}
        />
      )}
    </WidgetCard>
  );
}

async function LowStockWidget({ storeId, role }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.lowStock');
  const products = await listProducts(storeId, '', { activeOnly: true, lowStockOnly: true });
  const list = products.slice(0, EXPANDED_LIMIT);

  return (
    <WidgetCard id="lowStock" icon={PackageIcon} href="/inventory?filter=low">
      {products.length === 0 ? (
        <Empty icon={CircleCheckIcon}>{t('empty')}</Empty>
      ) : (
        <>
          <BentoList
            moreOnCompact={
              products.length > COMPACT_LIMIT
                ? t('more', { count: products.length - COMPACT_LIMIT })
                : null
            }
            moreOnExpanded={
              products.length > EXPANDED_LIMIT
                ? t('more', { count: products.length - EXPANDED_LIMIT })
                : null
            }
            items={list.map((product) => (
              <li key={product.id} className="flex items-center gap-3 py-2">
                <Link
                  href={`/inventory/${product.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline"
                >
                  {product.name}
                </Link>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap text-amber-ink tabular-nums">
                  <TriangleAlertIcon aria-hidden="true" className="size-3.5" />
                  {t('stockOf', {
                    stock: formatQuantity(product.currentStock),
                    min: formatQuantity(product.minimumStock),
                    unit: product.unitCode,
                  })}
                </span>
              </li>
            ))}
          />
          {can(role, 'purchases.manage') ? <ReplenishButton /> : null}
        </>
      )}
    </WidgetCard>
  );
}

async function RusWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.rus');
  const status = await loadRusStatus(storeId, now);
  return (
    <WidgetCard id="rus" icon={BadgeCheckIcon} href="/settings#tax">
      {status ? (
        <RusCard status={status} embedded />
      ) : (
        <p className="text-sm text-ink-soft">{t('notRus')}</p>
      )}
    </WidgetCard>
  );
}

async function PlanWidget({ storeId }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.plan');
  const tPlans = await getTranslations('Plans');
  const tUsage = await getTranslations('Settings');
  const store = await loadStoreContext(storeId);
  const limits = PlanLimits.of(store.tier);
  const status =
    store.graceDaysRemaining !== null
      ? { text: t('grace', { days: store.graceDaysRemaining }), tone: 'bg-amber/12 text-amber-ink' }
      : store.trialDaysRemaining !== null
        ? { text: t('trial', { days: store.trialDaysRemaining }), tone: 'bg-soft text-soft-ink' }
        : null;
  return (
    <WidgetCard id="plan" icon={BadgeCheckIcon} href="/settings/subscription">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xl font-semibold text-ink">{tPlans(`names.${store.tier}`)}</span>
        {status ? (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-[13px] font-medium tabular-nums',
              status.tone,
            )}
          >
            {status.text}
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-3">
        {COUNTED_RESOURCES.map((resource) => {
          const used = store.usage[resource];
          const max = limits[resource];
          const over = store.overLimitResources.includes(resource);
          const pct = max === null || max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100));
          const barColor = over ? 'bg-error' : pct >= 80 ? 'bg-amber' : 'bg-primary';
          const valueText =
            max === null ? tUsage('usageUnlimited', { used }) : tUsage('usageOf', { used, max });

          return (
            <li key={resource} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-soft">{tUsage(`usage.${resource}`)}</span>
                <span
                  className={cn('font-medium tabular-nums', over ? 'text-error-ink' : 'text-ink')}
                >
                  {valueText}
                </span>
              </div>
              {max !== null ? (
                <div
                  role="meter"
                  aria-label={tUsage(`usage.${resource}`)}
                  aria-valuemin={0}
                  aria-valuemax={max}
                  aria-valuenow={Math.min(used, max)}
                  aria-valuetext={valueText}
                  className="h-1.5 overflow-hidden rounded-full bg-paper-deep"
                >
                  <div
                    className={cn('h-full rounded-full', barColor)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

async function MonthSummaryWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.monthSummary');
  const today = BusinessDate.fromInstant(now);
  const monthStart = BusinessDate.parse(`${BusinessDate.toISO(today).slice(0, 8)}01`);
  const report = await loadReport(storeId, monthStart, today);
  const rows = [
    { key: 'sales', amount: sumPen([report.cashSales, report.creditSales]) },
    { key: 'margin', amount: report.grossMargin },
    { key: 'interest', amount: sumPen([report.compensatoryInterest, report.moratoryInterest]) },
  ] as const;
  return (
    <WidgetCard id="monthSummary" icon={CalendarRangeIcon} href="/reports">
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <dt className="text-sm text-ink-soft">{t(row.key)}</dt>
            <dd>
              <Money
                amount={row.amount}
                currency="PEN"
                className="text-base font-semibold text-ink"
              />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] text-ink-soft tabular-nums">
        {t('count', { count: report.salesCount })}
      </p>
    </WidgetCard>
  );
}

async function PurchaseDraftsWidget({ storeId }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.purchaseDrafts');
  const drafts = await listDraftPurchaseOrders(storeId);
  const list = drafts.slice(0, EXPANDED_LIMIT);
  return (
    <WidgetCard id="purchaseDrafts" icon={ClipboardListIcon} href="/inventory/purchases">
      {drafts.length === 0 ? (
        <Empty icon={CircleCheckIcon}>{t('empty')}</Empty>
      ) : (
        <BentoList
          items={list.map((draft) => (
            <li key={draft.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate font-medium text-ink">
                {draft.supplierName ?? t('noSupplier')}
              </span>
              <span className="text-ink-soft tabular-nums">
                {t('items', { count: draft.items.length })}
              </span>
            </li>
          ))}
        />
      )}
    </WidgetCard>
  );
}

async function NoticesWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.notices');
  const tPage = await getTranslations('Collections.page');
  const notices = await listTodayNotices(storeId, now);
  const list = notices.slice(0, EXPANDED_LIMIT);
  return (
    <WidgetCard id="notices" icon={MailIcon} href="/collections?tab=notices">
      {notices.length === 0 ? (
        <p className="rounded-field bg-paper-deep px-4 py-5 text-sm text-ink-soft">{t('empty')}</p>
      ) : (
        <BentoList
          items={list.map((notice) => (
            <li key={notice.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-ink">
                  {notice.name ?? notice.recipientEmail}
                </span>
                <span className="text-[13px] text-ink-soft">
                  {tPage.has(`noticeType.${notice.type}`)
                    ? tPage(`noticeType.${notice.type}`)
                    : notice.type}
                </span>
              </div>
              <span className="text-[13px] whitespace-nowrap text-ink-soft">
                {tPage.has(`noticeStatus.${notice.status}`)
                  ? tPage(`noticeStatus.${notice.status}`)
                  : notice.status}
              </span>
            </li>
          ))}
        />
      )}
    </WidgetCard>
  );
}

/* =============================================================================
 * 7 nuevos widgets en "Agregar widget"
 * ============================================================================= */

async function CashFlowWidget({ storeId, now }: WidgetProps) {
  const days = await loadDailyCashFlow(storeId, now, 30);
  return (
    <WidgetCard id="cashFlow" icon={ArrowLeftRightIcon} href="/reports">
      <CashFlowChart days={days} />
    </WidgetCard>
  );
}

async function SalesByMethodWidget({ storeId, now }: WidgetProps) {
  const data = await loadSalesByPaymentMethod(storeId, now);
  return (
    <WidgetCard id="salesByMethod" icon={CreditCardIcon} href="/reports">
      <PaymentMethodsChart data={data} />
    </WidgetCard>
  );
}

async function PortfolioTrendWidget({ storeId, now }: WidgetProps) {
  const { months } = await portfolioOf(storeId, now);
  return (
    <WidgetCard id="portfolioTrend" icon={TrendingUpIcon} href="/portfolio">
      <PortfolioTrendChart months={months} />
    </WidgetCard>
  );
}

async function MarginTrendWidget({ storeId, now }: WidgetProps) {
  const days = await loadDailyPerformance(storeId, now, 30);
  return (
    <WidgetCard id="marginTrend" icon={ActivityIcon} href="/reports">
      <MarginTrendChart days={days} />
    </WidgetCard>
  );
}

async function TopProductsWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.topProducts');
  const rows = await loadTopProducts(storeId, now, 30, EXPANDED_LIMIT);
  return (
    <WidgetCard id="topProducts" icon={AwardIcon} href="/inventory">
      {rows.length === 0 ? (
        <Empty icon={PackageIcon}>{t('empty')}</Empty>
      ) : (
        <BentoList
          items={rows.map((item, idx) => (
            <li key={item.productId} className="flex items-center gap-3 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-deep text-xs font-semibold text-ink-soft tabular-nums">
                {idx + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/inventory/${item.productId}`}
                  className="truncate text-sm font-medium text-ink hover:underline"
                >
                  {item.name}
                </Link>
                <span className="text-[13px] text-ink-soft tabular-nums">
                  {formatQuantity(item.quantitySold)} {item.unitCode}
                </span>
              </div>
              <Money
                amount={item.revenue}
                currency="PEN"
                className="text-sm font-semibold text-ink"
              />
            </li>
          ))}
        />
      )}
    </WidgetCard>
  );
}

const saleTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Lima',
});

async function RecentSalesWidget({ storeId }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.recentSales');
  const tm = await getTranslations('Dashboard.widgets.salesByMethod.methods');
  const rows = await loadRecentSales(storeId, EXPANDED_LIMIT);

  return (
    <WidgetCard id="recentSales" icon={HistoryIcon} href="/reports">
      {rows.length === 0 ? (
        <Empty icon={ShoppingBasketIcon}>{t('empty')}</Empty>
      ) : (
        <BentoList
          items={rows.map((sale) => {
            const methodKey = sale.paymentMethod as 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'CREDIT';
            return (
              <li key={sale.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-ink">
                    {sale.customerName ?? t('walkIn')}
                  </span>
                  <span className="text-[13px] text-ink-soft tabular-nums">
                    {tm.has(methodKey) ? tm(methodKey) : sale.paymentMethod} ·{' '}
                    {saleTimeFormatter.format(sale.saleDate)}
                  </span>
                </div>
                <Money
                  amount={sale.totalAmount}
                  currency="PEN"
                  className="text-sm font-semibold text-ink"
                />
              </li>
            );
          })}
        />
      )}
    </WidgetCard>
  );
}

async function CollectionsHealthWidget({ storeId, now }: WidgetProps) {
  const t = await getTranslations('Dashboard.widgets.collectionsHealth');
  const { metrics, rows } = await portfolioOf(storeId, now);
  const lentDec = new Dec(metrics.lent);
  const overdueDec = new Dec(metrics.overdue);
  const overduePct = lentDec.isZero()
    ? 0
    : Math.min(100, Math.round(overdueDec.dividedBy(lentDec).times(100).toNumber()));
  const onTimePct = 100 - overduePct;
  const onTimeAmount = MoneyValue.of(metrics.lent, 'PEN')
    .minus(MoneyValue.of(metrics.overdue, 'PEN'))
    .toFixed2();

  const bands = {
    GREEN: rows.filter((r) => r.band === 'GREEN').length,
    YELLOW: rows.filter((r) => r.band === 'YELLOW').length,
    RED: rows.filter((r) => r.band === 'RED').length,
  };

  return (
    <WidgetCard id="collectionsHealth" icon={HandCoinsIcon} href="/portfolio">
      {rows.length === 0 ? (
        <Empty icon={CircleCheckIcon}>{t('empty')}</Empty>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-semibold text-ink tabular-nums">{onTimePct}%</span>
              <span className="text-xs text-ink-soft tabular-nums">{t('onTimeLabel')}</span>
            </div>
            <div
              role="meter"
              aria-label={t('onTimeLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={onTimePct}
              className="flex h-2.5 overflow-hidden rounded-full bg-paper-deep"
            >
              <div className="h-full bg-success" style={{ width: `${onTimePct}%` }} />
              <div className="h-full bg-error" style={{ width: `${overduePct}%` }} />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            <Stat label={t('currentAmount')} amount={onTimeAmount} tone="neutral" />
            <Stat
              label={t('overdueAmount')}
              amount={metrics.overdue}
              tone={MoneyValue.of(metrics.overdue, 'PEN').isZero() ? 'neutral' : 'error'}
            />
          </dl>

          <ul className="flex flex-wrap gap-2 text-xs">
            <li className="rounded-full bg-soft px-2.5 py-1 font-medium text-soft-ink tabular-nums">
              {t('bands.GREEN', { count: bands.GREEN })}
            </li>
            <li className="rounded-full bg-amber/12 px-2.5 py-1 font-medium text-amber-ink tabular-nums">
              {t('bands.AMBER', { count: bands.YELLOW })}
            </li>
            <li className="rounded-full bg-error/12 px-2.5 py-1 font-medium text-error-ink tabular-nums">
              {t('bands.RED', { count: bands.RED })}
            </li>
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

/** Cada widget trae sus propios datos: solo se consultan los que están a la vista. */
export const WIDGET_COMPONENTS: Record<WidgetId, (props: WidgetProps) => Promise<React.ReactNode>> =
  {
    quickActions: QuickActionsWidget,
    collect: CollectWidget,
    cashToday: CashTodayWidget,
    salesWeek: SalesWeekWidget,
    moneyOut: MoneyOutWidget,
    riskCustomers: RiskCustomersWidget,
    lowStock: LowStockWidget,
    rus: RusWidget,
    plan: PlanWidget,
    monthSummary: MonthSummaryWidget,
    purchaseDrafts: PurchaseDraftsWidget,
    notices: NoticesWidget,
    cashFlow: CashFlowWidget,
    salesByMethod: SalesByMethodWidget,
    portfolioTrend: PortfolioTrendWidget,
    marginTrend: MarginTrendWidget,
    topProducts: TopProductsWidget,
    recentSales: RecentSalesWidget,
    collectionsHealth: CollectionsHealthWidget,
  };
