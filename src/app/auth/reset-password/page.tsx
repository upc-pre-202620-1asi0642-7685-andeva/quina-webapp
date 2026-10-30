'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/infrastructure/auth/auth-client';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { FormField } from '@/presentation/components/auth/form-field';
import {
  isPasswordStrong,
  PasswordStrength,
} from '@/presentation/components/auth/password-strength';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { resetPasswordSchema } from '@/presentation/validation/auth-schemas';

function ResetPasswordContent() {
  const t = useTranslations('Recovery.reset');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get('token') ?? '';
  const queryError = searchParams.get('error');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<'passwordWeak' | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(() => !token || Boolean(queryError));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);

    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success || !isPasswordStrong(parsed.data.password)) {
      setFieldError('passwordWeak');
      return;
    }

    if (!token) {
      setTokenInvalid(true);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: parsed.data.password,
        token,
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'PASSWORD_TOO_WEAK') {
          setFieldError('passwordWeak');
        } else {
          setTokenInvalid(true);
        }
        return;
      }

      router.push('/login');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell logoAlt={tAuth('logoAlt')} title={t('title')} subtitle={t('subtitle')}>
      {tokenInvalid ? (
        <div className="flex flex-col gap-4">
          <div
            role="alert"
            className="rounded-field border border-error bg-error/10 p-3 text-sm font-medium text-error-ink"
          >
            {t('invalidToken')}
          </div>
          <Button asChild variant="primary" className="w-full">
            <Link href="/auth/forgot-password">{t('requestNewLink')}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormField
            id="reset-password"
            label={t('passwordLabel')}
            hint={t('passwordHint')}
            error={fieldError ? tErr(fieldError) : undefined}
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

          <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
