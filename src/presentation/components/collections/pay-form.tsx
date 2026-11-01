'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BanknoteIcon } from 'lucide-react';
import {
  DEBT_PAYMENT_METHODS,
  type DebtPaymentMethod,
} from '@/core/domain/ports/payment-repository';
import { settleCashPayment } from '@/core/domain/sales/cash-payment';
import { Money as MoneyValue, type Currency } from '@/core/domain/shared/money';
import { registerPaymentAction } from '@/presentation/actions/payments';
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { cn } from '@/presentation/lib/utils';

const BILLS = ['10', '20', '50', '100', '200'];

/**
 * Cobro del ciclo (US13): el monto no se edita porque no hay pagos parciales
 * (crit. 4). En efectivo se calcula el vuelto como en el mostrador (D13 del Plan 3).
 */
export function PayForm({
  customerId,
  cycleId,
  amountDue,
  currency,
}: {
  customerId: string;
  cycleId: string;
  amountDue: string;
  currency: Currency;
}) {
  const t = useTranslations('Collections.pay');
  const id = useId();
  const router = useRouter();
  const [method, setMethod] = useState<DebtPaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const total = MoneyValue.of(amountDue, currency);
  const cash = settleCashPayment(total, method === 'CASH' ? 'CASH' : 'YAPE', received);

  function submit() {
    setError(null);
    if (!cash.ok) {
      setError(cash.error);
      return;
    }
    startTransition(async () => {
      const result = await registerPaymentAction({
        customerId,
        cycleId,
        amount: amountDue,
        method,
        amountReceived: method === 'CASH' ? received : '',
      });
      if (!result.ok) {
        setError(result.error);
        if (result.error === 'CYCLE_NOT_OLDEST' || result.error === 'OBJECTION_PENDING') {
          router.refresh();
        }
        return;
      }
      const change = result.changeGiven ? `&change=${result.changeGiven}` : '';
      router.push(`/payments/${result.paymentId}?notice=paid${change}`);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">{t('methodLabel')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DEBT_PAYMENT_METHODS.map((value) => (
            <label
              key={value}
              className={cn(
                'flex h-11 cursor-pointer items-center justify-center rounded-field border text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
                method === value
                  ? 'border-link-active bg-soft text-soft-ink'
                  : 'border-line bg-surface text-ink hover:bg-surface-hover',
              )}
            >
              <input
                type="radio"
                name={`${id}-method`}
                value={value}
                checked={method === value}
                onChange={() => {
                  setMethod(value);
                  setError(null);
                }}
                className="sr-only"
              />
              {t(`methods.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {method === 'CASH' ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-received`} className="text-sm font-medium text-ink">
            {t('receivedLabel')}
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft"
            >
              S/
            </span>
            <Input
              id={`${id}-received`}
              inputMode="decimal"
              autoComplete="off"
              value={received}
              onChange={(e) => {
                setReceived(e.target.value);
                setError(null);
              }}
              aria-describedby={`${id}-received-hint`}
              className="pl-10 tabular-nums"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {BILLS.filter((bill) => MoneyValue.of(bill, currency).compare(total) >= 0)
              .slice(0, 3)
              .map((bill) => (
                <Button
                  key={bill}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReceived(bill)}
                >
                  {formatMoney(bill, currency)}
                </Button>
              ))}
          </div>
          <p id={`${id}-received-hint`} className="text-[13px] text-ink-soft">
            {t('receivedHint')}
          </p>
          {cash.ok && cash.value.changeGiven ? (
            <p
              className="flex items-baseline justify-between rounded-field bg-paper-deep px-3 py-2"
              aria-live="polite"
            >
              <span className="text-sm text-ink">{t('change')}</span>
              <Money
                amount={cash.value.changeGiven.toFixed2()}
                currency={currency}
                className="text-lg font-semibold text-ink"
              />
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Notice tone="error">
          <p>{t(`errors.${error}`)}</p>
        </Notice>
      ) : null}

      <Button size="lg" onClick={submit} disabled={busy}>
        <BanknoteIcon aria-hidden="true" />
        {t('submit', { amount: formatMoney(amountDue, currency) })}
      </Button>
    </div>
  );
}
