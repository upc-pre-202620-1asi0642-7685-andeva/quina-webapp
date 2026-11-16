import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { DrizzlePaymentRepository } from '@/infrastructure/db/collections/drizzle-payment-repository';
import { listObjectedCharges } from '@/infrastructure/db/queries/collections';
import { getCustomer } from '@/infrastructure/db/queries/customers';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { ObjectionsQueue } from '@/presentation/components/collections/objections-queue';
import {
  PayForm,
  type CounterPaymentDetails,
} from '@/presentation/components/collections/pay-form';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

const QR_URL_SECONDS = 15 * 60;

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStoreUser(`/customers/${id}/pay`, 'payments.create');
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(user.storeId, id);
  if (!customer) notFound();

  const t = await getTranslations('Collections.pay');
  const tPage = await getTranslations('Collections.page');
  const tList = await getTranslations('Customers.list');
  const now = new Date();
  const [preview, store, storePaymentRaw] = await Promise.all([
    new DrizzlePaymentRepository().preview({
      storeId: user.storeId,
      customerId: id,
      now,
    }),
    loadStoreContext(user.storeId),
    getStorePayment(user.storeId),
  ]);

  const name = `${customer.firstName} ${customer.lastName}`;
  const owner = can(user.role, 'charges.resolve') && !store.isReadOnly;

  const cycleObjections =
    preview.ok && preview.value.objections.length > 0
      ? (await listObjectedCharges(user.storeId)).filter(
          (o) => o.cycleId === preview.value.cycle.id,
        )
      : [];

  const alreadyPaid = preview.ok
    ? MoneyValue.of(preview.value.totalDue, preview.value.currency)
        .plus(MoneyValue.of(preview.value.moratoryInterest, preview.value.currency))
        .minus(MoneyValue.of(preview.value.amountDue, preview.value.currency))
    : null;

  let counterPayment: CounterPaymentDetails | undefined;
  if (preview.ok && preview.value.objections.length === 0) {
    const qrUrl = storePaymentRaw.qrPath
      ? await getPrivateFileStorage().signedUrl(storePaymentRaw.qrPath, QR_URL_SECONDS)
      : null;
    counterPayment = {
      storeName: store.name,
      yapeNumber: storePaymentRaw.yapeNumber,
      plinNumber: storePaymentRaw.plinNumber,
      bankName: storePaymentRaw.bankName,
      bankAccountNumber: storePaymentRaw.bankAccountNumber,
      bankCci: storePaymentRaw.bankCci,
      qrUrl,
    };
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/customers/${id}`}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          {t('back', { name: customer.firstName })}
        </Link>
        <Link
          href="/collections"
          className="inline-flex min-h-11 items-center text-sm font-medium text-ink-soft hover:text-ink hover:underline"
        >
          {tPage('title')}
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title', { name })}</h1>

      {store.isReadOnly ? (
        <Notice tone="warning">
          <p>{tList('readOnlyNotice')}</p>
        </Notice>
      ) : null}

      {!preview.ok ? (
        <p className="rounded-field bg-paper-deep p-4 text-sm text-ink-soft">
          {preview.error === 'NO_PAYABLE_CYCLE' || preview.error === 'ACCOUNT_NOT_FOUND'
            ? t('nothingDue')
            : t('errors.GENERIC')}
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.15fr]">
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
                <p className="text-sm text-ink-soft tabular-nums">
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

            <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-4">
              <span className="text-[13px] font-medium text-ink-soft">{t('amountDue')}</span>
              <Money
                amount={preview.value.amountDue}
                currency={preview.value.currency}
                className="text-amount font-bold tracking-tight text-ink"
              />
            </div>

            <dl className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
              <div className="flex items-center justify-between gap-3 text-ink-soft">
                <dt>{t('totalDue')}</dt>
                <dd className="text-ink tabular-nums">
                  <Money amount={preview.value.totalDue} currency={preview.value.currency} />
                </dd>
              </div>
              {alreadyPaid?.isPositive() ? (
                <div className="flex items-center justify-between gap-3 text-ink-soft">
                  <dt>{t('alreadyPaid')}</dt>
                  <dd className="text-success-ink tabular-nums">
                    − <Money amount={alreadyPaid.toFixed2()} currency={preview.value.currency} />
                  </dd>
                </div>
              ) : null}
              {preview.value.daysLate > 0 ? (
                <div className="flex items-center justify-between gap-3 text-ink-soft">
                  <dt>{t('moratory', { days: preview.value.daysLate })}</dt>
                  <dd className="text-error-ink tabular-nums">
                    <Money
                      amount={preview.value.moratoryInterest}
                      currency={preview.value.currency}
                    />
                  </dd>
                </div>
              ) : null}
            </dl>
            {preview.value.laterCycles > 0 ? (
              <p className="text-[13px] text-ink-soft">
                {t('laterCycles', { count: preview.value.laterCycles })}
              </p>
            ) : null}
          </section>

          {preview.value.objections.length > 0 ? (
            <div className="flex flex-col gap-4">
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
              {cycleObjections.length > 0 ? (
                <ObjectionsQueue items={cycleObjections} canResolve={owner} showCustomer={false} />
              ) : null}
            </div>
          ) : (
            <PayForm
              customerId={id}
              cycleId={preview.value.cycle.id}
              amountDue={preview.value.amountDue}
              currency={preview.value.currency}
              isReadOnly={store.isReadOnly}
              storePayment={counterPayment}
            />
          )}
        </div>
      )}
    </div>
  );
}
