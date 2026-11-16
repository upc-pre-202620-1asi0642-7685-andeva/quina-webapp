'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangleIcon, SearchIcon, UserPlusIcon, UserRoundIcon, XIcon } from 'lucide-react';
import { availableCredit, type CreditAccountSnapshot } from '@/core/domain/sales/credit-sale';
import type { CounterCustomer } from '@/infrastructure/db/queries/sales';
import { formatMoney } from '@/presentation/components/money';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { cn } from '@/presentation/lib/utils';

const MAX_OPTIONS = 6;

export type CreditUsageSummary = {
  used: string;
  limit: string;
  ratio: number;
  nearLimit: boolean;
  afterSale?: string | null;
};

function optionBlockReason(account: CreditAccountSnapshot) {
  if (account.status === 'SUSPENDED') return 'ACCOUNT_SUSPENDED' as const;
  if (account.status === 'BLOCKED') return 'ACCOUNT_BLOCKED' as const;
  if (account.hasOverdueCycle) return 'ACCOUNT_OVERDUE' as const;
  if (account.terms.currency !== 'PEN') return 'USD_ACCOUNT' as const;
  return null;
}

/**
 * Buscador de vecinos del mostrador (patrón combobox de ARIA): al enfocar sugiere
 * los vecinos con fiado activo y al escribir filtra por nombre o DNI (D7).
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  detail,
  creditUsage,
  canCreateCustomer = false,
}: {
  customers: CounterCustomer[];
  value: CounterCustomer | null;
  onChange: (customer: CounterCustomer | null) => void;
  /** Disponible o motivo de bloqueo del vecino elegido. */
  detail: React.ReactNode;
  /** Uso actual de la línea de fiado y saldo proyectado con el carrito. */
  creditUsage?: CreditUsageSummary | null;
  canCreateCustomer?: boolean;
}) {
  const t = useTranslations('Sales.customer');
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      // Reconocer antes que recordar: al tocar el campo se sugieren primero vecinos con fiado al día
      return [...customers]
        .sort((a, b) => {
          const aReady = a.account && optionBlockReason(a.account) === null ? 0 : a.account ? 1 : 2;
          const bReady = b.account && optionBlockReason(b.account) === null ? 0 : b.account ? 1 : 2;
          return aReady - bReady;
        })
        .slice(0, MAX_OPTIONS);
    }
    return customers
      .filter((c) => c.name.toLowerCase().includes(term) || c.documentNumber.startsWith(term))
      .slice(0, MAX_OPTIONS);
  }, [customers, query]);

  function choose(customer: CounterCustomer) {
    onChange(customer);
    setQuery('');
    setOpen(false);
  }

  if (value) {
    const pct = creditUsage ? Math.min(100, Math.max(0, Math.round(creditUsage.ratio * 100))) : 0;
    return (
      <div className="flex flex-col gap-2.5 rounded-card border border-link-active bg-surface p-3.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink"
          >
            <UserRoundIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{value.name}</span>
              {creditUsage?.nearLimit ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2 py-0.5 text-xs font-medium text-amber-ink">
                  <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                  {t('nearLimit')}
                </span>
              ) : null}
            </div>
            <span className="text-[13px] text-ink-soft tabular-nums">
              {t('document', { number: value.documentNumber })}
            </span>
            <div className="text-[13px]">{detail}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null)}
            aria-label={t('clear', { name: value.name })}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>

        {creditUsage ? (
          <div className="flex flex-col gap-1.5 border-t border-line pt-2">
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-paper-deep"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-200 ease-(--ease-out-expo)',
                  creditUsage.nearLimit ? 'bg-amber' : 'bg-link-active',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-soft tabular-nums">
              <span>
                {t('usedOfLimit', {
                  used: formatMoney(creditUsage.used, 'PEN'),
                  limit: formatMoney(creditUsage.limit, 'PEN'),
                })}
              </span>
              {creditUsage.afterSale ? (
                <span className="font-medium text-ink">
                  {t('afterSale', { amount: formatMoney(creditUsage.afterSale, 'PEN') })}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const listId = `${id}-list`;
  const expanded = open && (query.trim() !== '' || options.length > 0);
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-ink">
        {t('label')}
      </label>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4.5 text-ink-soft"
        />
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && options[active] ? optionId(active) : undefined}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          value={query}
          placeholder={t('placeholder')}
          className={cn('pl-10', query ? 'pr-11' : '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, Math.max(0, options.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && expanded && options[active]) {
              e.preventDefault();
              choose(options[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {query ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              setActive(0);
            }}
            aria-label={t('clearQuery')}
            className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-full text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-link-active"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        ) : null}

        {expanded ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={t('results')}
            className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 flex flex-col overflow-hidden rounded-card border border-line bg-surface py-1 shadow-float"
          >
            {options.length === 0 ? (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-ink-soft">
                <span>{t('noResults')}</span>
                {canCreateCustomer ? (
                  <Link
                    href="/customers/new"
                    onMouseDown={(e) => e.preventDefault()}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    <UserPlusIcon aria-hidden="true" className="size-4" />
                    {t('newCustomer')}
                  </Link>
                ) : null}
              </li>
            ) : (
              options.map((customer, index) => {
                const reason = customer.account ? optionBlockReason(customer.account) : null;
                const avail =
                  customer.account && reason === null
                    ? formatMoney(availableCredit(customer.account).toFixed2(), 'PEN')
                    : null;
                return (
                  <li
                    key={customer.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    // mousedown antes del blur: el toque elige sin cerrar la lista primero
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(customer)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 transition-colors',
                      index === active
                        ? 'bg-soft text-soft-ink'
                        : 'text-ink hover:bg-surface-hover',
                    )}
                  >
                    <span className="truncate text-sm font-medium">{customer.name}</span>
                    <span
                      className={cn(
                        'shrink-0 text-[13px] tabular-nums',
                        reason
                          ? 'font-medium text-error-ink'
                          : index === active
                            ? 'text-soft-ink-2'
                            : 'text-ink-soft',
                      )}
                    >
                      {!customer.account
                        ? t('optionNoCredit', { number: customer.documentNumber })
                        : reason
                          ? t('optionBlocked', {
                              number: customer.documentNumber,
                              reason: t(`optionReasons.${reason}`),
                            })
                          : t('optionAvailable', {
                              number: customer.documentNumber,
                              amount: avail ?? '',
                            })}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="text-[13px] text-ink-soft">
        {t('hint')}
      </p>
    </div>
  );
}
