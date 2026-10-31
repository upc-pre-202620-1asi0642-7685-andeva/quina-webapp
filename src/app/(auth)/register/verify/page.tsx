'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@/infrastructure/auth/auth-client';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { OtpInput } from '@/presentation/components/auth/otp-input';
import { Button } from '@/presentation/components/ui/button';

const RESEND_COOLDOWN_SECONDS = 60;

type OtpErrorKey = 'otpInvalid' | 'otpExpired' | 'otpTooManyAttempts' | 'rateLimited' | 'generic';

function readStoredEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem('quina_pending_email') ?? '';
  } catch {
    return '';
  }
}

function VerifyOtpContent() {
  const t = useTranslations('Register.verify');
  const tAuth = useTranslations('Auth');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();
  const searchParams = useSearchParams();

  const email = searchParams.get('email') || readStoredEmail();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<OtpErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otp) || !email) {
      setError('otpInvalid');
      return;
    }

    setSubmitting(true);
    try {
      const { error: apiErr } = await authClient.emailOtp.verifyEmail({
        email,
        otp,
      });

      if (apiErr) {
        const code = (apiErr as { code?: string }).code;
        if (code === 'OTP_EXPIRED') {
          setError('otpExpired');
        } else if (code === 'TOO_MANY_ATTEMPTS') {
          setError('otpTooManyAttempts');
        } else if (apiErr.status === 429) {
          setError('rateLimited');
        } else {
          setError('otpInvalid');
        }
        return;
      }

      router.push('/register/store');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setError(null);
    setResent(false);
    const { error: apiErr } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    });
    if (apiErr) {
      setError(apiErr.status === 429 ? 'rateLimited' : 'generic');
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setResent(true);
  }

  const hintId = 'otp-code-hint';
  const errorId = 'otp-code-error';

  return (
    <AuthShell
      aside="register"
      logoAlt={tAuth('logoAlt')}
      title={t('title')}
      subtitle={t('subtitle', { email: email || '…' })}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">{t('codeLabel')}</span>
          <OtpInput
            value={otp}
            onChange={setOtp}
            describedBy={error ? `${hintId} ${errorId}` : hintId}
            invalid={Boolean(error)}
            disabled={submitting}
          />
          <p id={hintId} className="text-[13px] leading-snug text-ink-soft">
            {t('codeHint')}
          </p>
          {error ? (
            <p id={errorId} role="alert" className="text-[13px] font-medium text-error-ink">
              {tErr(error)}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>

        <div className="flex flex-col items-center gap-2" aria-live="polite">
          {resent ? (
            <p className="text-xs font-medium text-success-ink">{t('resentNotice')}</p>
          ) : null}
          {cooldown > 0 ? (
            <p className="text-xs text-ink-soft tabular-nums">
              {t('resendCountdown', { seconds: cooldown })}
            </p>
          ) : (
            <Button type="button" variant="ghost" onClick={handleResend}>
              {t('resend')}
            </Button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyOtpContent />
    </Suspense>
  );
}
