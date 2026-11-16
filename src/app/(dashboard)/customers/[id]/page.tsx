import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ArrowLeftIcon,
  BanknoteIcon,
  ChevronRightIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { z } from 'zod';
import { RatePercent } from '@/core/domain/credit/rate-percent';
import type { RateInput } from '@/core/domain/finance/rate';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue, type Currency } from '@/core/domain/shared/money';
import { listCycles } from '@/infrastructure/db/queries/collections';
import { getCustomer, getCustomerProfileExtras } from '@/infrastructure/db/queries/customers';
import { getInstallmentPlans } from '@/infrastructure/db/queries/portal';
import { requireStoreUser } from '@/presentation/auth/guards';
import { AccountCycles } from '@/presentation/components/collections/account-cycles';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { CustomerActions } from '@/presentation/components/customers/customer-actions';
import { CustomerDetailTabs } from '@/presentation/components/customers/customer-detail-tabs';
import { customerStatus, StatusBadge } from '@/presentation/components/customers/status-badge';
import { FlashToast } from '@/presentation/components/feedback/flash-toast';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { InstallmentPlans } from '@/presentation/components/portal/installment-plans';
import { ScoreBreakdownPopover } from '@/presentation/components/portfolio/score-badge';
import { buttonVariants } from '@/presentation/components/ui/button';
import {
  availableCreditAmount,
  customerInitials,
  whatsappHref,
} from '@/presentation/lib/customer-list';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

const NOTICES = ['created', 'createdNoMail', 'saved', 'termsOpened'] as const;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const user = await requireStoreUser(`/customers/${id}`, 'customers.read');
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(user.storeId, id);
  if (!customer) notFound();

  const now = new Date();
  const canUpdate = can(user.role, 'customers.update');
  const canTerms = can(user.role, 'credit.terms');
  const canDeactivate = can(user.role, 'customers.deactivate');
  const canCollect = can(user.role, 'payments.create');
  const canSell = can(user.role, 'sales.create');
  const canScore = can(user.role, 'reports.view');

  const [cycles, installmentPlans, extras, store, t, tCollections] = await Promise.all([
    customer.accountId ? listCycles(user.storeId, customer.accountId) : Promise.resolve([]),
    customer.accountId
      ? getInstallmentPlans(user.storeId, customer.accountId)
      : Promise.resolve([]),
    getCustomerProfileExtras(user.storeId, id, customer.accountId, {
      includeScore: canScore,
      now,
    }),
    loadStoreContext(user.storeId),
    getTranslations('Customers'),
    getTranslations('Collections'),
  ]);

  const { notice } = await searchParams;
  const shownNotice = NOTICES.find((n) => n === notice);
  const name = `${customer.firstName} ${customer.lastName}`;
  const isReadOnly = store.isReadOnly;

  const rateText = (rate: RateInput) => {
    const percent = RatePercent.fromFraction(rate.value);
    const period = t(`terms.periodAdjective.${rate.period}`);
    return rate.type === 'NOMINAL' && rate.capitalization
      ? t('terms.rateNominal', {
          percent,
          period,
          capitalization: t(`terms.capitalizationAdverb.${rate.capitalization}`),
        })
      : t('terms.rateEffective', { percent, period });
  };

  const account = customer.account;
  const currency = (account?.currency ?? 'PEN') as Currency;
  const creditSummary = availableCreditAmount(account);
  const hasBalance = account ? MoneyValue.of(account.currentBalance, currency).isPositive() : false;
  const status = customerStatus(customer.isActive, account?.status);

  const payableCycles = cycles
    .filter((c) => c.status === 'BILLED' || c.status === 'OVERDUE')
    .sort((a, b) => a.paymentDueDate.getTime() - b.paymentDueDate.getTime());
  const oldestPayable = payableCycles[0] ?? null;
  const payableTotal = MoneyValue.sum(
    payableCycles.map((c) =>
      MoneyValue.of(c.amount, currency).minus(MoneyValue.of(c.amountPaid, currency)),
    ),
    currency,
  );
  const payable = payableCycles.length > 0 && payableTotal.isPositive();
  const payableBadge = oldestPayable
    ? cycleBadgeStatus(oldestPayable.status, oldestPayable.paymentDueDate, now)
    : null;

  const waHref = whatsappHref(customer.phone);
  const showCollectCta = payable && canCollect && !isReadOnly;
  const showSellCta = canSell && !isReadOnly && customer.isActive && account?.status === 'ACTIVE';

  const cyclesSlot = (
    <AccountCycles hrefBase={`/customers/${id}`} cycles={cycles} currency={currency} now={now} />
  );

  const installmentsSlot =
    installmentPlans.length > 0 ? (
      <InstallmentPlans plans={installmentPlans} currency={currency} compact />
    ) : null;

  const paymentsSlot = (
    <section
      aria-labelledby="payments-history-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <h2 id="payments-history-title" className="text-lg font-semibold text-ink">
        {t('detail.paymentsTitle')}
      </h2>
      {extras.payments.length === 0 ? (
        <div className="flex items-center gap-3 rounded-field bg-paper-deep p-4 text-sm text-ink-soft">
          <ReceiptTextIcon aria-hidden="true" className="size-5 shrink-0" />
          <p>{t('detail.paymentsEmpty', { name: customer.firstName })}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {extras.payments.map((payment) => (
            <li key={payment.id}>
              <Link
                href={`/payments/${payment.id}`}
                className="flex min-h-14 items-center gap-3 rounded-field px-2 py-2.5 transition-[transform,background-color] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <ReceiptTextIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-ink">
                    {t('detail.paymentReceipt', { number: payment.receiptNumber })}
                  </span>
                  <span className="text-[13px] text-ink-soft tabular-nums">
                    {formatDate(payment.paymentDate)} ·{' '}
                    {t('detail.paymentCycle', {
                      number: payment.cycleNumber,
                      method: tCollections(`pay.methods.${payment.paymentMethod}`),
                    })}
                  </span>
                </div>
                <Money
                  amount={payment.amountPaid}
                  currency={currency}
                  className="text-sm font-semibold whitespace-nowrap text-ink"
                />
                <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const infoSlot = (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="contact-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <h2 id="contact-title" className="text-lg font-semibold text-ink">
          {t('detail.contactTitle')}
        </h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Row
            label={t('detail.document')}
            value={`${t(`documentTypes.${customer.documentType as 'DNI'}`)} ${customer.documentNumber}`}
          />
          <Row label={t('detail.phone')} value={customer.phone ?? '—'} />
          <Row label={t('detail.email')} value={customer.email} />
          <Row label={t('detail.address')} value={customer.address ?? t('detail.noAddress')} />
          <Row label={t('detail.since')} value={formatDate(customer.createdAt)} />
        </dl>
      </section>

      <section
        aria-labelledby="consents-title"
        className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex items-center gap-2">
          <ShieldCheckIcon aria-hidden="true" className="size-5 text-ink-soft" />
          <h2 id="consents-title" className="text-lg font-semibold text-ink">
            {t('detail.consentsTitle')}
          </h2>
        </div>
        {extras.consents.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('detail.consentsEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {extras.consents.map((consent) => (
              <li
                key={consent.id}
                className="flex flex-col gap-0.5 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <span className="font-medium text-ink">
                  {t(`detail.consentTypes.${consent.consentType}`)}
                </span>
                <span className="text-[13px] text-ink-soft tabular-nums">
                  {t('detail.consentMeta', {
                    version: consent.policyVersion,
                    date: formatDate(consent.acceptedAt),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canTerms || canDeactivate ? (
        <section
          aria-labelledby="manage-title"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <h2 id="manage-title" className="text-lg font-semibold text-ink">
            {t('detail.manageTitle')}
          </h2>
          <CustomerActions
            customerId={id}
            name={customer.firstName}
            isActive={customer.isActive}
            accountStatus={account?.status ?? null}
            hasBalance={hasBalance}
            canTerms={canTerms}
            canDeactivate={canDeactivate}
            isReadOnly={isReadOnly}
          />
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/customers"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('detail.back')}
      </Link>

      {shownNotice ? (
        <FlashToast
          type={shownNotice === 'createdNoMail' ? 'warning' : 'success'}
          title={t(`detail.${shownNotice}`, { name: customer.firstName })}
        />
      ) : null}

      {customer.emailBouncedAt ? (
        <Notice tone="warning">
          <p>{tCollections('bounce', { date: formatDate(customer.emailBouncedAt) })}</p>
        </Notice>
      ) : null}

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-full text-base font-semibold',
                status === 'ACTIVE' ? 'bg-soft text-soft-ink' : 'bg-paper-deep text-ink-soft',
              )}
            >
              {customerInitials(customer.firstName, customer.lastName)}
            </span>
            <div className="flex flex-col items-start gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status} />
                {canScore && extras.score ? (
                  <ScoreBreakdownPopover
                    breakdown={extras.score.breakdown}
                    suggestLowerLimit={extras.score.suggestLowerLimit}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {showSellCta || customer.phone || (canUpdate && !isReadOnly) ? (
          <div className="flex flex-wrap items-center gap-2">
            {showSellCta ? (
              <Link
                href={`/sales?customerId=${id}`}
                className={buttonVariants({
                  variant: showCollectCta ? 'secondary' : 'primary',
                  className: 'w-full sm:w-auto',
                })}
              >
                <ShoppingBagIcon aria-hidden="true" />
                {t('detail.sellAction')}
              </Link>
            ) : null}
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <PhoneIcon aria-hidden="true" />
                {t('detail.callAction')}
              </a>
            ) : null}
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <MessageCircleIcon aria-hidden="true" />
                {t('detail.whatsappAction')}
              </a>
            ) : null}
            {canUpdate && !isReadOnly ? (
              <Link
                href={`/customers/${id}/edit`}
                className={buttonVariants({
                  variant: 'secondary',
                  size: 'sm',
                  className: 'sm:ml-auto',
                })}
              >
                <PencilIcon aria-hidden="true" />
                {t('detail.edit')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <section
        aria-labelledby="credit-summary-title"
        className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="credit-summary-title" className="text-lg font-semibold text-ink">
            {t('detail.creditTitle')}
          </h2>
          {canTerms && customer.isActive && !isReadOnly ? (
            <Link
              href={`/customers/${id}/terms`}
              className={buttonVariants({
                variant: account || showSellCta || showCollectCta ? 'secondary' : 'primary',
                size: 'sm',
              })}
            >
              <SlidersHorizontalIcon aria-hidden="true" />
              {account ? t('detail.changeTerms') : t('detail.setTerms')}
            </Link>
          ) : null}
        </div>

        {payable && oldestPayable && payableBadge ? (
          <div
            className={cn(
              'flex flex-col gap-3 rounded-field p-4 sm:flex-row sm:items-center sm:justify-between',
              payableBadge === 'OVERDUE'
                ? 'bg-error/12'
                : payableBadge === 'DUE_SOON'
                  ? 'bg-amber/12'
                  : 'bg-soft',
            )}
          >
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  {payableBadge === 'OVERDUE' ? t('detail.overdueTitle') : t('detail.payableTitle')}
                </span>
                <CycleStatusBadge status={payableBadge} />
              </div>
              <Money
                amount={payableTotal.toFixed2()}
                currency={currency}
                className="text-2xl font-bold tracking-tight text-ink"
              />
              <p
                className={cn(
                  'text-[13px] font-medium tabular-nums',
                  payableBadge === 'OVERDUE'
                    ? 'text-error-ink'
                    : payableBadge === 'DUE_SOON'
                      ? 'text-amber-ink'
                      : 'text-soft-ink-2',
                )}
              >
                {t('detail.payableDueOn', { date: formatDate(oldestPayable.paymentDueDate) })}
                {payableCycles.length > 1
                  ? ` · ${t('detail.payableMore', { count: payableCycles.length - 1 })}`
                  : ''}
              </p>
            </div>
            {canCollect && !isReadOnly ? (
              <Link
                href={`/customers/${id}/pay`}
                className={buttonVariants({ variant: 'primary', className: 'w-full sm:w-auto' })}
              >
                <BanknoteIcon aria-hidden="true" />
                {tCollections('cycle.pay')}
              </Link>
            ) : null}
          </div>
        ) : null}

        {account && creditSummary ? (
          <>
            <div className="flex flex-col gap-2">
              <div
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={creditSummary.usedPercent}
                aria-label={t('detail.creditMeterLabel', { percent: creditSummary.usedPercent })}
                className="h-2 overflow-hidden rounded-full bg-paper-deep"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-250 ease-(--ease-out-expo)',
                    creditSummary.overLimit || creditSummary.usedPercent >= 95
                      ? 'bg-error'
                      : creditSummary.usedPercent >= 85
                        ? 'bg-amber'
                        : 'bg-primary',
                  )}
                  style={{ width: `${creditSummary.usedPercent}%` }}
                />
              </div>
              {creditSummary.overLimit ? (
                <p className="text-[13px] font-medium text-error-ink">
                  {t('detail.overLimitWarning')}
                </p>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 flex flex-col gap-1 rounded-field bg-paper-deep p-3 sm:col-span-1">
                <dt className="text-[13px] text-ink-soft">{t('detail.available')}</dt>
                <dd className="text-lg font-semibold whitespace-nowrap text-ink" aria-live="polite">
                  <Money amount={creditSummary.amount} currency={currency} />
                </dd>
              </div>
              <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-3">
                <dt className="text-[13px] text-ink-soft">{t('detail.balance')}</dt>
                <dd className="text-lg font-semibold whitespace-nowrap text-ink">
                  <Money amount={account.currentBalance} currency={currency} />
                </dd>
              </div>
              <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-3">
                <dt className="text-[13px] text-ink-soft">{t('detail.limit')}</dt>
                <dd className="text-lg font-semibold whitespace-nowrap text-ink">
                  <Money amount={account.creditLimit} currency={currency} />
                </dd>
              </div>
            </dl>

            {/* El empleado solo ve el disponible y calendario operativo (US05): las tasas son del dueño */}
            {customer.terms ? (
              <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
                {canTerms ? (
                  <>
                    <Row
                      label={t('detail.compensatory')}
                      value={rateText(customer.terms.compensatory)}
                    />
                    <Row label={t('detail.moratory')} value={rateText(customer.terms.moratory)} />
                  </>
                ) : null}
                <Row
                  label={t('detail.cutOff')}
                  value={t('detail.dayOfMonth', { day: customer.terms.cutOffDay })}
                />
                <Row
                  label={t('detail.payment')}
                  value={t('detail.dayOfMonth', { day: customer.terms.paymentDueDay })}
                />
                <Row
                  label={t('detail.maxMonths')}
                  value={t('detail.months', { count: customer.terms.maxInstallmentMonths })}
                />
              </dl>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            {canTerms ? t('detail.noAccount') : t('detail.noAccountEmployee')}
          </p>
        )}
      </section>

      <CustomerDetailTabs
        hasAccount={Boolean(account)}
        cyclesCount={cycles.length}
        installmentsCount={installmentPlans.length}
        paymentsCount={extras.payments.length}
        cyclesSlot={cyclesSlot}
        installmentsSlot={installmentsSlot}
        paymentsSlot={paymentsSlot}
        infoSlot={infoSlot}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className="break-words text-ink tabular-nums">{value}</dd>
    </div>
  );
}
