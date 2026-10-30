'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  completeStoreAction,
  type RegisterStoreActionState,
} from '@/presentation/actions/register';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { FormField } from '@/presentation/components/auth/form-field';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { BUSINESS_TURNS, storeSchema } from '@/presentation/validation/auth-schemas';

type StoreErrorKey =
  | 'commercialNameRequired'
  | 'businessTurnInvalid'
  | 'taxIdInvalid'
  | 'taxIdTaken'
  | 'emailTaken'
  | 'generic';

const INITIAL_STATE: RegisterStoreActionState = {};

export function StoreRegistrationForm({
  ownerName,
  ownerEmail,
}: {
  ownerName: string;
  ownerEmail: string;
}) {
  const t = useTranslations('Register.store');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');

  const [state, formAction, pending] = useActionState(completeStoreAction, INITIAL_STATE);
  const [commercialName, setCommercialName] = useState('');
  const [businessTurn, setBusinessTurn] = useState<string>('BODEGA');
  const [taxId, setTaxId] = useState('');
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<'commercialName' | 'businessTurn' | 'taxId', StoreErrorKey>>
  >({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setClientErrors({});
    const parsed = storeSchema.safeParse({ commercialName, businessTurn, taxId });
    if (!parsed.success) {
      event.preventDefault();
      const next: Partial<Record<'commercialName' | 'businessTurn' | 'taxId', StoreErrorKey>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as 'commercialName' | 'businessTurn' | 'taxId';
        next[field] ??= issue.message as StoreErrorKey;
      }
      setClientErrors(next);
    }
  }

  const nameError = (clientErrors.commercialName ?? state.fieldErrors?.commercialName) as
    StoreErrorKey | undefined;
  const turnError = (clientErrors.businessTurn ?? state.fieldErrors?.businessTurn) as
    StoreErrorKey | undefined;
  const taxError = (clientErrors.taxId ?? state.fieldErrors?.taxId) as StoreErrorKey | undefined;
  const formError = state.formError as StoreErrorKey | undefined;

  return (
    <AuthShell logoAlt={tAuth('logoAlt')} title={t('title')} subtitle={t('subtitle')}>
      <p className="rounded-field bg-paper-deep px-3.5 py-2.5 text-sm text-ink-soft">
        {t('ownerInfo', { name: ownerName, email: ownerEmail })}
      </p>

      <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? (
          <div
            role="alert"
            className="rounded-field border border-error bg-error/10 p-3 text-sm font-medium text-error-ink"
          >
            {tErr(formError)}
          </div>
        ) : null}

        <FormField
          id="store-commercial-name"
          label={t('commercialNameLabel')}
          hint={t('commercialNameHint')}
          error={nameError ? tErr(nameError) : undefined}
        >
          {(props) => (
            <Input
              {...props}
              name="commercialName"
              type="text"
              autoComplete="organization"
              required
              value={commercialName}
              onChange={(e) => setCommercialName(e.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="store-business-turn"
          label={t('businessTurnLabel')}
          hint={t('businessTurnHint')}
          error={turnError ? tErr(turnError) : undefined}
        >
          {(props) => (
            <select
              {...props}
              name="businessTurn"
              value={businessTurn}
              onChange={(e) => setBusinessTurn(e.target.value)}
              className="h-11 w-full rounded-field border border-line bg-surface px-3.5 py-2 text-base text-ink outline-none focus-visible:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active aria-invalid:border-error-ink"
            >
              {BUSINESS_TURNS.map((turn) => (
                <option key={turn} value={turn}>
                  {t(`turns.${turn}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          id="store-tax-id"
          label={t('taxIdLabel')}
          hint={t('taxIdHint')}
          error={taxError ? tErr(taxError) : undefined}
        >
          {(props) => (
            <Input
              {...props}
              name="taxId"
              type="text"
              inputMode="numeric"
              required
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="tabular-nums"
            />
          )}
        </FormField>

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
