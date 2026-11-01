'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IMAGE_TYPES } from '@/core/domain/catalog/product-image';
import type { PaymentDetails } from '@/core/domain/identity/payment-details';
import {
  savePaymentDetailsAction,
  type PaymentDetailsField,
} from '@/presentation/actions/payment-details';
import { FormField } from '@/presentation/components/auth/form-field';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Checkbox } from '@/presentation/components/ui/checkbox';
import { Input } from '@/presentation/components/ui/input';

const TEXT_FIELDS = [
  { name: 'yapeNumber', inputMode: 'tel' },
  { name: 'plinNumber', inputMode: 'tel' },
  { name: 'bankName', inputMode: 'text' },
  { name: 'bankAccountNumber', inputMode: 'numeric' },
  { name: 'bankCci', inputMode: 'numeric' },
] as const;

/** Plan 5, P3: lo que el vecino verá en su portal para pagarle a la tienda (US14.6). */
export function PaymentDetailsForm({
  initial,
  qrUrl,
}: {
  initial: PaymentDetails;
  qrUrl: string | null;
}) {
  const t = useTranslations('Settings.payment');
  const [state, formAction, pending] = useActionState(savePaymentDetailsAction, {});
  const [removeQr, setRemoveQr] = useState(false);
  const error = (field: PaymentDetailsField) =>
    state.errors?.[field] ? t(`errors.${field}.${state.errors[field]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.saved ? (
        <Notice tone="success">
          <p>{t('saved')}</p>
        </Notice>
      ) : null}
      {state.errors?.form ? <Notice tone="error">{t('errors.form')}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ name, inputMode }) => (
          <FormField
            key={name}
            id={`payment-${name}`}
            label={t(`${name}.label`)}
            hint={t(`${name}.hint`)}
            error={error(name)}
          >
            {(props) => (
              <Input
                {...props}
                name={name}
                inputMode={inputMode}
                autoComplete="off"
                defaultValue={initial[name] ?? ''}
                className="tabular-nums"
              />
            )}
          </FormField>
        ))}
      </div>

      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-base font-semibold text-ink">{t('qr.title')}</legend>
        {qrUrl && !removeQr ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, sin optimizador
          <img
            src={qrUrl}
            alt={t('qr.currentAlt')}
            className="size-32 rounded-field border border-line bg-white object-contain p-1"
          />
        ) : null}
        <FormField id="payment-qr" label={t('qr.label')} hint={t('qr.hint')} error={error('qr')}>
          {(props) => (
            <Input
              {...props}
              name="qr"
              type="file"
              accept={IMAGE_TYPES.join(',')}
              className="h-auto py-2 file:mr-3 file:rounded-field file:border-0 file:bg-paper-deep file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
            />
          )}
        </FormField>
        {qrUrl ? (
          <label htmlFor="payment-remove-qr" className="flex items-center gap-3 text-sm text-ink">
            <Checkbox
              id="payment-remove-qr"
              name="removeQr"
              checked={removeQr}
              onCheckedChange={(value) => setRemoveQr(value === true)}
              className="size-5"
            />
            {t('qr.remove')}
          </label>
        ) : null}
      </fieldset>

      <Button type="submit" className="self-end" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
