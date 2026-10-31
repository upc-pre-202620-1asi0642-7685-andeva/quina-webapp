'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AcceptInviteState } from '@/presentation/actions/accept-invite';
import { FormField } from '@/presentation/components/auth/form-field';
import {
  isPasswordStrong,
  PasswordStrength,
} from '@/presentation/components/auth/password-strength';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

export function AcceptInviteForm({
  email,
  action,
}: {
  email: string;
  action: (prev: AcceptInviteState, formData: FormData) => Promise<AcceptInviteState>;
}) {
  const t = useTranslations('AcceptInvite');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');
  const [state, formAction, pending] = useActionState(action, {});
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [weak, setWeak] = useState(false);

  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">
          <p>{t('done')}</p>
        </Notice>
        <Link href="/login" className={buttonVariants({ variant: 'primary', className: 'w-full' })}>
          {t('goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!isPasswordStrong(password)) {
          event.preventDefault();
          setWeak(true);
        }
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      {state.error === 'invalid' ? (
        <Notice tone="error">
          <p>{t('invalid')}</p>
        </Notice>
      ) : null}

      {/* El correo ayuda al gestor de contraseñas a guardar la cuenta correcta */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <p className="text-sm text-ink-soft">{t('account', { email })}</p>

      <FormField
        id="invite-password"
        label={t('passwordLabel')}
        hint={t('passwordHint')}
        error={weak || state.error === 'passwordWeak' ? tErr('passwordWeak') : undefined}
      >
        {(props) => (
          <div className="relative flex items-center">
            <Input
              {...props}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setWeak(false);
              }}
              className="pr-12"
            />
            <button
              type="button"
              aria-label={showPassword ? tAuth('hidePassword') : tAuth('showPassword')}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-0 flex size-11 cursor-pointer items-center justify-center rounded-field text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
            >
              {showPassword ? (
                <EyeOff className="size-5" aria-hidden="true" />
              ) : (
                <Eye className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </FormField>

      <PasswordStrength password={password} />

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
