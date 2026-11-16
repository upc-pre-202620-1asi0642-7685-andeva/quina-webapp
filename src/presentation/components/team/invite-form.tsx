'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2Icon, SendIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import { inviteEmployeeAction } from '@/presentation/actions/team';
import { FormField } from '@/presentation/components/auth/form-field';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { inviteEmployeeSchema } from '@/presentation/lib/team-schemas';
import { cn } from '@/presentation/lib/utils';

type FieldErrors = { name?: string; email?: string };

export function InviteForm({ onSuccess }: { onSuccess?: (email: string) => void }) {
  const t = useTranslations('Team.invite');
  const tPlans = useTranslations('Plans');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [planLimitError, setPlanLimitError] = useState(false);
  const [pending, startTransition] = useTransition();

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const validateField = (field: 'name' | 'email', value: string): string | undefined => {
    const res = inviteEmployeeSchema.shape[field].safeParse(value);
    if (res.success) return undefined;
    return t(field === 'name' ? 'errors.nameInvalid' : 'errors.emailInvalid');
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlanLimitError(false);

    const parsed = inviteEmployeeSchema.safeParse({ name, email });
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' && !nextErrors.name) nextErrors.name = t('errors.nameInvalid');
        if (key === 'email' && !nextErrors.email) nextErrors.email = t('errors.emailInvalid');
      }
      setErrors(nextErrors);
      if (nextErrors.name) nameRef.current?.focus();
      else if (nextErrors.email) emailRef.current?.focus();
      return;
    }

    const formData = new FormData();
    formData.set('name', name);
    formData.set('email', email);

    startTransition(async () => {
      const result = await inviteEmployeeAction({}, formData);
      if (result.invited) {
        if (result.mailFailed) {
          sileo.warning({ title: t('mailFailed', { email: result.invited }) });
        } else {
          sileo.success({ title: t('sent', { email: result.invited }) });
        }
        setName('');
        setEmail('');
        setErrors({});
        setPlanLimitError(false);
        onSuccess?.(result.invited);
        return;
      }

      if (result.error === 'nameInvalid') {
        setErrors({ name: t('errors.nameInvalid') });
        nameRef.current?.focus();
      } else if (result.error === 'emailInvalid' || result.error === 'emailTaken') {
        setErrors({ email: t(`errors.${result.error}`) });
        emailRef.current?.focus();
      } else if (result.error === 'planLimit') {
        setPlanLimitError(true);
      } else {
        sileo.error({ title: t('errors.generic') });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* El tope del plan exige una acción: se queda en pantalla con el enlace (DESIGN §7.3) */}
      {planLimitError ? (
        <Notice tone="warning">
          <p>{t('errors.planLimit')}</p>
          <Link
            href="/settings/subscription"
            className="w-fit font-semibold underline underline-offset-4"
          >
            {tPlans('seePlans')}
          </Link>
        </Notice>
      ) : null}

      <FormField id="invite-name" label={t('name')} hint={t('nameHint')} error={errors.name}>
        {(props) => (
          <Input
            {...props}
            ref={nameRef}
            name="name"
            value={name}
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
              if (errors.name) {
                setErrors((prev) => ({ ...prev, name: validateField('name', next) }));
              }
            }}
            onBlur={() => setErrors((prev) => ({ ...prev, name: validateField('name', name) }))}
            autoComplete="off"
            maxLength={150}
            className="text-base"
            required
          />
        )}
      </FormField>

      <FormField id="invite-email" label={t('email')} hint={t('emailHint')} error={errors.email}>
        {(props) => (
          <Input
            {...props}
            ref={emailRef}
            name="email"
            type="email"
            value={email}
            onChange={(e) => {
              const next = e.target.value;
              setEmail(next);
              if (errors.email) {
                setErrors((prev) => ({ ...prev, email: validateField('email', next) }));
              }
            }}
            onBlur={() => setErrors((prev) => ({ ...prev, email: validateField('email', email) }))}
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={150}
            className="text-base"
            required
          />
        )}
      </FormField>

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="w-full sm:w-auto sm:self-end"
      >
        <span className="inline-grid items-center justify-items-center">
          <span
            aria-hidden={pending}
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center gap-2',
              pending && 'invisible',
            )}
          >
            <SendIcon aria-hidden="true" />
            {t('submit')}
          </span>
          <span
            aria-hidden={!pending}
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center gap-2',
              !pending && 'invisible',
            )}
          >
            <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            {t('sending')}
          </span>
        </span>
      </Button>
    </form>
  );
}
