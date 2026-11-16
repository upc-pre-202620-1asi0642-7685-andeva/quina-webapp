'use client';

import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CopyIcon,
  ExternalLinkIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import type { AuditTone, PresentedAuditEntry } from '@/presentation/lib/audit-presenter';
import { cn } from '@/presentation/lib/utils';

const TONE_STYLES: Record<AuditTone, string> = {
  error: 'bg-error/12 text-error-ink',
  amber: 'bg-amber/12 text-amber-ink',
  success: 'bg-success/12 text-success-ink',
  soft: 'bg-soft text-soft-ink',
  neutral: 'bg-paper-deep text-ink-soft',
};

const TONE_ICONS = {
  error: CircleAlertIcon,
  amber: TriangleAlertIcon,
  success: CircleCheckIcon,
  soft: InfoIcon,
  neutral: CircleDotIcon,
} as const;

export function AuditToneBadge({ tone, label }: { tone: AuditTone; label: string }) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap',
        TONE_STYLES[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function AuditSecondaryFilters({
  defaultOpen,
  moreLabel,
  lessLabel,
  children,
}: {
  defaultOpen: boolean;
  moreLabel: string;
  lessLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <div className="lg:hidden">
        <Button
          type="button"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="w-full justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
            {open ? lessLabel : moreLabel}
          </span>
          {open ? (
            <ChevronUpIcon aria-hidden="true" className="size-4" />
          ) : (
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2 lg:col-span-full lg:grid lg:grid-cols-4',
          open ? 'grid' : 'hidden',
        )}
      >
        {children}
      </div>
    </>
  );
}

export function AuditDetailSheet({
  entry,
  open,
  onOpenChange,
}: {
  entry: PresentedAuditEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('Audit');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!entry) return null;

  const isCopied = copiedId === entry.id;

  async function handleCopyId(entityId: string, entryId: string) {
    try {
      await navigator.clipboard.writeText(entityId);
      setCopiedId(entryId);
      sileo.success({ title: t('detail.copiedId') });
      window.setTimeout(() => {
        setCopiedId((current) => (current === entryId ? null : current));
      }, 2000);
    } catch {
      sileo.error({ title: t('detail.copyError') });
    }
  }

  const titleNode = (
    <span className="flex flex-wrap items-center gap-2">
      <AuditToneBadge tone={entry.tone} label={entry.actionLabel} />
      <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
        {entry.entityLabel}
      </span>
    </span>
  );

  const footerNode = (
    <>
      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
        {t('detail.close')}
      </Button>
      {entry.deepLink ? (
        <Link href={entry.deepLink} className={buttonVariants({ variant: 'secondary' })}>
          <ExternalLinkIcon aria-hidden="true" />
          {t('detail.openRecord')}
        </Link>
      ) : null}
    </>
  );

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={titleNode}
      description={entry.summary}
      closeLabel={t('detail.close')}
      maxWidthClass="lg:max-w-2xl"
      footer={footerNode}
    >
      <dl className="grid gap-3 rounded-card border border-line bg-paper p-4 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] text-ink-soft">{t('detail.dateTime')}</dt>
          <dd className="font-medium text-ink tabular-nums">{entry.dateTimeLabel}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] text-ink-soft">{t('detail.actor')}</dt>
          <dd className="font-medium text-ink">{entry.actorName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] text-ink-soft">{t('detail.ip')}</dt>
          <dd className="font-medium text-ink tabular-nums">{entry.ipAddress ?? '—'}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] text-ink-soft">{t('detail.device')}</dt>
          <dd className="font-medium text-ink">{entry.deviceSummary ?? '—'}</dd>
        </div>
        {entry.entityId ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <dt className="text-[13px] text-ink-soft">{t('detail.entityId')}</dt>
            <dd className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-line bg-surface px-3 py-1.5">
              <span className="min-w-0 font-mono text-xs break-all text-ink tabular-nums">
                {entry.entityId}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleCopyId(entry.entityId!, entry.id)}
                className="shrink-0"
              >
                {isCopied ? (
                  <CheckIcon aria-hidden="true" className="text-success-ink" />
                ) : (
                  <CopyIcon aria-hidden="true" />
                )}
                <span>{isCopied ? t('detail.copiedId') : t('detail.copyId')}</span>
              </Button>
            </dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="audit-diff-heading" className="flex flex-col gap-2">
        <h3 id="audit-diff-heading" className="text-sm font-semibold text-ink">
          {t('detail.diffTitle')}
        </h3>
        {entry.diffRows.length === 0 ? (
          <p className="rounded-card border border-line bg-paper p-4 text-sm text-ink-soft">
            {t('detail.noDiffData')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-paper-deep text-left text-ink-soft">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    {t('detail.fieldCol')}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    {t('before')}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    {t('after')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entry.diffRows.map((row) => (
                  <tr
                    key={row.field}
                    className={cn('border-t border-line align-top', row.changed && 'bg-soft/25')}
                  >
                    <td className="px-3 py-2.5 font-medium text-ink">{row.fieldLabel}</td>
                    <td className="px-3 py-2.5 break-words text-ink-soft tabular-nums">
                      {row.before ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-medium break-words text-ink tabular-nums">
                      {row.after ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {entry.oldData || entry.newData ? (
        <details className="rounded-card border border-line bg-paper-deep">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink select-none focus-visible:outline-2 focus-visible:outline-link-active">
            {t('detail.rawJsonSummary')}
          </summary>
          <pre className="max-h-64 overflow-auto border-t border-line p-4 font-mono text-xs leading-relaxed text-ink-soft tabular-nums">
            {JSON.stringify(
              {
                ...(entry.oldData ? { oldData: entry.oldData } : {}),
                ...(entry.newData ? { newData: entry.newData } : {}),
              },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </ResponsiveSheet>
  );
}

export function AuditRecordsView({ entries }: { entries: PresentedAuditEntry[] }) {
  const t = useTranslations('Audit');
  const [selected, setSelected] = useState<PresentedAuditEntry | null>(null);

  return (
    <>
      {/* Celular: tarjetas estructuradas sin JSON crudo (DESIGN.md §5) */}
      <ol className="flex flex-col gap-2 lg:hidden">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setSelected(entry)}
              className="flex w-full cursor-pointer flex-col gap-2.5 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AuditToneBadge tone={entry.tone} label={entry.actionLabel} />
                <span className="text-[13px] text-ink-soft tabular-nums">
                  {entry.dateTimeLabel}
                </span>
              </div>

              <p className="text-sm font-medium text-ink tabular-nums">{entry.summary}</p>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[13px] text-ink-soft">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                    {entry.entityLabel}
                  </span>
                  <span>{entry.actorName}</span>
                </div>
                <span className="inline-flex items-center gap-1 font-medium text-link-active">
                  {t('table.viewDetail')}
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </span>
              </div>
            </button>
          </li>
        ))}
      </ol>

      {/* Escritorio: tabla con encabezado fijo (DESIGN.md §5) */}
      <div className="hidden overflow-clip rounded-card border border-line bg-surface lg:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-paper-deep text-left text-ink-soft">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('table.colDate')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('table.colEvent')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('table.colSummary')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('table.colActor')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('table.colDetail')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                onClick={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest('button, a')) return;
                  setSelected(entry);
                }}
                className="cursor-pointer border-t border-line transition-colors hover:bg-surface-hover"
              >
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft tabular-nums">
                  {entry.dateTimeLabel}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <AuditToneBadge tone={entry.tone} label={entry.actionLabel} />
                    <span className="text-[13px] text-ink-soft">{entry.entityLabel}</span>
                  </div>
                </td>
                <td className="max-w-md px-4 py-3 text-ink tabular-nums">{entry.summary}</td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{entry.actorName}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(entry)}
                    className="text-link-active"
                  >
                    <span>{t('table.viewDetail')}</span>
                    <ChevronRightIcon aria-hidden="true" className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AuditDetailSheet
        entry={selected}
        open={selected !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelected(null);
        }}
      />
    </>
  );
}
