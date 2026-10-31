'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Currency } from '@/core/domain/shared/money';
import type { TermsFormState } from '@/presentation/actions/customers';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import type { TermsField } from '@/presentation/validation/customer-form';

const RATE_TYPES = ['EFFECTIVE', 'NOMINAL'] as const;
const PERIODS = ['ANNUAL', 'MONTHLY', 'DAILY'] as const;
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 24 }, (_, i) => i + 1);

type Period = (typeof PERIODS)[number];

export type RateValues = {
  type: (typeof RATE_TYPES)[number];
  percent: string;
  period: Period;
  capitalization: Period | '';
};

export type TermsFormValues = {
  currency: Currency;
  creditLimit: string;
  compensatory: RateValues;
  moratory: RateValues;
  cutOffDay: number;
  paymentDueDay: number;
  maxInstallmentMonths: number;
};

/** Topes vigentes del BCRP en porcentaje efectivo anual, por moneda (null = sin tope). */
export type CapsByCurrency = Record<
  Currency,
  { compensatory: string | null; moratory: string | null }
>;

type Action = (state: TermsFormState, formData: FormData) => Promise<TermsFormState>;

export function TermsForm({
  action,
  initial,
  caps,
  isOpen,
  cancelHref,
  cashOnlyHref,
}: {
  action: Action;
  initial: TermsFormValues;
  caps: CapsByCurrency;
  /** La cuenta ya existe: se guardan cambios en vez de abrir el fiado. */
  isOpen: boolean;
  cancelHref: string;
  /** Solo en el alta: el vecino queda al contado por ahora. */
  cashOnlyHref?: string;
}) {
  const t = useTranslations('Customers.terms');
  const tPlans = useTranslations('Plans');
  const [state, formAction, pending] = useActionState(action, {});
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [creditLimit, setCreditLimit] = useState(initial.creditLimit);
  const [days, setDays] = useState({
    cutOffDay: initial.cutOffDay,
    paymentDueDay: initial.paymentDueDay,
    maxInstallmentMonths: initial.maxInstallmentMonths,
  });
  const setDay = (field: keyof typeof days) => (value: string) =>
    setDays((current) => ({ ...current, [field]: Number(value) }));
  const [rates, setRates] = useState({
    compensatory: initial.compensatory,
    moratory: initial.moratory,
  });

  const errors = state.errors ?? {};
  const error = (field: TermsField, kind?: 'compensatory' | 'moratory') => {
    const key = errors[field];
    if (!key) return undefined;
    return key === 'aboveCap' && kind
      ? t('errors.aboveCap', { cap: caps[currency][kind] ?? '—' })
      : t(`errors.${key}`);
  };

  function rateFields(kind: 'compensatory' | 'moratory') {
    const rate = rates[kind];
    const update = (patch: Partial<RateValues>) =>
      setRates((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
    const cap = caps[currency][kind];
    const percentHint = cap
      ? t(kind === 'compensatory' ? 'compensatoryPercentHint' : 'moratoryPercentHint', { cap })
      : t('noCapHint');

    return (
      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-base font-semibold text-ink">{t(`${kind}Title`)}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={`${kind}-type`} label={t('rateTypeLabel')} hint={t('rateTypeHint')}>
            {(props) => (
              <NativeSelect
                {...props}
                name={`${kind}Type`}
                value={rate.type}
                onChange={(e) => update({ type: e.target.value as RateValues['type'] })}
              >
                {RATE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`rateTypes.${type}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id={`${kind}-percent`}
            label={t('percentLabel')}
            hint={percentHint}
            error={error(`${kind}Percent`, kind)}
          >
            {(props) => (
              <div className="relative">
                <Input
                  {...props}
                  name={`${kind}Percent`}
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={rate.percent}
                  onChange={(e) => update({ percent: e.target.value })}
                  className="pr-10 tabular-nums"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-ink-soft"
                >
                  %
                </span>
              </div>
            )}
          </FormField>
          <FormField id={`${kind}-period`} label={t('periodLabel')} hint={t('periodHint')}>
            {(props) => (
              <NativeSelect
                {...props}
                name={`${kind}Period`}
                value={rate.period}
                onChange={(e) => update({ period: e.target.value as Period })}
              >
                {PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {t(`periods.${period}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {rate.type === 'NOMINAL' ? (
            <FormField
              id={`${kind}-capitalization`}
              label={t('capitalizationLabel')}
              hint={t('capitalizationHint')}
              error={error(`${kind}Capitalization`)}
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name={`${kind}Capitalization`}
                  value={rate.capitalization}
                  onChange={(e) => update({ capitalization: e.target.value as Period | '' })}
                >
                  <option value="" disabled>
                    —
                  </option>
                  {PERIODS.map((period) => (
                    <option key={period} value={period}>
                      {t(`periods.${period}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          ) : (
            <input type="hidden" name={`${kind}Capitalization`} value="" />
          )}
        </div>
      </fieldset>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {errors.form ? (
        <Notice tone={errors.form === 'planLimit' ? 'warning' : 'error'}>
          <p>{t(`errors.${errors.form}`)}</p>
          {errors.form === 'planLimit' ? (
            <Link href="/settings" className="font-semibold underline underline-offset-4">
              {tPlans('seePlans')}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="terms-currency"
          label={t('currencyLabel')}
          hint={t('currencyHint')}
          error={error('currency')}
        >
          {(props) => (
            <NativeSelect
              {...props}
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {(['PEN', 'USD'] as const).map((code) => (
                <option key={code} value={code}>
                  {t(`currencies.${code}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="terms-credit-limit"
          label={t('creditLimitLabel')}
          hint={t('creditLimitHint')}
          error={error('creditLimit')}
        >
          {(props) => (
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft"
              >
                {currency === 'PEN' ? 'S/' : 'US$'}
              </span>
              <Input
                {...props}
                name="creditLimit"
                inputMode="decimal"
                autoComplete="off"
                required
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className={currency === 'PEN' ? 'pl-10 tabular-nums' : 'pl-14 tabular-nums'}
              />
            </div>
          )}
        </FormField>
      </div>

      {rateFields('compensatory')}
      {rateFields('moratory')}

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          id="terms-cut-off"
          label={t('cutOffDayLabel')}
          hint={t('cutOffDayHint')}
          error={error('cutOffDay')}
        >
          {(props) => (
            <NativeSelect
              {...props}
              name="cutOffDay"
              value={days.cutOffDay}
              onChange={(e) => setDay('cutOffDay')(e.target.value)}
            >
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="terms-payment-day"
          label={t('paymentDueDayLabel')}
          hint={t('paymentDueDayHint')}
          error={error('paymentDueDay')}
        >
          {(props) => (
            <NativeSelect
              {...props}
              name="paymentDueDay"
              value={days.paymentDueDay}
              onChange={(e) => setDay('paymentDueDay')(e.target.value)}
            >
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="terms-max-months"
          label={t('maxMonthsLabel')}
          hint={t('maxMonthsHint')}
          error={error('maxInstallmentMonths')}
        >
          {(props) => (
            <NativeSelect
              {...props}
              name="maxInstallmentMonths"
              value={days.maxInstallmentMonths}
              onChange={(e) => setDay('maxInstallmentMonths')(e.target.value)}
            >
              {MONTHS.map((months) => (
                <option key={months} value={months}>
                  {months}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={cashOnlyHref ?? cancelHref}
          className={buttonVariants({ variant: 'secondary' })}
        >
          {cashOnlyHref ? t('cashOnly') : t('cancel')}
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? t('submitting') : isOpen ? t('submitUpdate') : t('submitOpen')}
        </Button>
      </div>
    </form>
  );
}
