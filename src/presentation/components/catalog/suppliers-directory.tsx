'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  SearchIcon,
  TruckIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import type { SupplierListItem } from '@/infrastructure/db/queries/purchases';
import { setSupplierActiveAction } from '@/presentation/actions/purchases';
import { Money } from '@/presentation/components/money';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { cn } from '@/presentation/lib/utils';
import { SupplierDialog } from './supplier-dialog';

type SupplierFilter = 'all' | 'active' | 'inactive';

export function SuppliersDirectory({
  suppliers,
  isReadOnly,
}: {
  suppliers: SupplierListItem[];
  isReadOnly: boolean;
}) {
  const t = useTranslations('Suppliers');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SupplierFilter>('all');
  const [editing, setEditing] = useState<SupplierOption | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<SupplierListItem | null>(null);
  const [busy, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: suppliers.length,
      active: suppliers.filter((s) => s.isActive).length,
      inactive: suppliers.filter((s) => !s.isActive).length,
    }),
    [suppliers],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (filter === 'active' && !s.isActive) return false;
      if (filter === 'inactive' && s.isActive) return false;
      if (!term) return true;
      return (
        s.tradeName.toLowerCase().includes(term) ||
        s.taxIdNumber.toLowerCase().includes(term) ||
        (s.contactName?.toLowerCase().includes(term) ?? false) ||
        (s.phone?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [suppliers, filter, query]);

  function runToggle(supplier: SupplierListItem, active: boolean) {
    startTransition(async () => {
      const result = await setSupplierActiveAction(supplier.id, active);
      setConfirmDeactivate(null);
      if (!result.ok) {
        sileo.error({ title: t('toggleError') });
        return;
      }
      sileo.clear();
      sileo.success({
        title: active
          ? t('toast.reactivated', { name: supplier.tradeName })
          : t('toast.deactivated', { name: supplier.tradeName }),
        duration: 6000,
        autopilot: { expand: 0, collapse: 5800 },
        button: {
          title: t('undo'),
          onClick: () => {
            startTransition(async () => {
              const undoResult = await setSupplierActiveAction(supplier.id, !active);
              if (!undoResult.ok) return;
              sileo.clear();
              sileo.info({ title: t('toast.undone') });
              router.refresh();
            });
          },
        },
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-ink-soft"
          />
          <label htmlFor="suppliers-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <Input
            id="suppliers-search"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className={cn('pl-10', query && 'pr-10')}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('clearSearch')}
              className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        {counts.inactive > 0 ? (
          <div
            role="group"
            aria-label={t('filterGroupLabel')}
            className="-mx-1 flex touch-pan-x [scrollbar-width:none] items-center gap-2 overflow-x-auto overflow-y-hidden px-1 py-0.5 [&::-webkit-scrollbar]:hidden"
          >
            {(['all', 'active', 'inactive'] as const).map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(key)}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.97]',
                    active
                      ? 'border-link-active bg-soft text-soft-ink'
                      : 'border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                  )}
                >
                  <span>{t(`filters.${key}`)}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                      active ? 'bg-surface/70 text-soft-ink' : 'bg-paper-deep text-ink-soft',
                    )}
                  >
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <TruckIcon aria-hidden="true" className="size-8 text-ink-soft" />
          <p className="max-w-sm text-sm text-ink-soft">{t('noResults')}</p>
          {query || filter !== 'all' ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              {t('clearFilters')}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {visible.map((supplier) => (
            <li
              key={supplier.id}
              className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    supplier.isActive ? 'bg-soft text-soft-ink' : 'bg-paper-deep text-ink-soft',
                  )}
                >
                  {supplier.tradeName.trim().charAt(0).toUpperCase()}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/inventory/purchases?supplierId=${supplier.id}`}
                      className="truncate text-base font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-link-active"
                    >
                      {supplier.tradeName}
                    </Link>
                    {supplier.isActive ? null : (
                      <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                        {t('inactive')}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                    <span className="tabular-nums">
                      {t('taxId')} {supplier.taxIdNumber}
                    </span>
                    {supplier.contactName ? (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon aria-hidden="true" className="size-3.5" />
                        {supplier.contactName}
                      </span>
                    ) : null}
                    {supplier.phone ? (
                      <a
                        href={`tel:${supplier.phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 text-link-active tabular-nums hover:underline"
                      >
                        <PhoneIcon aria-hidden="true" className="size-3.5" />
                        {supplier.phone}
                      </a>
                    ) : null}
                    {supplier.email ? (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="inline-flex items-center gap-1 text-link-active hover:underline"
                      >
                        <MailIcon aria-hidden="true" className="size-3.5" />
                        {supplier.email}
                      </a>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-ink-soft tabular-nums">
                    <span>{t('purchasesCount', { count: supplier.purchasesCount })}</span>
                    {supplier.purchasesCount > 0 ? (
                      <span>
                        {t('totalPurchased')}:{' '}
                        <Money amount={supplier.totalPurchased} currency="PEN" />
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-start gap-2 border-t border-line pt-3 sm:justify-end sm:border-t-0 sm:pt-0">
                <Link
                  href={`/inventory/purchases?supplierId=${supplier.id}`}
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  {t('seePurchases')}
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </Link>

                {!isReadOnly ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditing(supplier)}
                    >
                      <PencilIcon aria-hidden="true" className="size-4" />
                      {t('editButton')}
                    </Button>

                    {supplier.isActive ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmDeactivate(supplier)}
                      >
                        <ArchiveIcon aria-hidden="true" className="size-4" />
                        {t('deactivateButton')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => runToggle(supplier, true)}
                      >
                        <ArchiveRestoreIcon aria-hidden="true" className="size-4" />
                        {t('reactivateButton')}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <SupplierDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        supplier={editing}
        onUpdated={() => router.refresh()}
      />

      <ResponsiveSheet
        open={Boolean(confirmDeactivate)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivate(null);
        }}
        title={t('deactivateTitle', { name: confirmDeactivate?.tradeName ?? '' })}
        description={t('deactivateBody')}
        closeLabel={t('cancel')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmDeactivate(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => confirmDeactivate && runToggle(confirmDeactivate, false)}
            >
              {t('deactivateConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{t('deactivateHint')}</p>
      </ResponsiveSheet>
    </div>
  );
}
