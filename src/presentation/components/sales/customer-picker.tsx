'use client';

import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserRoundIcon, XIcon } from 'lucide-react';
import type { CounterCustomer } from '@/infrastructure/db/queries/sales';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { cn } from '@/presentation/lib/utils';

const MAX_OPTIONS = 6;

/**
 * Buscador de vecinos del mostrador (patrón combobox de ARIA): se escribe el
 * nombre o el DNI y un toque lo elige (D7, primer toque del fiado).
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  detail,
}: {
  customers: CounterCustomer[];
  value: CounterCustomer | null;
  onChange: (customer: CounterCustomer | null) => void;
  /** Disponible o motivo de bloqueo del vecino elegido. */
  detail: React.ReactNode;
}) {
  const t = useTranslations('Sales.customer');
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
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
    return (
      <div className="flex items-center gap-3 rounded-card border border-link-active bg-surface p-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink"
        >
          <UserRoundIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-ink">{value.name}</span>
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
    );
  }

  const listId = `${id}-list`;
  const expanded = open && query.trim() !== '';
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div className="relative flex flex-col gap-2">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-ink">
        {t('label')}
      </label>
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
            setActive((i) => Math.min(i + 1, options.length - 1));
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
      <p id={`${id}-hint`} className="text-[13px] text-ink-soft">
        {t('hint')}
      </p>
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('results')}
          className="absolute inset-x-0 top-[calc(100%-1.5rem)] z-20 flex flex-col overflow-hidden rounded-card border border-line bg-surface py-1 shadow-float"
        >
          {options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-soft">{t('noResults')}</li>
          ) : (
            options.map((customer, index) => (
              <li
                key={customer.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown antes del blur: el toque elige sin cerrar la lista primero
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(customer)}
                className={cn(
                  'flex min-h-11 cursor-pointer flex-col justify-center px-4 py-2',
                  index === active ? 'bg-soft text-soft-ink' : 'text-ink',
                )}
              >
                <span className="text-sm font-medium">{customer.name}</span>
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    index === active ? 'text-soft-ink-2' : 'text-ink-soft',
                  )}
                >
                  {customer.account
                    ? t('optionCredit', { number: customer.documentNumber })
                    : t('optionNoCredit', { number: customer.documentNumber })}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
