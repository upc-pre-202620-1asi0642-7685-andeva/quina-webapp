import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarClockIcon, MapPinIcon, PhoneIcon, ShieldCheckIcon, StoreIcon } from 'lucide-react';
import { z } from 'zod';
import { getPortalAccount } from '@/infrastructure/db/queries/portal';
import { requirePortalUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';

/** Información de contacto, condiciones del fiado y privacidad de la tienda. */
export default async function PortalStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { links } = await requirePortalUser(`/portal/${storeId}/store`);
  if (!z.uuid().safeParse(storeId).success) notFound();
  const link = links.find((l) => l.storeId === storeId);
  if (!link) notFound();

  const now = new Date();
  const portal = await getPortalAccount(link, now);
  if (!portal) notFound();

  const t = await getTranslations('Portal.storePage');
  const tAccount = await getTranslations('Portal.account');
  const account = portal.account;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{portal.storeName}</h1>
          <p className="text-base text-ink-soft">{t('subtitle')}</p>
        </div>
        {links.length > 1 ? (
          <Link href="/portal" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <StoreIcon aria-hidden="true" className="size-4" />
            <span>{tAccount('allStores')}</span>
          </Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-ink">{t('contactTitle')}</h2>
        {portal.storeAddress ? (
          <p className="flex items-start gap-3 text-base text-ink-soft">
            <MapPinIcon aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <span>{portal.storeAddress}</span>
          </p>
        ) : (
          <p className="text-base text-ink-soft">{t('noAddress')}</p>
        )}

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
          {portal.storeContact ? (
            <a
              href={`tel:${portal.storeContact}`}
              className={buttonVariants({
                variant: 'primary',
                size: 'lg',
                className: 'w-full sm:w-auto',
              })}
            >
              <PhoneIcon aria-hidden="true" className="size-5" />
              <span>{tAccount('callStore', { phone: portal.storeContact })}</span>
            </a>
          ) : null}
          <Link
            href={`/privacy/customers/${storeId}`}
            className={buttonVariants({
              variant: 'secondary',
              size: 'lg',
              className: 'w-full sm:w-auto',
            })}
          >
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
            <span>{tAccount('privacyLink')}</span>
          </Link>
        </div>
      </section>

      {account ? (
        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <CalendarClockIcon aria-hidden="true" className="size-5 text-ink-soft" />
            <h2 className="text-xl font-semibold text-ink">{t('termsTitle')}</h2>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-4 py-3">
              <dt className="text-sm text-ink-soft">{tAccount('creditLimit')}</dt>
              <dd className="font-semibold text-ink">
                <Money amount={account.creditLimit} currency={account.currency} />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-4 py-3">
              <dt className="text-sm text-ink-soft">{tAccount('nextCutOff')}</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatDate(account.nextCutOffDate)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-4 py-3">
              <dt className="text-sm text-ink-soft">{tAccount('paymentDayTitle')}</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {tAccount('paymentDay', { day: account.paymentDueDay })}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </>
  );
}
