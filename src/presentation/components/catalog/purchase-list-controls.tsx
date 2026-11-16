'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SearchIcon, XIcon } from 'lucide-react';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Input } from '@/presentation/components/ui/input';
import { cn } from '@/presentation/lib/utils';

export function PurchaseListControls({
  suppliers,
  activeSupplierId,
  query,
}: {
  suppliers: SupplierOption[];
  activeSupplierId: string;
  query: string;
}) {
  const t = useTranslations('Purchases.history');
  const router = useRouter();
  const [text, setText] = useState(query);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildHref(next: { supplierId?: string; q?: string }) {
    const params = new URLSearchParams();
    const sId = next.supplierId ?? activeSupplierId;
    const q = (next.q ?? text).trim();
    if (sId) params.set('supplierId', sId);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `/inventory/purchases?${qs}` : '/inventory/purchases';
  }

  function navigate(next: { supplierId?: string; q?: string }) {
    startTransition(() => {
      router.replace(buildHref(next), { scroll: false });
    });
  }

  function handleQueryChange(nextValue: string) {
    setText(nextValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      navigate({ q: nextValue });
    }, 220);
  }

  const hasFilters = Boolean(activeSupplierId || text.trim());

  return (
    <div
      className={cn(
        'flex flex-col gap-2 transition-opacity duration-150 sm:flex-row sm:items-center',
        isPending && 'opacity-75',
      )}
    >
      <div className="relative flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-ink-soft"
        />
        <label htmlFor="purchase-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <Input
          id="purchase-search"
          type="search"
          enterKeyHint="search"
          value={text}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className={cn('pl-10', text && 'pr-10')}
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText('');
              if (timerRef.current) clearTimeout(timerRef.current);
              navigate({ q: '' });
            }}
            aria-label={t('clearSearch')}
            className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-link-active"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {suppliers.length > 0 ? (
        <div className="sm:w-64">
          <label htmlFor="supplier-filter" className="sr-only">
            {t('filterSupplier')}
          </label>
          <NativeSelect
            id="supplier-filter"
            value={activeSupplierId}
            onChange={(e) => navigate({ supplierId: e.target.value })}
            aria-label={t('filterSupplier')}
          >
            <option value="">{t('allSuppliers')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tradeName}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            setText('');
            if (timerRef.current) clearTimeout(timerRef.current);
            startTransition(() => router.replace('/inventory/purchases', { scroll: false }));
          }}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium text-link-active hover:underline focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.97]"
        >
          {t('clearFilters')}
        </button>
      ) : null}
    </div>
  );
}
