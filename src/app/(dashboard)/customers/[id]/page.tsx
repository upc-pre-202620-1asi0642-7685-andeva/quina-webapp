import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, PencilIcon, SlidersHorizontalIcon } from 'lucide-react';
import { z } from 'zod';
import { RatePercent } from '@/core/domain/credit/rate-percent';
import type { RateInput } from '@/core/domain/finance/rate';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue, type Currency } from '@/core/domain/shared/money';
import { listCycles } from '@/infrastructure/db/queries/collections';
import { getCustomer } from '@/infrastructure/db/queries/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import { AccountCycles } from '@/presentation/components/collections/account-cycles';
import { CyclePayButton } from '@/presentation/components/collections/cycle-pay-button';
import { CustomerActions } from '@/presentation/components/customers/customer-actions';
import { customerStatus, StatusBadge } from '@/presentation/components/customers/status-badge';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';

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

  const t = await getTranslations('Customers');
  const tCollections = await getTranslations('Collections');
  const { notice } = await searchParams;
  const name = `${customer.firstName} ${customer.lastName}`;
  const canTerms = can(user.role, 'credit.terms');
  const shownNotice = NOTICES.find((n) => n === notice);

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
  const availableAmount = account
    ? MoneyValue.of(account.creditLimit, currency).minus(
        MoneyValue.of(account.currentBalance, currency),
      )
    : null;
  const cycles = customer.accountId ? await listCycles(user.storeId, customer.accountId) : [];
  const now = new Date();
  const payable =
    can(user.role, 'payments.create') &&
    cycles.some((c) => c.status === 'BILLED' || c.status === 'OVERDUE');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('detail.back')}
      </Link>

      {shownNotice ? (
        <Notice tone={shownNotice === 'createdNoMail' ? 'warning' : 'success'}>
          <p>{t(`detail.${shownNotice}`, { name: customer.firstName })}</p>
        </Notice>
      ) : null}

      {customer.emailBouncedAt ? (
        <Notice tone="warning">
          <p>{tCollections('bounce', { date: formatDate(customer.emailBouncedAt) })}</p>
        </Notice>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{name}</h1>
          <StatusBadge status={customerStatus(customer.isActive, account?.status)} />
        </div>
        {can(user.role, 'customers.update') ? (
          <Link href={`/customers/${id}/edit`} className={buttonVariants({ variant: 'secondary' })}>
            <PencilIcon aria-hidden="true" />
            {t('detail.edit')}
          </Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{t('detail.creditTitle')}</h2>
          {canTerms && customer.isActive ? (
            <Link
              href={`/customers/${id}/terms`}
              className={buttonVariants({ variant: account ? 'secondary' : 'primary' })}
            >
              <SlidersHorizontalIcon aria-hidden="true" />
              {account ? t('detail.changeTerms') : t('detail.setTerms')}
            </Link>
          ) : null}
        </div>

        {account && availableAmount ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 flex flex-col gap-1 rounded-field bg-paper-deep p-3 sm:col-span-1">
                <dt className="text-[13px] text-ink-soft">{t('detail.available')}</dt>
                <dd className="text-lg font-semibold whitespace-nowrap text-ink" aria-live="polite">
                  <Money amount={availableAmount.toFixed2()} currency={currency} />
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
            {/* El empleado solo ve el disponible (US05): las condiciones son del dueño */}
            {canTerms && customer.terms ? (
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row
                  label={t('detail.compensatory')}
                  value={rateText(customer.terms.compensatory)}
                />
                <Row label={t('detail.moratory')} value={rateText(customer.terms.moratory)} />
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

        {canTerms ? (
          <CustomerActions
            customerId={id}
            name={customer.firstName}
            isActive={customer.isActive}
            accountStatus={account?.status ?? null}
          />
        ) : null}
      </section>

      {account ? (
        <>
          {payable ? (
            <div className="flex justify-end">
              <CyclePayButton customerId={id} />
            </div>
          ) : null}
          <AccountCycles
            hrefBase={`/customers/${id}`}
            cycles={cycles}
            currency={currency}
            now={now}
          />
        </>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('detail.contactTitle')}</h2>
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
