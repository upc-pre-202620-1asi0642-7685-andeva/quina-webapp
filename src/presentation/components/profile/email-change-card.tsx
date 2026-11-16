'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon, BadgeCheckIcon, Loader2Icon, MailIcon } from 'lucide-react';
import { sileo } from 'sileo';
import { authClient } from '@/infrastructure/auth/auth-client';
import { FormField } from '@/presentation/components/auth/form-field';
import { OtpInput } from '@/presentation/components/auth/otp-input';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

type EmailErrKey =
  'emailInvalid' | 'otpInvalid' | 'otpExpired' | 'otpTooManyAttempts' | 'rateLimited' | 'generic';

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailChangeCard({
  currentEmail,
  emailVerified,
}: {
  currentEmail: string;
  emailVerified: boolean;
}) {
  const t = useTranslations('Profile');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();

  const [emailDisplay, setEmailDisplay] = useState(currentEmail);
  const [prevEmail, setPrevEmail] = useState(currentEmail);
  const [newEmail, setNewEmail] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [emailError, setEmailError] = useState<EmailErrKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  if (currentEmail !== prevEmail) {
    setPrevEmail(currentEmail);
    setEmailDisplay(currentEmail);
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendOtp(targetEmail: string) {
    setEmailError(null);
    setSubmitting(true);
    try {
      const { error } = await authClient.emailOtp.requestEmailChange({
        newEmail: targetEmail,
      });
      if (error) {
        const key: EmailErrKey = error.status === 429 ? 'rateLimited' : 'generic';
        setEmailError(key);
        sileo.error({ title: tErr(key) });
        return false;
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      sileo.success({ title: t('emailCodeSent', { email: targetEmail }) });
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed.includes('@') || trimmed === emailDisplay.toLowerCase()) {
      setEmailError('emailInvalid');
      return;
    }
    const sent = await sendOtp(trimmed);
    if (sent) {
      setNewEmail(trimmed);
      setOtp('');
      setOtpStep(true);
    }
  }

  async function handleConfirmEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    if (!/^\d{6}$/.test(otp)) {
      setEmailError('otpInvalid');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await authClient.emailOtp.changeEmail({
        newEmail,
        otp,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'OTP_EXPIRED') setEmailError('otpExpired');
        else if (code === 'TOO_MANY_ATTEMPTS') setEmailError('otpTooManyAttempts');
        else setEmailError('otpInvalid');
        return;
      }
      setEmailDisplay(newEmail);
      setNewEmail('');
      setOtp('');
      setOtpStep(false);
      setCooldown(0);
      sileo.success({ title: t('emailChanged') });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelOtp() {
    setOtpStep(false);
    setOtp('');
    setEmailError(null);
  }

  return (
    <section
      aria-labelledby="profile-email-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-email-title" className="text-lg font-semibold text-ink">
          {t('emailTitle')}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <MailIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
          <span className="font-medium text-ink">{emailDisplay}</span>
          {emailVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success-ink">
              <BadgeCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
              {t('identity.verified')}
            </span>
          ) : null}
        </div>
      </div>

      {!otpStep ? (
        <form onSubmit={handleRequestEmailChange} noValidate className="flex flex-col gap-4">
          <FormField
            id="profile-new-email"
            label={t('newEmailLabel')}
            hint={t('newEmailHint')}
            error={emailError ? tErr(emailError) : undefined}
          >
            {(props) => (
              <Input
                {...props}
                name="newEmail"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                disabled={submitting}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" variant="secondary" disabled={submitting}>
              {submitting ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('sendChangeCode')}</span>
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleConfirmEmailChange} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              {t('otpLabel', { email: newEmail })}
            </span>
            <div className="max-w-xs">
              <OtpInput
                value={otp}
                onChange={(next) => {
                  setOtp(next);
                  if (emailError) setEmailError(null);
                }}
                describedBy={emailError ? 'profile-otp-hint profile-otp-error' : 'profile-otp-hint'}
                invalid={Boolean(emailError)}
                disabled={submitting}
              />
            </div>
            <p id="profile-otp-hint" className="text-[13px] text-ink-soft">
              {t('otpHint')}
            </p>
            {emailError ? (
              <p
                id="profile-otp-error"
                role="alert"
                className="text-[13px] font-medium text-error-ink"
              >
                {tErr(emailError)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary" disabled={submitting}>
              {submitting ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('confirmEmailChange')}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              disabled={submitting || cooldown > 0}
              onClick={() => void sendOtp(newEmail)}
              className="tabular-nums"
            >
              {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resendCode')}
            </Button>

            <Button type="button" variant="ghost" disabled={submitting} onClick={handleCancelOtp}>
              <ArrowLeftIcon aria-hidden="true" />
              <span>{t('cancelEmailChange')}</span>
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
