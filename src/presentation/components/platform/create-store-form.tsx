'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CreateStoreError } from '@/core/application/platform/manage-platform';
import { locales } from '@/core/domain/shared/locale';
import { createStoreAction, type PlatformFormState } from '@/presentation/actions/platform';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { BUSINESS_TURNS } from '@/presentation/validation/auth-schemas';

type Field = 'commercialName' | 'taxId' | 'ownerName' | 'ownerEmail';

const FIELD_OF: Partial<Record<CreateStoreError, Field>> = {
  COMMERCIAL_NAME_INVALID: 'commercialName',
  TAX_ID_INVALID: 'taxId',
  TAX_ID_TAKEN: 'taxId',
  NAME_INVALID: 'ownerName',
  EMAIL_INVALID: 'ownerEmail',
  EMAIL_TAKEN: 'ownerEmail',
};

export function CreateStoreForm() {
  const t = useTranslations('Platform.create');
  const tTurns = useTranslations('Register.store.turns');
  const tLocales = useTranslations('Customers.form.locales');
  const [state, formAction, pending] = useActionState<
    PlatformFormState<CreateStoreError>,
    FormData
  >(createStoreAction, {});

  const errorFor = (field: Field) =>
    state.error && state.error !== 'generic' && FIELD_OF[state.error] === field
      ? t(`errors.${state.error}`)
      : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {state.error === 'generic' ? (
        <Notice tone="error">
          <p>{t('errors.generic')}</p>
        </Notice>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="store-name"
          label={t('commercialName')}
          hint={t('commercialNameHint')}
          error={errorFor('commercialName')}
        >
          {(props) => <Input {...props} name="commercialName" maxLength={150} required />}
        </FormField>
        <FormField id="store-turn" label={t('businessTurn')} hint={t('businessTurnHint')}>
          {(props) => (
            <NativeSelect {...props} name="businessTurn" defaultValue="BODEGA">
              {BUSINESS_TURNS.map((turn) => (
                <option key={turn} value={turn}>
                  {tTurns(turn)}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="store-tax"
          label={t('taxId')}
          hint={t('taxIdHint')}
          error={errorFor('taxId')}
        >
          {(props) => <Input {...props} name="taxId" inputMode="numeric" maxLength={13} required />}
        </FormField>
        <FormField id="store-locale" label={t('locale')} hint={t('localeHint')}>
          {(props) => (
            <NativeSelect {...props} name="locale" defaultValue="es">
              {locales.map((locale) => (
                <option key={locale} value={locale}>
                  {tLocales(locale)}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="store-owner"
          label={t('ownerName')}
          hint={t('ownerNameHint')}
          error={errorFor('ownerName')}
        >
          {(props) => <Input {...props} name="ownerName" maxLength={150} required />}
        </FormField>
        <FormField
          id="store-email"
          label={t('ownerEmail')}
          hint={t('ownerEmailHint')}
          error={errorFor('ownerEmail')}
        >
          {(props) => (
            <Input
              {...props}
              name="ownerEmail"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={150}
              required
            />
          )}
        </FormField>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
        <Link href="/platform/stores" className={buttonVariants({ variant: 'ghost' })}>
          {t('cancel')}
        </Link>
      </div>
    </form>
  );
}
