'use client';

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SendIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { inviteEmployeeAction } from '@/presentation/actions/team';
import { FormField } from '@/presentation/components/auth/form-field';
import { useActionToast } from '@/presentation/components/feedback/use-action-toast';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

export function InviteForm() {
  const t = useTranslations('Team.invite');
  const tPlans = useTranslations('Plans');
  const [state, formAction, pending] = useActionState(inviteEmployeeAction, {});
  const nameRef = useRef<HTMLInputElement>(null);
  useActionToast(
    state,
    state.invited
      ? state.mailFailed
        ? { type: 'warning', title: t('mailFailed', { email: state.invited }) }
        : { type: 'success', title: t('sent', { email: state.invited }) }
      : state.error === 'generic'
        ? { type: 'error', title: t('errors.generic') }
        : null,
  );

  // Tras invitar, el formulario se vacía (React 19) y el foco vuelve al nombre
  useEffect(() => {
    if (state.invited) nameRef.current?.focus();
  }, [state.invited]);

  const fieldError = (field: 'name' | 'email') => {
    if (field === 'name' && state.error === 'nameInvalid') return t('errors.nameInvalid');
    if (field === 'email' && (state.error === 'emailInvalid' || state.error === 'emailTaken')) {
      return t(`errors.${state.error}`);
    }
    return undefined;
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {/* El tope del plan exige una acción: se queda en pantalla con el enlace (DESIGN §7.3) */}
      {state.error === 'planLimit' ? (
        <Notice tone="warning">
          <p>{t('errors.planLimit')}</p>
          <Link
            href="/settings/subscription"
            className="font-semibold underline underline-offset-4"
          >
            {tPlans('seePlans')}
          </Link>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="invite-name"
          label={t('name')}
          hint={t('nameHint')}
          error={fieldError('name')}
        >
          {(props) => (
            <Input
              {...props}
              ref={nameRef}
              name="name"
              autoComplete="off"
              maxLength={150}
              required
            />
          )}
        </FormField>
        <FormField
          id="invite-email"
          label={t('email')}
          hint={t('emailHint')}
          error={fieldError('email')}
        >
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={150}
              required
            />
          )}
        </FormField>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        <SendIcon aria-hidden="true" />
        {pending ? t('sending') : t('submit')}
      </Button>
    </form>
  );
}
