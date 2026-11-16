import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { RateCaps, type RateKind } from '@/core/domain/credit/rate-cap';
import { RatePercent } from '@/core/domain/credit/rate-percent';
import type { RateInput, RatePeriod } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import type { Currency } from '@/core/domain/shared/money';
import { listAccountTermsHistory } from '@/infrastructure/db/queries/audit';
import { getCustomer } from '@/infrastructure/db/queries/customers';
import { DrizzleCreditAccountRepository } from '@/infrastructure/db/repositories/drizzle-credit-account-repository';
import { saveCreditTermsAction } from '@/presentation/actions/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  TermsForm,
  type CapsByCurrency,
  type RateValues,
  type TermsFormValues,
} from '@/presentation/components/customers/terms-form';
import { FlashToast } from '@/presentation/components/feedback/flash-toast';
import { formatMoney } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

// Ejemplo de la historia US06: corte el 20, pago el 26 y hasta 3 cuotas
const DEFAULTS: TermsFormValues = {
  currency: 'PEN',
  creditLimit: '',
  compensatory: { type: 'EFFECTIVE', percent: '', period: 'ANNUAL', capitalization: '' },
  moratory: { type: 'EFFECTIVE', percent: '', period: 'ANNUAL', capitalization: '' },
  cutOffDay: 20,
  paymentDueDay: 26,
  maxInstallmentMonths: 3,
};

function toValues(rate: RateInput): RateValues {
  return {
    type: rate.type,
    percent: RatePercent.fromFraction(rate.value),
    period: rate.period,
    capitalization: rate.capitalization ?? '',
  };
}

export default async function CustomerTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; notice?: string }>;
}) {
  const { id } = await params;
  const user = await requireStoreUser(`/customers/${id}/terms`, 'credit.terms');
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(user.storeId, id);
  if (!customer) notFound();
  if (!customer.isActive) redirect(`/customers/${id}`);

  const t = await getTranslations('Customers');
  const { new: isNew, notice } = await searchParams;

  const [caps, termsHistory, store] = await Promise.all([
    new DrizzleCreditAccountRepository().rateCaps(),
    customer.accountId
      ? listAccountTermsHistory(user.storeId, customer.accountId)
      : Promise.resolve([]),
    loadStoreContext(user.storeId),
  ]);
  const today = BusinessDate.fromInstant(new Date());
  const capPercent = (kind: RateKind, currency: Currency) => {
    const cap = RateCaps.inForce(caps, kind, currency, today);
    return cap ? RatePercent.fromFraction(cap.maxEffectiveAnnualRate) : null;
  };
  const capsByCurrency: CapsByCurrency = {
    PEN: {
      compensatory: capPercent('COMPENSATORY', 'PEN'),
      moratory: capPercent('MORATORY', 'PEN'),
    },
    USD: {
      compensatory: capPercent('COMPENSATORY', 'USD'),
      moratory: capPercent('MORATORY', 'USD'),
    },
  };

  const initial: TermsFormValues = customer.terms
    ? {
        currency: customer.terms.currency,
        creditLimit: customer.terms.creditLimit,
        compensatory: toValues(customer.terms.compensatory),
        moratory: toValues(customer.terms.moratory),
        cutOffDay: customer.terms.cutOffDay,
        paymentDueDay: customer.terms.paymentDueDay,
        maxInstallmentMonths: customer.terms.maxInstallmentMonths,
      }
    : DEFAULTS;
  const back = `/customers/${id}`;

  function summarizeTerms(data: Record<string, unknown>): string {
    const currency = (data.currency === 'USD' ? 'USD' : 'PEN') as Currency;
    const limit = data.creditLimit
      ? t('terms.historyLimit', { amount: formatMoney(String(data.creditLimit), currency) })
      : '';
    const formatRate = (
      kind: 'historyComp' | 'historyMora',
      rate:
        | { type?: string; value?: string; period?: RatePeriod; capitalization?: RatePeriod | null }
        | undefined,
    ) => {
      if (!rate?.value || !rate.period) return '';
      const percent = RatePercent.fromFraction(rate.value);
      const period = t(`terms.periodAdjective.${rate.period}`);
      const text =
        rate.type === 'NOMINAL' && rate.capitalization
          ? t('terms.rateNominal', {
              percent,
              period,
              capitalization: t(`terms.capitalizationAdverb.${rate.capitalization}`),
            })
          : t('terms.rateEffective', { percent, period });
      return `${t(`terms.${kind}`)}: ${text}`;
    };
    const compText = formatRate(
      'historyComp',
      data.compensatory as Parameters<typeof formatRate>[1],
    );
    const morText = formatRate('historyMora', data.moratory as Parameters<typeof formatRate>[1]);
    return [limit, compText, morText].filter(Boolean).join(' · ');
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={back}
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {customer.firstName} {customer.lastName}
      </Link>

      {notice === 'created' || notice === 'createdNoMail' ? (
        <FlashToast
          type={notice === 'created' ? 'success' : 'warning'}
          title={t(`detail.${notice}`, { name: customer.firstName })}
        />
      ) : null}

      <header className="flex flex-col gap-1">
        {isNew ? <p className="text-[13px] font-medium text-ink-soft">{t('terms.step')}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('terms.title')}</h1>
        <p className="text-sm text-ink-soft">{t('terms.subtitle', { name: customer.firstName })}</p>
      </header>

      <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <TermsForm
          action={saveCreditTermsAction.bind(
            null,
            id,
            `${customer.firstName} ${customer.lastName}`,
          )}
          initial={initial}
          caps={capsByCurrency}
          isOpen={customer.terms !== null}
          cancelHref={back}
          isReadOnly={store.isReadOnly}
          {...(isNew && !customer.terms ? { cashOnlyHref: back } : {})}
        />
      </section>

      {termsHistory.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">{t('terms.historyTitle')}</h2>
          <ol className="flex flex-col divide-y divide-line">
            {termsHistory.map((item) => (
              <li key={item.id} className="flex flex-col gap-1.5 py-3 text-sm first:pt-0 last:pb-0">
                <p className="text-xs text-ink-soft">
                  {formatDate(item.createdAt)} · {item.userName ?? '—'}
                </p>
                {item.oldData ? (
                  <p className="text-xs text-ink-soft tabular-nums">
                    {t('terms.historyBefore')}: {summarizeTerms(item.oldData)}
                  </p>
                ) : null}
                {item.newData ? (
                  <p className="text-sm text-ink tabular-nums">
                    {t('terms.historyAfter')}: {summarizeTerms(item.newData)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
