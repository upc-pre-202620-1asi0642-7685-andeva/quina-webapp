'use client';

import Form from 'next/form';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SearchIcon, XIcon } from 'lucide-react';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import {
  INVENTORY_FILTERS,
  INVENTORY_SORTS,
  inventoryListHref,
  type InventoryFilter,
  type InventorySort,
} from '@/presentation/lib/inventory-list';
import { cn } from '@/presentation/lib/utils';

export function InventoryListControls({
  query,
  filter,
  sort,
  counts,
  canSeeCosts,
}: {
  query: string;
  filter: InventoryFilter;
  sort: InventorySort;
  counts: Record<InventoryFilter, number>;
  canSeeCosts: boolean;
}) {
  const t = useTranslations('Inventory.list');
  const router = useRouter();
  const [text, setText] = useState(query);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleSorts = canSeeCosts
    ? INVENTORY_SORTS
    : INVENTORY_SORTS.filter((option) => option !== 'valueDesc');

  function navigate(next: { q?: string; filter?: InventoryFilter; sort?: InventorySort }) {
    const href = inventoryListHref({
      q: next.q ?? text,
      filter: next.filter ?? filter,
      sort: next.sort ?? sort,
    });
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function handleQueryChange(nextValue: string) {
    setText(nextValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      navigate({ q: nextValue });
    }, 220);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    navigate({ q: text });
  }

  const hasFilters = Boolean(text.trim() || filter !== 'all' || sort !== 'name');

  return (
    <div
      className={cn(
        'flex flex-col gap-3 transition-opacity duration-150',
        isPending && 'opacity-75',
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Form role="search" action="" onSubmit={handleSubmit} className="flex flex-1 gap-2">
          <label htmlFor="product-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <div className="relative flex-1">
            <Input
              id="product-search"
              name="q"
              type="search"
              enterKeyHint="search"
              value={text}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              className={text ? 'pr-10' : undefined}
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
          <Button type="submit" variant="secondary" size="icon">
            <SearchIcon aria-hidden="true" />
            <span className="sr-only">{t('searchSubmit')}</span>
          </Button>
        </Form>

        <div className="flex items-center gap-2 sm:w-56">
          <label htmlFor="inventory-sort" className="sr-only">
            {t('sortLabel')}
          </label>
          <NativeSelect
            id="inventory-sort"
            value={sort}
            onChange={(e) => navigate({ sort: e.target.value as InventorySort })}
            aria-label={t('sortLabel')}
          >
            {visibleSorts.map((option) => (
              <option key={option} value={option}>
                {t(`sorts.${option}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div
        role="group"
        aria-label={t('filterGroupLabel')}
        className="-mx-1 flex touch-pan-x [scrollbar-width:none] items-center gap-2 overflow-x-auto overflow-y-hidden px-1 py-0.5 [&::-webkit-scrollbar]:hidden"
      >
        {INVENTORY_FILTERS.map((key) => {
          const active = filter === key;
          const count = counts[key];
          if (key !== 'all' && key !== 'low' && count === 0 && !active) return null;
          const isAlert = key === 'low' || key === 'noStock';
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => navigate({ filter: key })}
              className={cn(
                'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                active
                  ? isAlert
                    ? 'border-amber bg-amber/12 text-amber-ink'
                    : 'border-link-active bg-soft text-soft-ink'
                  : 'border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
              )}
            >
              <span>{t(`filters.${key}`)}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  active
                    ? isAlert
                      ? 'bg-surface/70 text-amber-ink'
                      : 'bg-surface/70 text-soft-ink'
                    : 'bg-paper-deep text-ink-soft',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setText('');
              if (timerRef.current) clearTimeout(timerRef.current);
              startTransition(() => router.replace('/inventory', { scroll: false }));
            }}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium text-link-active hover:underline focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.97]"
          >
            {t('clearFilters')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
