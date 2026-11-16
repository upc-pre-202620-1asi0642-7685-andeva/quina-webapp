import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ActivityIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  ReceiptTextIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { BusinessDate } from '@/core/domain/shared/business-date';
import {
  AUDIT_CATEGORIES,
  AUDIT_ENTITY_NAMES,
  getAuditSummary,
  listAuditActors,
  listAuditLogsPage,
  type AuditCategory,
} from '@/infrastructure/db/queries/audit';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  AuditRecordsView,
  AuditSecondaryFilters,
} from '@/presentation/components/audit/audit-detail-sheet';
import { AuditExportButton } from '@/presentation/components/audit/audit-export-button';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { presentAuditEntry } from '@/presentation/lib/audit-presenter';
import { cn } from '@/presentation/lib/utils';

const PAGE_SIZE = 50;

const CANONICAL_ACTIONS = [
  'CREATE_CASH_SALE',
  'CREATE_CREDIT_SALE',
  'REGISTER_PAYMENT',
  'OBJECT_CHARGE',
  'CHARGE_CONFIRMED',
  'CHARGE_VOIDED',
  'OPEN_CREDIT_ACCOUNT',
  'UPDATE_CREDIT_TERMS',
  'SET_CREDIT_ACCOUNT_STATUS',
  'CREATE_CUSTOMER',
  'UPDATE_CUSTOMER',
  'REACTIVATE_CUSTOMER',
  'DEACTIVATE_CUSTOMER',
  'CREATE_PRODUCT',
  'UPDATE_PRODUCT',
  'UPDATE_PRICE',
  'REACTIVATE_PRODUCT',
  'DEACTIVATE_PRODUCT',
  'ADJUST_STOCK',
  'RECORD_WASTE',
  'CREATE_SUPPLIER',
  'REGISTER_PURCHASE',
  'GENERATE_REPLENISHMENT_ORDERS',
  'DISCARD_PURCHASE_ORDER',
  'CREATE_STORE',
  'REACTIVATE_STORE',
  'SUSPEND_STORE',
  'UPDATE_PAYMENT_DETAILS',
  'UPDATE_TAX_SETTINGS',
  'INVITE_EMPLOYEE',
  'CANCEL_INVITE',
  'REACTIVATE_EMPLOYEE',
  'DEACTIVATE_EMPLOYEE',
  'SET_PASSWORD',
  'ACCEPT_TERMS',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'LOCK_ACCOUNT',
  'START_SUBSCRIPTION_CHECKOUT',
  'SUBSCRIPTION_PAYMENT_APPROVED',
  'SUBSCRIPTION_PAYMENT_REJECTED',
  'SUBSCRIPTION_PAYMENT_REFUNDED',
  'CANCEL_SUBSCRIPTION_RENEWAL',
  'EXPIRE_TRIAL',
  'EXPIRE_GRACE_PERIOD',
  'COMPLETE_CANCELED_SUBSCRIPTION',
] as const;

type AuditSearchParams = {
  from?: string;
  to?: string;
  userId?: string;
  entityName?: string;
  action?: string;
  category?: string;
  q?: string;
  page?: string;
};

function parseValidBusinessDate(raw: string): BusinessDate | null {
  if (!raw) return null;
  try {
    return BusinessDate.parse(raw);
  } catch {
    return null;
  }
}

function buildAuditHref(
  base: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/audit?${qs}` : '/audit';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const user = await requireStoreUser('/audit', 'audit.view');
  const t = await getTranslations('Audit');
  const sp = await searchParams;

  const from = sp.from?.trim() ?? '';
  const to = sp.to?.trim() ?? '';
  const userId = sp.userId?.trim() ?? '';
  const entityName = sp.entityName?.trim() ?? '';
  const action = sp.action?.trim() ?? '';
  const rawCategory = sp.category?.trim() ?? '';
  const category = (AUDIT_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as AuditCategory)
    : undefined;
  const q = sp.q?.trim().slice(0, 80) ?? '';
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const parsedFrom = parseValidBusinessDate(from);
  const parsedTo = parseValidBusinessDate(to);
  const hasMalformedDate = (Boolean(from) && !parsedFrom) || (Boolean(to) && !parsedTo);
  const hasInvertedRange =
    Boolean(parsedFrom && parsedTo) && BusinessDate.compare(parsedFrom!, parsedTo!) > 0;
  const invalidDateRange = hasMalformedDate || hasInvertedRange;

  const effectiveFilters = {
    from: !invalidDateRange && from ? from : undefined,
    to: !invalidDateRange && to ? to : undefined,
    userId: userId || undefined,
    entityName: entityName || undefined,
    action: action || undefined,
    category,
    q: q || undefined,
  };

  const [pageData, actors, summary] = await Promise.all([
    listAuditLogsPage(user.storeId, effectiveFilters, {
      page: requestedPage,
      pageSize: PAGE_SIZE,
    }),
    listAuditActors(user.storeId),
    getAuditSummary(user.storeId),
  ]);

  const presentedEntries = pageData.entries.map((entry) => presentAuditEntry(entry, t));

  const today = BusinessDate.fromInstant(new Date());
  const todayIso = BusinessDate.toISO(today);
  const preset7dFrom = summary.fromDate;
  const preset30dFrom = BusinessDate.toISO(BusinessDate.addDays(today, -29));

  const currentUrlParams: Record<string, string | undefined> = {
    from: from || undefined,
    to: to || undefined,
    userId: userId || undefined,
    entityName: entityName || undefined,
    action: action || undefined,
    category: category || undefined,
    q: q || undefined,
  };

  const hasFilters = Boolean(from || to || userId || entityName || action || category || q);
  const hasActiveSecondary = Boolean(from || to || userId || action);

  const actionOptions =
    action && !(CANONICAL_ACTIONS as readonly string[]).includes(action)
      ? [action, ...CANONICAL_ACTIONS]
      : [...CANONICAL_ACTIONS];

  const actionLabel = (act: string) => (t.has(`actions.${act}`) ? t(`actions.${act}`) : act);
  const entityLabel = (ent: string) => (t.has(`entities.${ent}`) ? t(`entities.${ent}`) : ent);

  const isSummaryTotalActive =
    !category &&
    !entityName &&
    !action &&
    !userId &&
    !q &&
    from === summary.fromDate &&
    to === summary.toDate;
  const isSummarySalesActive =
    category === 'sales_credit' &&
    !entityName &&
    !action &&
    !userId &&
    !q &&
    from === summary.fromDate &&
    to === summary.toDate;
  const isSummarySecurityActive =
    category === 'security' &&
    !entityName &&
    !action &&
    !userId &&
    !q &&
    from === summary.fromDate &&
    to === summary.toDate;

  const rangeStart = pageData.totalCount === 0 ? 0 : (pageData.page - 1) * pageData.pageSize + 1;
  const rangeEnd = Math.min(pageData.totalCount, pageData.page * pageData.pageSize);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        <AuditExportButton filters={effectiveFilters} />
      </header>

      {/* Resumen de los últimos 7 días como accesos rápidos */}
      <section aria-label={t('summary.sectionLabel')} className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`/audit?from=${summary.fromDate}&to=${summary.toDate}`}
          aria-current={isSummaryTotalActive ? 'page' : undefined}
          className={cn(
            'flex items-start justify-between gap-3 rounded-card border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active',
            isSummaryTotalActive ? 'border-link-active bg-soft/30' : 'border-line',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-ink-soft">{t('summary.totalLabel')}</span>
            <span className="text-2xl font-bold text-ink tabular-nums">{summary.total7d}</span>
            <span className="text-[13px] text-ink-soft">{t('summary.totalHint')}</span>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
            <ActivityIcon aria-hidden="true" className="size-5" />
          </span>
        </Link>

        <Link
          href={`/audit?category=sales_credit&from=${summary.fromDate}&to=${summary.toDate}`}
          aria-current={isSummarySalesActive ? 'page' : undefined}
          className={cn(
            'flex items-start justify-between gap-3 rounded-card border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active',
            isSummarySalesActive ? 'border-link-active bg-soft/30' : 'border-line',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-ink-soft">
              {t('summary.salesCreditLabel')}
            </span>
            <span className="text-2xl font-bold text-ink tabular-nums">
              {summary.salesCredit7d}
            </span>
            <span className="text-[13px] text-ink-soft">{t('summary.salesCreditHint')}</span>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink">
            <ReceiptTextIcon aria-hidden="true" className="size-5" />
          </span>
        </Link>

        <Link
          href={`/audit?category=security&from=${summary.fromDate}&to=${summary.toDate}`}
          aria-current={isSummarySecurityActive ? 'page' : undefined}
          className={cn(
            'flex items-start justify-between gap-3 rounded-card border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active',
            isSummarySecurityActive ? 'border-link-active bg-soft/30' : 'border-line',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-ink-soft">{t('summary.securityLabel')}</span>
            <span className="text-2xl font-bold text-ink tabular-nums">{summary.security7d}</span>
            <span
              className={cn(
                'text-[13px] tabular-nums',
                summary.securityAlerts7d > 0 ? 'font-medium text-amber-ink' : 'text-ink-soft',
              )}
            >
              {summary.securityAlerts7d > 0
                ? t('summary.securityHintAlert', { count: summary.securityAlerts7d })
                : t('summary.securityHintOk')}
            </span>
          </div>
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              summary.securityAlerts7d > 0
                ? 'bg-amber/12 text-amber-ink'
                : 'bg-paper-deep text-ink-soft',
            )}
          >
            {summary.securityAlerts7d > 0 ? (
              <ShieldAlertIcon aria-hidden="true" className="size-5" />
            ) : (
              <ShieldCheckIcon aria-hidden="true" className="size-5" />
            )}
          </span>
        </Link>
      </section>

      {/* Píldoras de categoría + barra de filtros */}
      <div className="flex flex-col gap-3">
        <nav aria-label={t('filters.categoryLabel')} className="flex flex-wrap items-center gap-2">
          <Link
            href={buildAuditHref(currentUrlParams, { category: undefined })}
            aria-current={!category ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-link-active',
              !category
                ? 'bg-soft font-semibold text-soft-ink'
                : 'border border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
            )}
          >
            {t('categories.all')}
          </Link>
          {AUDIT_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <Link
                key={cat}
                href={buildAuditHref(currentUrlParams, { category: cat })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-link-active',
                  active
                    ? 'bg-soft font-semibold text-soft-ink'
                    : 'border border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                )}
              >
                {t(`categories.${cat}`)}
              </Link>
            );
          })}
        </nav>

        <Form
          action="/audit"
          className="grid gap-3 rounded-card border border-line bg-surface p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] lg:items-end"
        >
          {category ? <input type="hidden" name="category" value={category} /> : null}

          <FormField id="audit-q" label={t('filters.search')} hint={t('filters.searchHint')}>
            {(props) => (
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-soft"
                />
                <Input
                  {...props}
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder={t('filters.searchPlaceholder')}
                  autoComplete="off"
                  className="pl-10"
                />
              </div>
            )}
          </FormField>

          <FormField id="audit-entity" label={t('filters.entity')} hint={t('filters.entityHint')}>
            {(props) => (
              <NativeSelect {...props} name="entityName" defaultValue={entityName}>
                <option value="">{t('filters.allEntities')}</option>
                {AUDIT_ENTITY_NAMES.map((ent) => (
                  <option key={ent} value={ent}>
                    {entityLabel(ent)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>

          <div className="flex flex-wrap items-center gap-2 lg:self-center">
            <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
              <FilterIcon aria-hidden="true" />
              {t('filters.apply')}
            </button>
            {hasFilters ? (
              <Link href="/audit" className={buttonVariants({ variant: 'ghost' })}>
                {t('filters.clear')}
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 lg:col-span-full">
            <Link
              href={buildAuditHref(currentUrlParams, { from: todayIso, to: todayIso })}
              className={cn(
                'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-link-active',
                from === todayIso && to === todayIso
                  ? 'border-link-active bg-soft text-soft-ink'
                  : 'border-line bg-paper text-ink-soft hover:bg-surface-hover hover:text-ink',
              )}
            >
              {t('filters.presetToday')}
            </Link>
            <Link
              href={buildAuditHref(currentUrlParams, { from: preset7dFrom, to: todayIso })}
              className={cn(
                'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-link-active',
                from === preset7dFrom && to === todayIso
                  ? 'border-link-active bg-soft text-soft-ink'
                  : 'border-line bg-paper text-ink-soft hover:bg-surface-hover hover:text-ink',
              )}
            >
              {t('filters.preset7d')}
            </Link>
            <Link
              href={buildAuditHref(currentUrlParams, { from: preset30dFrom, to: todayIso })}
              className={cn(
                'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-link-active',
                from === preset30dFrom && to === todayIso
                  ? 'border-link-active bg-soft text-soft-ink'
                  : 'border-line bg-paper text-ink-soft hover:bg-surface-hover hover:text-ink',
              )}
            >
              {t('filters.preset30d')}
            </Link>
          </div>

          <AuditSecondaryFilters
            defaultOpen={hasActiveSecondary}
            moreLabel={t('filters.moreFilters')}
            lessLabel={t('filters.lessFilters')}
          >
            <FormField id="audit-from" label={t('filters.from')} hint={t('filters.fromHint')}>
              {(props) => <Input {...props} type="date" name="from" defaultValue={from} />}
            </FormField>

            <FormField id="audit-to" label={t('filters.to')} hint={t('filters.toHint')}>
              {(props) => <Input {...props} type="date" name="to" defaultValue={to} />}
            </FormField>

            <FormField id="audit-user" label={t('filters.user')} hint={t('filters.userHint')}>
              {(props) => (
                <NativeSelect {...props} name="userId" defaultValue={userId}>
                  <option value="">{t('filters.allUsers')}</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>

            <FormField id="audit-action" label={t('filters.action')} hint={t('filters.actionHint')}>
              {(props) => (
                <NativeSelect {...props} name="action" defaultValue={action}>
                  <option value="">{t('filters.allActions')}</option>
                  {actionOptions.map((act) => (
                    <option key={act} value={act}>
                      {actionLabel(act)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </AuditSecondaryFilters>
        </Form>
      </div>

      {invalidDateRange ? (
        <Notice tone="warning">
          <p>{t('filters.invalidDateRange')}</p>
          <div>
            <Link
              href={buildAuditHref(currentUrlParams, { from: undefined, to: undefined })}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              {t('filters.resetDates')}
            </Link>
          </div>
        </Notice>
      ) : null}

      {pageData.totalCount === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
            <ShieldCheckIcon aria-hidden="true" className="size-6" />
          </span>
          {hasFilters ? (
            <>
              <p className="max-w-md text-base font-medium text-ink">{t('empty')}</p>
              <Link href="/audit" className={buttonVariants({ variant: 'secondary' })}>
                {t('emptyStates.clearFilters')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{t('emptyStates.noEventsTitle')}</h2>
              <p className="max-w-md text-sm text-ink-soft">{t('emptyStates.noEventsBody')}</p>
              <Link href="/sales" className={buttonVariants({ variant: 'secondary' })}>
                {t('emptyStates.goToCounter')}
              </Link>
            </>
          )}
        </section>
      ) : (
        <section aria-label={t('title')} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft tabular-nums">
            <p>{t('count', { count: pageData.totalCount })}</p>
            <p>
              {t('table.paginationRange', {
                from: rangeStart,
                to: rangeEnd,
                total: pageData.totalCount,
              })}
            </p>
          </div>

          <AuditRecordsView entries={presentedEntries} />

          {pageData.totalPages > 1 ? (
            <nav
              aria-label={t('title')}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
            >
              <span className="text-sm text-ink-soft tabular-nums">
                {t('table.paginationRange', {
                  from: rangeStart,
                  to: rangeEnd,
                  total: pageData.totalCount,
                })}
              </span>
              <div className="flex items-center gap-2">
                {pageData.page > 1 ? (
                  <Link
                    href={buildAuditHref(currentUrlParams, {
                      page: pageData.page - 1 > 1 ? String(pageData.page - 1) : undefined,
                    })}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                    {t('table.prevPage')}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={cn(
                      buttonVariants({ variant: 'secondary', size: 'sm' }),
                      'pointer-events-none opacity-50',
                    )}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                    {t('table.prevPage')}
                  </span>
                )}
                {pageData.page < pageData.totalPages ? (
                  <Link
                    href={buildAuditHref(currentUrlParams, { page: String(pageData.page + 1) })}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {t('table.nextPage')}
                    <ChevronRightIcon aria-hidden="true" />
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={cn(
                      buttonVariants({ variant: 'secondary', size: 'sm' }),
                      'pointer-events-none opacity-50',
                    )}
                  >
                    {t('table.nextPage')}
                    <ChevronRightIcon aria-hidden="true" />
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
