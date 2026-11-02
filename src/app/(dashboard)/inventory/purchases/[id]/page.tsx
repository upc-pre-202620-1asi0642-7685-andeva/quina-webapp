import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, ExternalLinkIcon, FileTextIcon, PaperclipIcon } from 'lucide-react';
import { z } from 'zod';
import { getPurchaseDetail } from '@/infrastructure/db/queries/purchases';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatQuantity } from '@/presentation/lib/format-quantity';

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const user = await requireStoreUser(`/inventory/purchases/${id}`, 'purchases.manage');
  if (!z.uuid().safeParse(id).success) notFound();

  const purchase = await getPurchaseDetail(user.storeId, id);
  if (!purchase) notFound();

  const t = await getTranslations('Purchases.detail');
  const tDocs = await getTranslations('Purchases.docTypes');
  const { notice } = await searchParams;

  const storage = getPrivateFileStorage();
  const signedAttachments = await Promise.all(
    purchase.attachments.map(async (att) => {
      let url: string | null = null;
      try {
        url = await storage.signedUrl(att.filePath, 15 * 60);
      } catch {
        url = null;
      }
      return { ...att, signedUrl: url };
    }),
  );

  const docNumberLabel = [purchase.series, purchase.documentNumber].filter(Boolean).join('-');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/inventory/purchases"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('backToPurchases')}
      </Link>

      {notice === 'created' ? (
        <Notice tone="success">
          <p>{t('createdNotice')}</p>
        </Notice>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {purchase.supplierName}
          </h1>
          <p className="text-sm text-ink-soft">
            {tDocs(purchase.documentType)}
            {docNumberLabel ? ` ${docNumberLabel}` : ''} · {purchase.issueDate}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-ink-soft">{t('totalAmount')}</span>
          <Money
            amount={purchase.totalAmount}
            currency="PEN"
            className="text-2xl font-semibold text-ink"
          />
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('itemsTitle')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-ink-soft">
              <tr>
                <th scope="col" className="pb-2 font-medium">
                  {t('colProduct')}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t('colQuantity')}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t('colUnitCost')}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t('colSubtotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {purchase.lines.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 font-medium text-ink">
                    <Link
                      href={`/inventory/${item.productId}`}
                      className="hover:underline focus-visible:outline-2 focus-visible:outline-link-active"
                    >
                      {item.productName}
                    </Link>
                  </td>
                  <td className="py-3 text-right text-ink tabular-nums">
                    {formatQuantity(item.quantity)} {item.unitCode}
                  </td>
                  <td className="py-3 text-right text-ink tabular-nums">S/ {item.unitCost}</td>
                  <td className="py-3 text-right text-ink">
                    <Money amount={item.subtotal} currency="PEN" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-soft">{t('registeredBy')}</dt>
            <dd className="text-ink">{purchase.userName}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">{t('supplierTaxId')}</dt>
            <dd className="text-ink tabular-nums">{purchase.supplierTaxId}</dd>
          </div>
          {purchase.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-soft">{t('notes')}</dt>
              <dd className="text-ink">{purchase.notes}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* Comprobantes adjuntos con URL firmada de 15 minutos (US15 crit. 5) */}
      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <PaperclipIcon aria-hidden="true" className="size-5 text-ink-soft" />
          <h2 className="text-lg font-semibold text-ink">{t('attachmentsTitle')}</h2>
        </div>

        {signedAttachments.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('noAttachments')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {signedAttachments.map((att) => {
              const isImage = att.mimeType.startsWith('image/');
              return (
                <li
                  key={att.id}
                  className="flex flex-col gap-3 rounded-field border border-line bg-paper p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-ink">
                      <FileTextIcon aria-hidden="true" className="size-4 text-ink-soft" />
                      <span className="font-medium">{att.fileName}</span>
                      <span className="text-xs text-ink-soft tabular-nums">
                        ({Math.max(1, Math.round(att.fileSize / 1024))} KB)
                      </span>
                    </div>
                    {att.signedUrl ? (
                      <a
                        href={att.signedUrl}
                        download={att.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        <ExternalLinkIcon aria-hidden="true" />
                        {t('openAttachment')}
                      </a>
                    ) : null}
                  </div>
                  {isImage && att.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Supabase Storage
                    <img
                      src={att.signedUrl}
                      alt={t('attachmentImageAlt')}
                      className="max-h-96 w-auto rounded-field border border-line object-contain"
                    />
                  ) : null}
                  <p className="text-xs text-ink-soft">{t('signedUrlNotice')}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
