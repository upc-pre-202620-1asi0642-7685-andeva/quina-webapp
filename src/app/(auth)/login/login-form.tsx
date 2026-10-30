'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/infrastructure/auth/auth-client';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { FormField } from '@/presentation/components/auth/form-field';
import { GoogleButton } from '@/presentation/components/auth/google-button';
import {
  TURNSTILE_DUMMY_TOKEN,
  TurnstileField,
} from '@/presentation/components/auth/turnstile-field';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { loginSchema } from '@/presentation/validation/auth-schemas';

type LoginErrorKey =
  | 'emailInvalid'
  | 'passwordRequired'
  | 'invalidCredentials'
  | 'accountLocked'
  | 'accountDisabled'
  | 'captchaRequired'
  | 'rateLimited'
  | 'generic';

export function LoginForm() {
  const t = useTranslations('Auth.login');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(TURNSTILE_DUMMY_TOKEN);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'email' | 'password', LoginErrorKey>>
  >({});
  const [formError, setFormError] = useState<LoginErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: Partial<Record<'email' | 'password', LoginErrorKey>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'email' | 'password';
        next[key] ??= issue.message as LoginErrorKey;
      }
      setFieldErrors(next);
      return;
    }

    if (!captchaToken) {
      setFormError('captchaRequired');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await authClient.signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
        fetchOptions: {
          headers: { 'x-captcha-response': captchaToken },
        },
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'EMAIL_NOT_VERIFIED') {
          router.push(`/register/verify?email=${encodeURIComponent(parsed.data.email)}`);
          return;
        }
        if (code === 'ACCOUNT_LOCKED') {
          setFormError('accountLocked');
        } else if (code === 'ACCOUNT_DISABLED') {
          setFormError('accountDisabled');
        } else if (code === 'INVALID_EMAIL_OR_PASSWORD') {
          setFormError('invalidCredentials');
        } else if (error.status === 429) {
          setFormError('rateLimited');
        } else {
          setFormError('generic');
        }
        return;
      }

      router.push('/');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      logoAlt={tAuth('logoAlt')}
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <p>
          {t('noAccount')}{' '}
          <Link
            href="/register"
            className="font-semibold text-link-active underline-offset-4 hover:underline"
          >
            {t('registerLink')}
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        <GoogleButton callbackURL="/app" />
        <div className="flex items-center gap-3 text-xs text-ink-soft">
          <span className="h-px flex-1 bg-line" />
          <span>{tAuth('or')}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? (
          <div
            role="alert"
            className="rounded-field border border-error bg-error/10 p-3 text-sm font-medium text-error-ink"
          >
            {tErr(formError)}
          </div>
        ) : null}

        <FormField
          id="login-email"
          label={t('emailLabel')}
          hint={t('emailHint')}
          error={fieldErrors.email ? tErr(fieldErrors.email) : undefined}
        >
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>

        <div className="flex flex-col gap-1.5">
          <FormField
            id="login-password"
            label={t('passwordLabel')}
            hint={t('passwordHint')}
            error={fieldErrors.password ? tErr(fieldErrors.password) : undefined}
          >
            {(props) => (
              <div className="relative flex items-center">
                <Input
                  {...props}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
          <div className="flex justify-end">
            <Link
              href="/auth/forgot-password"
              className="text-[13px] font-medium text-link-active underline-offset-4 hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>
        </div>

        <TurnstileField onToken={setCaptchaToken} />

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
