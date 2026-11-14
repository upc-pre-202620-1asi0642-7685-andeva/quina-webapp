'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import type { AddRusCapError } from '@/core/application/platform/manage-platform';
import { RUS_CATEGORIES } from '@/core/domain/tax/rus';
import { addRusCapAction, type PlatformFormState } from '@/presentation/actions/platform';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

type State = PlatformFormState<AddRusCapError> & { saved?: boolean };

export function RusCapForm() {
  const t = useTranslations('Platform.rusCaps.form');
  const tCaps = useTranslations('Platform.rusCaps');
  const [state, formAction, pending] = useActionState<State, FormData>(addRusCapAction, {});

  const amountError = state.error === 'AMOUNT_INVALID' ? t('errors.AMOUNT_INVALID') : undefined;
  const dateError =
    state.error === 'DATE_INVALID' || state.error === 'NOT_AFTER_CURRENT'
      ? t(`errors.${state.error}`)
      : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {state.saved ? (
        <Notice tone="success">
          <p>{t('saved')}</p>
        </Notice>
      ) : null}
      {state.error === 'generic' ? (
        <Notice tone="error">
          <p>{t('errors.generic')}</p>
        </Notice>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="rus-category" label={t('category')} hint={t('categoryHint')}>
          {(props) => (
            <NativeSelect {...props} name="category" defaultValue="1">
              {RUS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {tCaps('category', { category })}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id="rus-from" label={t('validFrom')} hint={t('validFromHint')} error={dateError}>
          {(props) => <Input {...props} name="validFrom" type="date" required />}
        </FormField>
        <FormField id="rus-income" label={t('income')} hint={t('amountHint')} error={amountError}>
          {(props) => (
            <Input {...props} name="monthlyIncomeCap" inputMode="decimal" maxLength={14} required />
          )}
        </FormField>
        <FormField
          id="rus-purchases"
          label={t('purchases')}
          hint={t('amountHint')}
          error={amountError}
        >
          {(props) => (
            <Input
              {...props}
              name="monthlyPurchasesCap"
              inputMode="decimal"
              maxLength={14}
              required
            />
          )}
        </FormField>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
