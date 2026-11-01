import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { can } from '@/core/domain/identity/permissions';
import { DrizzlePaymentRepository } from '@/infrastructure/db/collections/drizzle-payment-repository';
import { getCustomer } from '@/infrastructure/db/queries/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { PayForm } from '@/presentation/components/collections/pay-form';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { formatDate } from '@/presentation/lib/format-date';

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStoreUser(`/customers/${id}/pay`, 'payments.create');
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(user.storeId, id);
  if (!customer) notFound();

  const t = await getTranslations('Collections.pay');
  const now = new Date();
  const preview = await new DrizzlePaymentRepository().preview({
    storeId: user.storeId,
    customerId: id,
    now,
  });
  const name = `${customer.firstName} ${customer.lastName}`;
  const owner = can(user.role, 'charges.resolve');

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Link
        href={`/customers/${id}`}
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('back', { name: customer.firstName })}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title', { name })}</h1>

      {!preview.ok ? (
        <p className="rounded-field bg-paper-deep p-4 text-sm text-ink-soft">
          {preview.error === 'NO_PAYABLE_CYCLE' || preview.error === 'ACCOUNT_NOT_FOUND'
            ? t('nothingDue')
            : t('errors.GENERIC')}
        </p>
      ) : (
        <>
          <section
            aria-labelledby="pay-cycle"
            className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="pay-cycle" className="text-lg font-semibold text-ink">
                  <Link
                    href={`/customers/${id}/cycles/${preview.value.cycle.id}`}
                    className="hover:underline"
                  >
                    {t('cycle', { date: formatDate(preview.value.cycle.cutOffDate) })}
                  </Link>
                </h2>
                <p className="text-sm text-ink-soft">
                  {t('dueOn', { date: formatDate(preview.value.cycle.paymentDueDate) })}
                </p>
              </div>
              <CycleStatusBadge
                status={cycleBadgeStatus(
                  preview.value.cycle.status,
                  preview.value.cycle.paymentDueDate,
                  now,
                )}
              />
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-ink-soft">
                <dt>{t('totalDue')}</dt>
                <dd className="text-ink">
                  <Money amount={preview.value.totalDue} currency={preview.value.currency} />
                </dd>
              </div>
              {preview.value.daysLate > 0 ? (
                <div className="flex items-center justify-between gap-3 text-ink-soft">
                  <dt>{t('moratory', { days: preview.value.daysLate })}</dt>
                  <dd className="text-error-ink">
                    <Money
                      amount={preview.value.moratoryInterest}
                      currency={preview.value.currency}
                    />
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold text-ink">
                <dt>{t('amountDue')}</dt>
                <dd>
                  <Money amount={preview.value.amountDue} currency={preview.value.currency} />
                </dd>
              </div>
            </dl>
            {preview.value.laterCycles > 0 ? (
              <p className="text-[13px] text-ink-soft">
                {t('laterCycles', { count: preview.value.laterCycles })}
              </p>
            ) : null}
          </section>

          {preview.value.objections.length > 0 ? (
            <Notice tone="warning">
              <p>{owner ? t('objectionOwner') : t('objectionEmployee')}</p>
              {owner ? (
                <ul className="flex flex-col gap-1">
                  {preview.value.objections.map((o) => (
                    <li key={o.chargeId}>
                      <Link
                        href={`/customers/${id}/cycles/${o.cycleId}`}
                        className="font-semibold underline underline-offset-4"
                      >
                        {t('objectionLink', { date: formatDate(o.purchaseDate) })}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          ) : (
            <PayForm
              customerId={id}
              cycleId={preview.value.cycle.id}
              amountDue={preview.value.amountDue}
              currency={preview.value.currency}
            />
          )}
        </>
      )}
    </div>
  );
}
