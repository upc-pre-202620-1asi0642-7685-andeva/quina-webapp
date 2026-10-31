'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import type { AddRateCapError } from '@/core/application/platform/manage-platform';
import { addRateCapAction, type PlatformFormState } from '@/presentation/actions/platform';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

type State = PlatformFormState<AddRateCapError> & { saved?: boolean };

const FIELD_OF: Partial<Record<AddRateCapError, 'percent' | 'validFrom' | 'source'>> = {
  RATE_PERCENT_INVALID: 'percent',
  RATE_NOT_POSITIVE: 'percent',
  DATE_INVALID: 'validFrom',
  NOT_AFTER_CURRENT: 'validFrom',
  SOURCE_REQUIRED: 'source',
};

export function RateCapForm() {
  const t = useTranslations('Platform.caps.form');
  const tCaps = useTranslations('Platform.caps');
  const [state, formAction, pending] = useActionState<State, FormData>(addRateCapAction, {});

  const errorFor = (field: 'percent' | 'validFrom' | 'source') =>
    state.error && state.error !== 'generic' && FIELD_OF[state.error] === field
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
        <FormField id="cap-kind" label={t('kind')} hint={t('kindHint')}>
          {(props) => (
            <NativeSelect {...props} name="kind" defaultValue="COMPENSATORY">
              <option value="COMPENSATORY">{tCaps('kinds.COMPENSATORY')}</option>
              <option value="MORATORY">{tCaps('kinds.MORATORY')}</option>
            </NativeSelect>
          )}
        </FormField>
        <FormField id="cap-currency" label={t('currency')} hint={t('currencyHint')}>
          {(props) => (
            <NativeSelect {...props} name="currency" defaultValue="PEN">
              <option value="PEN">{tCaps('currencies.PEN')}</option>
              <option value="USD">{tCaps('currencies.USD')}</option>
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="cap-percent"
          label={t('percent')}
          hint={t('percentHint')}
          error={errorFor('percent')}
        >
          {(props) => (
            <Input {...props} name="percent" inputMode="decimal" maxLength={9} required />
          )}
        </FormField>
        <FormField
          id="cap-from"
          label={t('validFrom')}
          hint={t('validFromHint')}
          error={errorFor('validFrom')}
        >
          {(props) => <Input {...props} name="validFrom" type="date" required />}
        </FormField>
      </div>
      <FormField
        id="cap-source"
        label={t('source')}
        hint={t('sourceHint')}
        error={errorFor('source')}
      >
        {(props) => <Input {...props} name="source" maxLength={300} required />}
      </FormField>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
