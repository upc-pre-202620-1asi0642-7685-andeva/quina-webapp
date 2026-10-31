'use client';

import { useActionState, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { locales, type Locale } from '@/core/domain/shared/locale';
import { authClient } from '@/infrastructure/auth/auth-client';
import { setLocaleAction } from '@/presentation/actions/locale';
import { setPasswordAction, type SetPasswordActionState } from '@/presentation/actions/password';
import { FormField } from '@/presentation/components/auth/form-field';
import { OtpInput } from '@/presentation/components/auth/otp-input';
import { PasswordStrength } from '@/presentation/components/auth/password-strength';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';

type EmailErrKey =
  'emailInvalid' | 'otpInvalid' | 'otpExpired' | 'otpTooManyAttempts' | 'rateLimited' | 'generic';

export function ProfileView({
  currentEmail,
  currentLocale,
  hasPassword,
}: {
  currentEmail: string;
  currentLocale: Locale;
  hasPassword: boolean;
}) {
  const t = useTranslations('Profile');
  const tDash = useTranslations('Dashboard');
  const tErr = useTranslations('Auth.errors');
  const tAuth = useTranslations('Auth');
  const router = useRouter();

  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const [localeSaved, setLocaleSaved] = useState(false);
  const [isPendingLocale, startLocaleTransition] = useTransition();

  const [emailDisplay, setEmailDisplay] = useState(currentEmail);
  const [newEmail, setNewEmail] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [emailError, setEmailError] = useState<EmailErrKey | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordState, passwordFormAction, isPendingPassword] = useActionState<
    SetPasswordActionState,
    FormData
  >(setPasswordAction, {});
  const passwordCreated = hasPassword || passwordState.ok === true;

  function handleLocaleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocaleSaved(false);
    startLocaleTransition(async () => {
      const res = await setLocaleAction(selectedLocale);
      if (res.ok) {
        setLocaleSaved(true);
        router.refresh();
      }
    });
  }

  async function handleRequestEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setEmailSuccess(false);
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed.includes('@') || trimmed === emailDisplay.toLowerCase()) {
      setEmailError('emailInvalid');
      return;
    }

    setSubmittingEmail(true);
    try {
      const { error } = await authClient.emailOtp.requestEmailChange({
        newEmail: trimmed,
      });
      if (error) {
        setEmailError(error.status === 429 ? 'rateLimited' : 'generic');
        return;
      }
      setNewEmail(trimmed);
      setOtp('');
      setOtpStep(true);
    } finally {
      setSubmittingEmail(false);
    }
  }

  async function handleConfirmEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    if (!/^\d{6}$/.test(otp)) {
      setEmailError('otpInvalid');
      return;
    }

    setSubmittingEmail(true);
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
      setEmailSuccess(true);
      router.refresh();
    } finally {
      setSubmittingEmail(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      window.location.replace('/app/login');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <Image src={isologo} alt={tDash('logoAlt')} priority className="h-9 w-auto" />
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
        >
          {t('backToDashboard')}
        </Link>
      </header>

      <section className="flex flex-col gap-6 rounded-card border border-line bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>

        <form
          onSubmit={handleLocaleSubmit}
          className="flex flex-col gap-4 border-t border-line pt-6"
        >
          <h2 className="text-lg font-semibold text-ink">{t('localeTitle')}</h2>
          <FormField id="profile-locale" label={t('localeLabel')} hint={t('localeHint')}>
            {(props) => (
              <select
                {...props}
                name="locale"
                value={selectedLocale}
                onChange={(e) => setSelectedLocale(e.target.value as Locale)}
                className="h-11 w-full rounded-field border border-line bg-surface px-3.5 py-2 text-base text-ink outline-none focus-visible:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
              >
                {locales.map((loc) => (
                  <option key={loc} value={loc}>
                    {t(`locales.${loc}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="flex items-center gap-3" aria-live="polite">
            <Button type="submit" variant="primary" disabled={isPendingLocale}>
              {t('saveLocale')}
            </Button>
            {localeSaved ? (
              <span className="text-sm font-medium text-success-ink">{t('localeSaved')}</span>
            ) : null}
          </div>
        </form>

        <div className="flex flex-col gap-4 border-t border-line pt-6">
          <h2 className="text-lg font-semibold text-ink">{t('emailTitle')}</h2>
          <p className="text-sm text-ink-soft">{t('currentEmail', { email: emailDisplay })}</p>

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
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                )}
              </FormField>
              <div className="flex items-center gap-3" aria-live="polite">
                <Button type="submit" variant="secondary" disabled={submittingEmail}>
                  {t('sendChangeCode')}
                </Button>
                {emailSuccess ? (
                  <span className="text-sm font-medium text-success-ink">{t('emailChanged')}</span>
                ) : null}
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmEmailChange} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">
                  {t('otpLabel', { email: newEmail })}
                </span>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  describedBy={
                    emailError ? 'profile-otp-hint profile-otp-error' : 'profile-otp-hint'
                  }
                  invalid={Boolean(emailError)}
                  disabled={submittingEmail}
                />
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
              <Button type="submit" variant="secondary" disabled={submittingEmail}>
                {t('confirmEmailChange')}
              </Button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-6">
          <h2 className="text-lg font-semibold text-ink">{t('password.title')}</h2>
          {passwordCreated ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              {passwordState.ok ? (
                <p className="text-sm font-medium text-success-ink">{t('password.created')}</p>
              ) : null}
              <p className="text-sm text-ink-soft">{t('password.hasPassword')}</p>
              <Link
                href="/auth/forgot-password"
                className="w-fit text-sm font-semibold text-link-active underline underline-offset-4"
              >
                {t('password.change')}
              </Link>
            </div>
          ) : (
            <form action={passwordFormAction} noValidate className="flex flex-col gap-4">
              <p className="text-sm text-ink-soft">{t('password.lead')}</p>
              <FormField
                id="profile-new-password"
                label={t('password.newLabel')}
                hint={t('password.newHint')}
                error={
                  passwordState.fieldErrors?.password
                    ? tErr(passwordState.fieldErrors.password)
                    : undefined
                }
              >
                {(props) => (
                  <div className="relative flex items-center">
                    <Input
                      {...props}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
              <PasswordStrength password={newPassword} />
              <FormField
                id="profile-confirm-password"
                label={t('password.confirmLabel')}
                hint={t('password.confirmHint')}
                error={
                  passwordState.fieldErrors?.confirmPassword
                    ? tErr(passwordState.fieldErrors.confirmPassword)
                    : undefined
                }
              >
                {(props) => (
                  <Input
                    {...props}
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                )}
              </FormField>
              {passwordState.formError ? (
                <p role="alert" className="text-[13px] font-medium text-error-ink">
                  {tErr(passwordState.formError)}
                </p>
              ) : null}
              <Button type="submit" variant="secondary" disabled={isPendingPassword}>
                {t('password.submit')}
              </Button>
            </form>
          )}
        </div>

        <div className="border-t border-line pt-6">
          <Button type="button" variant="secondary" onClick={handleSignOut} disabled={signingOut}>
            {t('signOut')}
          </Button>
        </div>
      </section>
    </main>
  );
}
