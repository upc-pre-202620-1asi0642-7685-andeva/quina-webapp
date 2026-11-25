'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BanknoteIcon,
  CheckIcon,
  CopyIcon,
  LandmarkIcon,
  Loader2Icon,
  QrCodeIcon,
  SmartphoneIcon,
  XIcon,
} from 'lucide-react';
import { sileo } from 'sileo';
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
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { cn } from '@/presentation/lib/utils';

const BILLS = ['10', '20', '50', '100', '200'];

const METHOD_ICONS = {
  CASH: BanknoteIcon,
  YAPE: SmartphoneIcon,
  PLIN: SmartphoneIcon,
  TRANSFER: LandmarkIcon,
} as const;

export type CounterPaymentDetails = {
  storeName: string;
  yapeNumber: string | null;
  plinNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankCci: string | null;
  qrUrl: string | null;
};

/**
 * Cobro del ciclo (US13): el monto no se edita porque no hay pagos parciales
 * (crit. 4). En efectivo se calcula el vuelto como en el mostrador (D13 del Plan 3);
 * en medios digitales muestra el número/cuenta/QR de la tienda para cobrar rápido.
 */
export function PayForm({
  customerId,
  cycleId,
  amountDue,
  currency,
  isReadOnly = false,
  storePayment,
}: {
  customerId: string;
  cycleId: string;
  amountDue: string;
  currency: Currency;
  isReadOnly?: boolean;
  storePayment?: CounterPaymentDetails;
}) {
  const t = useTranslations('Collections.pay');
  const id = useId();
  const router = useRouter();
  const [method, setMethod] = useState<DebtPaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  const total = MoneyValue.of(amountDue, currency);
  const cash = settleCashPayment(total, method === 'CASH' ? 'CASH' : 'YAPE', received);
  const symbol = currency === 'PEN' ? 'S/' : 'US$';
  const inlineCashError =
    method === 'CASH' && received.trim().length > 0 && !cash.ok ? cash.error : null;

  async function copyValue(key: string, label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      sileo.success({ title: t('copiedDetail', { label }) });
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      sileo.error({ title: t('copyError') });
    }
  }

  function submit() {
    if (isReadOnly) return;
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

  const digitalRows: { key: string; label: string; value: string; copyable: boolean }[] = [];
  if (storePayment) {
    if (method === 'YAPE' && storePayment.yapeNumber) {
      digitalRows.push({
        key: 'yape',
        label: t('methods.YAPE'),
        value: storePayment.yapeNumber,
        copyable: true,
      });
    } else if (method === 'PLIN' && storePayment.plinNumber) {
      digitalRows.push({
        key: 'plin',
        label: t('methods.PLIN'),
        value: storePayment.plinNumber,
        copyable: true,
      });
    } else if (method === 'TRANSFER') {
      if (storePayment.bankName) {
        digitalRows.push({
          key: 'bank',
          label: t('bankLabel'),
          value: storePayment.bankName,
          copyable: false,
        });
      }
      if (storePayment.bankAccountNumber) {
        digitalRows.push({
          key: 'account',
          label: t('accountLabel'),
          value: storePayment.bankAccountNumber,
          copyable: true,
        });
      }
      if (storePayment.bankCci) {
        digitalRows.push({
          key: 'cci',
          label: t('cciLabel'),
          value: storePayment.bankCci,
          copyable: true,
        });
      }
    }
  }
  const showQrButton = Boolean(storePayment?.qrUrl) && (method === 'YAPE' || method === 'PLIN');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">{t('methodLabel')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {DEBT_PAYMENT_METHODS.map((value) => {
            const Icon = METHOD_ICONS[value];
            return (
              <label
                key={value}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-field border px-2 text-sm font-medium transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) active:scale-[0.97] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
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
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span>{t(`methods.${value}`)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {method === 'CASH' ? (
        <div className="flex flex-col gap-2.5">
          <label htmlFor={`${id}-received`} className="text-sm font-medium text-ink">
            {t('receivedLabel')}
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft"
            >
              {symbol}
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
              aria-invalid={Boolean(inlineCashError)}
              aria-describedby={inlineCashError ? `${id}-received-error` : `${id}-received-hint`}
              className={cn(
                'tabular-nums',
                currency === 'PEN' ? 'pl-10' : 'pl-14',
                received ? 'pr-11' : undefined,
              )}
            />
            {received ? (
              <button
                type="button"
                onClick={() => {
                  setReceived('');
                  setError(null);
                }}
                aria-label={t('clearReceived')}
                className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-link-active"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn(received === '' && 'border-link-active bg-soft text-soft-ink')}
              onClick={() => {
                setReceived('');
                setError(null);
              }}
            >
              {t('exactChip', { amount: formatMoney(amountDue, currency) })}
            </Button>
            {BILLS.filter((bill) => MoneyValue.of(bill, currency).compare(total) >= 0)
              .slice(0, 4)
              .map((bill) => (
                <Button
                  key={bill}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={cn(received === bill && 'border-link-active bg-soft text-soft-ink')}
                  onClick={() => {
                    setReceived(bill);
                    setError(null);
                  }}
                >
                  {formatMoney(bill, currency)}
                </Button>
              ))}
          </div>
          {inlineCashError ? (
            <p id={`${id}-received-error`} className="text-[13px] font-medium text-error-ink">
              {t(`errors.${inlineCashError}`)}
            </p>
          ) : (
            <p id={`${id}-received-hint`} className="text-[13px] text-ink-soft">
              {t('receivedHint')}
            </p>
          )}
          {cash.ok && cash.value.changeGiven ? (
            <p
              className="flex items-baseline justify-between rounded-field bg-soft px-4 py-3"
              aria-live="polite"
            >
              <span className="text-sm font-medium text-soft-ink">{t('change')}</span>
              <Money
                amount={cash.value.changeGiven.toFixed2()}
                currency={currency}
                className="text-lg font-bold text-soft-ink"
              />
            </p>
          ) : null}
        </div>
      ) : storePayment && (digitalRows.length > 0 || showQrButton) ? (
        <div className="flex flex-col gap-3 rounded-field bg-paper-deep p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-ink-soft">
              {t('counterDetailsTitle')}
            </span>
            {showQrButton ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setQrOpen(true)}>
                <QrCodeIcon aria-hidden="true" className="size-4" />
                {t('showQr')}
              </Button>
            ) : null}
          </div>
          {digitalRows.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-field border border-line bg-surface">
              {digitalRows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] text-ink-soft">{row.label}</span>
                    <span className="text-sm font-semibold break-all text-ink tabular-nums select-all">
                      {row.value}
                    </span>
                  </div>
                  {row.copyable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyValue(row.key, row.label, row.value)}
                      aria-label={t('copyDetailLabel', { label: row.label })}
                    >
                      {copiedKey === row.key ? (
                        <CheckIcon aria-hidden="true" className="size-4 text-success-ink" />
                      ) : (
                        <CopyIcon aria-hidden="true" className="size-4 text-ink-soft" />
                      )}
                      <span>{copiedKey === row.key ? t('copiedShort') : t('copy')}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Notice tone="error">
          <p>{t(`errors.${error}`)}</p>
        </Notice>
      ) : null}

      <Button type="submit" size="lg" disabled={busy || isReadOnly}>
        {busy ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <BanknoteIcon aria-hidden="true" />
        )}
        {busy ? t('submitting') : t('submit', { amount: formatMoney(amountDue, currency) })}
      </Button>

      {storePayment?.qrUrl ? (
        <ResponsiveSheet
          open={qrOpen}
          onOpenChange={setQrOpen}
          title={t('qrTitle', { store: storePayment.storeName })}
          description={t('qrHint', { amount: formatMoney(amountDue, currency) })}
          closeLabel={t('closeQr')}
          footer={
            <Button type="button" variant="secondary" size="lg" onClick={() => setQrOpen(false)}>
              {t('closeQr')}
            </Button>
          }
        >
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="rounded-card border border-line bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal */}
              <img
                src={storePayment.qrUrl}
                alt={t('qrAlt')}
                className="size-64 max-w-full object-contain sm:size-72"
              />
            </div>
          </div>
        </ResponsiveSheet>
      ) : null}
    </form>
  );
}
