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
  COLLECTIONS_FILTERS,
  COLLECTIONS_SORTS,
  PAYMENT_METHOD_FILTERS,
  collectionsHref,
  type CollectionsFilter,
  type CollectionsQuery,
  type CollectionsSort,
  type PaymentMethodFilter,
} from '@/presentation/lib/collections-list';
import { cn } from '@/presentation/lib/utils';

export function CollectionsControls({
  query,
  counts,
}: {
  query: CollectionsQuery;
  counts?: { dueSoon: number; blocked: number; bounced: number };
}) {
  const t = useTranslations('Collections.controls');
  const tMethods = useTranslations('Collections.pay.methods');
  const router = useRouter();
  const [text, setText] = useState(query.q);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCycleFilters = query.tab === 'due' || query.tab === 'overdue';
  const showMethodFilters = query.tab === 'payments';

  function navigate(patch: Partial<CollectionsQuery>) {
    const href = collectionsHref(
      { ...query, q: text },
      { ...patch, q: patch.q !== undefined ? patch.q : text },
    );
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

  const hasFilters = Boolean(
    text.trim() ||
    (showCycleFilters && (query.filter !== 'all' || query.sort !== 'dueDate')) ||
    (showMethodFilters && query.method !== 'all'),
  );

  const filterCount = (key: CollectionsFilter) => {
    if (!counts || key === 'all') return null;
    if (key === 'dueSoon') return counts.dueSoon;
    if (key === 'blocked') return counts.blocked;
    return counts.bounced;
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 transition-opacity duration-150',
        isPending && 'opacity-75',
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Form role="search" action="" onSubmit={handleSubmit} className="flex flex-1 gap-2">
          <label htmlFor="collections-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <div className="relative flex-1">
            <Input
              id="collections-search"
              name="q"
              type="search"
              enterKeyHint="search"
              value={text}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={
                showMethodFilters ? t('searchPaymentsPlaceholder') : t('searchPlaceholder')
              }
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

        {showCycleFilters ? (
          <div className="flex items-center gap-2 sm:w-56">
            <label htmlFor="collections-sort" className="sr-only">
              {t('sortLabel')}
            </label>
            <NativeSelect
              id="collections-sort"
              value={query.sort}
              onChange={(e) => navigate({ sort: e.target.value as CollectionsSort })}
              aria-label={t('sortLabel')}
            >
              {COLLECTIONS_SORTS.map((option) => (
                <option key={option} value={option}>
                  {t(`sort.${option}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {showCycleFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {COLLECTIONS_FILTERS.map((key) => {
            if (key === 'dueSoon' && query.tab === 'overdue') return null;
            const active = query.filter === key;
            const badge = filterCount(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => navigate({ filter: key })}
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-[transform,colors] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                  active
                    ? 'bg-soft text-soft-ink'
                    : 'border border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                )}
              >
                <span>{t(`filters.${key}`)}</span>
                {badge !== null && badge > 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                      key === 'blocked' || key === 'bounced'
                        ? 'bg-amber/12 text-amber-ink'
                        : 'bg-paper-deep text-ink-soft',
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setText('');
                navigate({ q: '', filter: 'all', sort: 'dueDate' });
              }}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium text-link-active transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <XIcon aria-hidden="true" className="size-4" />
              {t('clearAll')}
            </button>
          ) : null}
        </div>
      ) : null}

      {showMethodFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {PAYMENT_METHOD_FILTERS.map((key) => {
            const active = query.method === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => navigate({ method: key as PaymentMethodFilter })}
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium transition-[transform,colors] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                  active
                    ? 'bg-soft text-soft-ink'
                    : 'border border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                )}
              >
                {key === 'all' ? t('filters.all') : tMethods(key)}
              </button>
            );
          })}
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setText('');
                navigate({ q: '', method: 'all' });
              }}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium text-link-active transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <XIcon aria-hidden="true" className="size-4" />
              {t('clearAll')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
