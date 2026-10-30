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
  isPasswordStrong,
  PasswordStrength,
} from '@/presentation/components/auth/password-strength';
import {
  TURNSTILE_DUMMY_TOKEN,
  TurnstileField,
} from '@/presentation/components/auth/turnstile-field';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { accountSchema } from '@/presentation/validation/auth-schemas';

type ErrorKey =
  | 'nameRequired'
  | 'emailInvalid'
  | 'passwordWeak'
  | 'userAlreadyExists'
  | 'captchaRequired'
  | 'rateLimited'
  | 'generic';

export default function RegisterPage() {
  const t = useTranslations('Register.account');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(TURNSTILE_DUMMY_TOKEN);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'name' | 'email' | 'password', ErrorKey>>
  >({});
  const [formError, setFormError] = useState<ErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = accountSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      const next: Partial<Record<'name' | 'email' | 'password', ErrorKey>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'name' | 'email' | 'password';
        next[key] ??= issue.message as ErrorKey;
      }
      setFieldErrors(next);
      return;
    }

    if (!isPasswordStrong(parsed.data.password)) {
      setFieldErrors({ password: 'passwordWeak' });
      return;
    }

    if (!captchaToken) {
      setFormError('captchaRequired');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await authClient.signUp.email({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        fetchOptions: {
          headers: { 'x-captcha-response': captchaToken },
        },
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
          setFieldErrors({ email: 'userAlreadyExists' });
        } else if (code === 'PASSWORD_TOO_WEAK') {
          setFieldErrors({ password: 'passwordWeak' });
        } else if (code === 'MISSING_RESPONSE' || code === 'VERIFICATION_FAILED') {
          setFormError('captchaRequired');
        } else if (error.status === 429) {
          setFormError('rateLimited');
        } else {
          setFormError('generic');
        }
        return;
      }

      try {
        sessionStorage.setItem('quina_pending_email', parsed.data.email);
      } catch {
        // sessionStorage puede fallar en modo privado estricto; el query param basta
      }
      router.push(`/register/verify?email=${encodeURIComponent(parsed.data.email)}`);
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
          {t('hasAccount')}{' '}
          <Link
            href="/login"
            className="font-semibold text-link-active underline-offset-4 hover:underline"
          >
            {t('loginLink')}
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        <GoogleButton callbackURL="/app/register/store" />
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
          id="register-name"
          label={t('nameLabel')}
          hint={t('nameHint')}
          error={fieldErrors.name ? tErr(fieldErrors.name) : undefined}
        >
          {(props) => (
            <Input
              {...props}
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="register-email"
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

        <FormField
          id="register-password"
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
                autoComplete="new-password"
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

        <PasswordStrength password={password} />

        <TurnstileField onToken={setCaptchaToken} />

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
