'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authClient } from '@/infrastructure/auth/auth-client';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { FormField } from '@/presentation/components/auth/form-field';
import {
  TURNSTILE_DUMMY_TOKEN,
  TurnstileField,
} from '@/presentation/components/auth/turnstile-field';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { forgotPasswordSchema } from '@/presentation/validation/auth-schemas';

export default function ForgotPasswordPage() {
  const t = useTranslations('Recovery.forgot');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');

  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState(TURNSTILE_DUMMY_TOKEN);
  const [fieldError, setFieldError] = useState<'emailInvalid' | null>(null);
  const [formError, setFormError] = useState<'captchaRequired' | 'rateLimited' | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError('emailInvalid');
      return;
    }

    if (!captchaToken) {
      setFormError('captchaRequired');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: '/app/auth/reset-password',
        fetchOptions: {
          headers: { 'x-captcha-response': captchaToken },
        },
      });

      if (error && error.status === 429) {
        setFormError('rateLimited');
        return;
      }

      // Respuesta idéntica exista o no el correo (§7.6)
      setSent(true);
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
        <Link
          href="/login"
          className="font-semibold text-link-active underline-offset-4 hover:underline"
        >
          {t('backToLogin')}
        </Link>
      }
    >
      {sent ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-field bg-soft p-4 text-sm font-medium text-soft-ink"
        >
          {t('sentMessage')}
        </div>
      ) : (
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
            id="forgot-email"
            label={t('emailLabel')}
            hint={t('emailHint')}
            error={fieldError ? tErr(fieldError) : undefined}
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

          <TurnstileField onToken={setCaptchaToken} />

          <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
