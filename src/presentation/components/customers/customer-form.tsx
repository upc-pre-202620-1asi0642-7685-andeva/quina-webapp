'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { parseCustomerProfile } from '@/core/application/customers/customer-profile';
import { DOCUMENT_TYPES, type DocumentType } from '@/core/domain/identity/document-id';
import { locales } from '@/core/domain/shared/locale';
import type { CustomerFormState } from '@/presentation/actions/customers';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Checkbox } from '@/presentation/components/ui/checkbox';
import { Input } from '@/presentation/components/ui/input';
import { customerError, type CustomerField } from '@/presentation/validation/customer-form';

export type CustomerFormValues = {
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  preferredLocale: string;
};

const EMPTY: CustomerFormValues = {
  documentType: 'DNI',
  documentNumber: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  preferredLocale: '',
};

type Action = (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;

export function CustomerForm({
  mode,
  action,
  storeName,
  privacyHref,
  cancelHref,
  initial = EMPTY,
}: {
  mode: 'new' | 'edit';
  action: Action;
  storeName: string;
  privacyHref: string;
  cancelHref: string;
  initial?: CustomerFormValues;
}) {
  const t = useTranslations('Customers.form');
  const tDoc = useTranslations('Customers.documentTypes');
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState(initial);
  const [consent, setConsent] = useState(false);
  const [clientErrors, setClientErrors] = useState<Partial<Record<CustomerField, string>>>({});

  const errors = { ...state.errors, ...clientErrors };
  const error = (field: CustomerField) =>
    errors[field] ? t(`errors.${errors[field]}`) : undefined;
  const set = (field: keyof CustomerFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => ({
      ...current,
      [field === 'documentType' ? 'documentNumber' : field]: undefined,
    }));
  };

  // Misma validación que el servidor (DESIGN.md §7.2): se adelanta el primer error
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const parsed = parseCustomerProfile({
      ...values,
      preferredLocale: null,
    });
    const next: Partial<Record<CustomerField, string>> = {};
    if (!parsed.ok) {
      const [field, key] = customerError(parsed.error);
      next[field] = key;
    }
    if (mode === 'new' && !consent) next.consent = 'consentRequired';
    setClientErrors(next);
    if (Object.keys(next).length > 0) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {errors.form ? <Notice tone="error">{t(`errors.${errors.form}`)}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="customer-document-type"
          label={t('documentTypeLabel')}
          hint={t('documentTypeHint')}
        >
          {(props) => (
            <NativeSelect
              {...props}
              name="documentType"
              value={values.documentType}
              onChange={(e) => set('documentType')(e.target.value)}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tDoc(type)}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="customer-document-number"
          label={t('documentNumberLabel')}
          hint={t('documentNumberHint')}
          error={error('documentNumber')}
        >
          {(props) => (
            <Input
              {...props}
              name="documentNumber"
              inputMode={values.documentType === 'DNI' ? 'numeric' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              required
              value={values.documentNumber}
              onChange={(e) => set('documentNumber')(e.target.value)}
              className="tabular-nums"
            />
          )}
        </FormField>
        <FormField
          id="customer-first-name"
          label={t('firstNameLabel')}
          hint={t('firstNameHint')}
          error={error('firstName')}
        >
          {(props) => (
            <Input
              {...props}
              name="firstName"
              autoComplete="off"
              required
              value={values.firstName}
              onChange={(e) => set('firstName')(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="customer-last-name"
          label={t('lastNameLabel')}
          hint={t('lastNameHint')}
          error={error('lastName')}
        >
          {(props) => (
            <Input
              {...props}
              name="lastName"
              autoComplete="off"
              required
              value={values.lastName}
              onChange={(e) => set('lastName')(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="customer-phone"
          label={t('phoneLabel')}
          hint={t('phoneHint')}
          error={error('phone')}
        >
          {(props) => (
            <Input
              {...props}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              required
              value={values.phone}
              onChange={(e) => set('phone')(e.target.value)}
              className="tabular-nums"
            />
          )}
        </FormField>
        <FormField
          id="customer-email"
          label={t('emailLabel')}
          hint={t('emailHint')}
          error={error('email')}
        >
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              required
              value={values.email}
              onChange={(e) => set('email')(e.target.value)}
            />
          )}
        </FormField>
        <FormField id="customer-address" label={t('addressLabel')} hint={t('addressHint')}>
          {(props) => (
            <Input
              {...props}
              name="address"
              autoComplete="off"
              value={values.address}
              onChange={(e) => set('address')(e.target.value)}
            />
          )}
        </FormField>
        <FormField id="customer-locale" label={t('localeLabel')} hint={t('localeHint')}>
          {(props) => (
            <NativeSelect
              {...props}
              name="preferredLocale"
              value={values.preferredLocale}
              onChange={(e) => set('preferredLocale')(e.target.value)}
            >
              <option value="">{t('localeStore')}</option>
              {locales.map((locale) => (
                <option key={locale} value={locale}>
                  {t(`locales.${locale}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      {mode === 'new' ? (
        <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-paper-deep p-4">
          <legend className="sr-only">{t('consentTitle')}</legend>
          <p className="text-sm font-semibold text-ink" aria-hidden="true">
            {t('consentTitle')}
          </p>
          <p className="text-[13px] text-ink-soft">{t('consentHint')}</p>
          <div className="flex items-start gap-3">
            <Checkbox
              id="customer-consent"
              name="consent"
              checked={consent}
              onCheckedChange={(value) => {
                setConsent(value === true);
                setClientErrors((current) => ({ ...current, consent: undefined }));
              }}
              aria-invalid={Boolean(errors.consent)}
              aria-describedby={errors.consent ? 'customer-consent-error' : undefined}
              className="mt-0.5 size-5"
            />
            <label
              htmlFor="customer-consent"
              className="cursor-pointer text-sm leading-snug text-ink"
            >
              {t.rich('consentLabel', {
                store: storeName,
                privacy: (chunks) => (
                  <a
                    href={privacyHref}
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-link-active underline underline-offset-4"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </label>
          </div>
          {errors.consent ? (
            <p
              id="customer-consent-error"
              role="alert"
              className="text-[13px] font-medium text-error-ink"
            >
              {t(`errors.${errors.consent}`)}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonVariants({ variant: 'secondary' })}>
          {t('cancel')}
        </Link>
        <Button
          type="submit"
          // US04 crit. 3: sin la casilla marcada no se puede registrar
          disabled={pending || (mode === 'new' && !consent)}
        >
          {mode === 'new'
            ? pending
              ? t('submitting')
              : t('submit')
            : pending
              ? t('saving')
              : t('save')}
        </Button>
      </div>
    </form>
  );
}
