'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2Icon, Eye, EyeOff, KeyRoundIcon, Loader2Icon } from 'lucide-react';
import { sileo } from 'sileo';
import { authClient } from '@/infrastructure/auth/auth-client';
import { setPasswordAction, type SetPasswordActionState } from '@/presentation/actions/password';
import { FormField } from '@/presentation/components/auth/form-field';
import { PasswordStrength } from '@/presentation/components/auth/password-strength';
import { useActionToast } from '@/presentation/components/feedback/use-action-toast';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { Switch } from '@/presentation/components/ui/switch';
import { cn } from '@/presentation/lib/utils';
import { changePasswordSchema } from '@/presentation/validation/auth-schemas';

type ChangePwdErrors = Partial<
  Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>
>;

export function PasswordCard({
  hasPassword,
  variant = 'store',
}: {
  hasPassword: boolean;
  variant?: 'store' | 'portal';
}) {
  const portal = variant === 'portal';
  const t = useTranslations('Profile.password');
  const tErr = useTranslations('Auth.errors');
  const tAuth = useTranslations('Auth');
  const router = useRouter();

  // Flujo 1: crear contraseña (cuando entró con Google / código)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const [setState, setFormAction, isPendingSet] = useActionState<SetPasswordActionState, FormData>(
    async (prev, formData) => {
      const res = await setPasswordAction(prev, formData);
      if (res.ok) {
        setNewPassword('');
        setConfirmPassword('');
        router.refresh();
      }
      return res;
    },
    {},
  );

  useActionToast(
    setState,
    setState.ok
      ? { type: 'success', title: t('created') }
      : setState.formError
        ? { type: 'error', title: tErr(setState.formError) }
        : null,
  );

  // Flujo 2: cambiar contraseña existente (inline con Better Auth)
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [changeErrors, setChangeErrors] = useState<ChangePwdErrors>({});
  const [changeFormError, setChangeFormError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const passwordCreated = hasPassword || setState.ok === true;

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangeErrors({});
    setChangeFormError(null);

    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword: nextPassword,
      confirmPassword: confirmNextPassword,
      revokeOtherSessions: revokeOthers,
    });

    if (!parsed.success) {
      const errs: ChangePwdErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'currentPassword' || field === 'newPassword' || field === 'confirmPassword') {
          errs[field] ??= issue.message;
        }
      }
      setChangeErrors(errs);
      return;
    }

    setChanging(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: parsed.data.revokeOtherSessions,
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'INVALID_PASSWORD') {
          setChangeErrors({ currentPassword: 'wrongCurrentPassword' });
        } else if (code === 'PASSWORD_TOO_WEAK') {
          setChangeErrors({ newPassword: 'passwordWeak' });
        } else {
          const msg = tErr('generic');
          setChangeFormError(msg);
          sileo.error({ title: msg });
        }
        return;
      }

      setCurrentPassword('');
      setNextPassword('');
      setConfirmNextPassword('');
      sileo.success({ title: t('updated') });
      router.refresh();
    } finally {
      setChanging(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-password-title"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="profile-password-title"
            className={cn('font-semibold text-ink', portal ? 'text-xl' : 'text-lg')}
          >
            {t('title')}
          </h2>
          <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>
            {passwordCreated ? t('hasPassword') : t(portal ? 'leadPortal' : 'lead')}
          </p>
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            passwordCreated ? 'bg-success/12 text-success-ink' : 'bg-paper-deep text-ink-soft',
          )}
        >
          {passwordCreated ? (
            <CheckCircle2Icon aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <KeyRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          <span>{passwordCreated ? t('statusConfigured') : t('statusNotSet')}</span>
        </span>
      </div>

      {!passwordCreated ? (
        <form action={setFormAction} noValidate className="flex flex-col gap-4">
          <FormField
            id="profile-new-password"
            label={t('newLabel')}
            hint={t('newHint')}
            error={setState.fieldErrors?.password ? tErr(setState.fieldErrors.password) : undefined}
          >
            {(props) => (
              <div className="relative flex items-center">
                <Input
                  {...props}
                  name="password"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isPendingSet}
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showNew ? tAuth('hidePassword') : tAuth('showPassword')}
                  onClick={() => setShowNew((prev) => !prev)}
                  className="absolute right-0 flex size-11 cursor-pointer items-center justify-center rounded-field text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
                >
                  {showNew ? (
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
            label={t('confirmLabel')}
            hint={t('confirmHint')}
            error={
              setState.fieldErrors?.confirmPassword
                ? tErr(setState.fieldErrors.confirmPassword)
                : undefined
            }
          >
            {(props) => (
              <Input
                {...props}
                name="confirmPassword"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isPendingSet}
              />
            )}
          </FormField>

          {setState.formError ? (
            <p role="alert" className="text-[13px] font-medium text-error-ink">
              {tErr(setState.formError)}
            </p>
          ) : null}

          <div>
            <Button
              type="submit"
              variant="primary"
              size={portal ? 'lg' : 'default'}
              disabled={isPendingSet}
            >
              {isPendingSet ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('submit')}</span>
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleChangePassword} noValidate className="flex flex-col gap-4">
          <FormField
            id="profile-current-password"
            label={t('currentLabel')}
            hint={t('currentHint')}
            error={
              changeErrors.currentPassword === 'wrongCurrentPassword'
                ? t('wrongCurrentPassword')
                : changeErrors.currentPassword
                  ? tErr(changeErrors.currentPassword)
                  : undefined
            }
          >
            {(props) => (
              <div className="relative flex items-center">
                <Input
                  {...props}
                  name="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changing}
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showCurrent ? tAuth('hidePassword') : tAuth('showPassword')}
                  onClick={() => setShowCurrent((prev) => !prev)}
                  className="absolute right-0 flex size-11 cursor-pointer items-center justify-center rounded-field text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
                >
                  {showCurrent ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="profile-next-password"
              label={t('newLabel')}
              hint={t('newHint')}
              error={changeErrors.newPassword ? tErr(changeErrors.newPassword) : undefined}
            >
              {(props) => (
                <div className="relative flex items-center">
                  <Input
                    {...props}
                    name="newPassword"
                    type={showNext ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={nextPassword}
                    onChange={(e) => setNextPassword(e.target.value)}
                    disabled={changing}
                    className="pr-12"
                  />
                  <button
                    type="button"
                    aria-label={showNext ? tAuth('hidePassword') : tAuth('showPassword')}
                    onClick={() => setShowNext((prev) => !prev)}
                    className="absolute right-0 flex size-11 cursor-pointer items-center justify-center rounded-field text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
                  >
                    {showNext ? (
                      <EyeOff className="size-5" aria-hidden="true" />
                    ) : (
                      <Eye className="size-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              )}
            </FormField>

            <FormField
              id="profile-confirm-next-password"
              label={t('confirmLabel')}
              hint={t('confirmHint')}
              error={changeErrors.confirmPassword ? tErr(changeErrors.confirmPassword) : undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  name="confirmPassword"
                  type={showNext ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmNextPassword}
                  onChange={(e) => setConfirmNextPassword(e.target.value)}
                  disabled={changing}
                />
              )}
            </FormField>
          </div>

          <PasswordStrength password={nextPassword} />

          <label
            htmlFor="profile-revoke-others"
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-field border border-line bg-paper-deep/60 px-3.5 py-2.5"
          >
            <span className="flex flex-col gap-0.5">
              <span className={cn('font-medium text-ink', portal ? 'text-base' : 'text-sm')}>
                {t('revokeOthersLabel')}
              </span>
              <span className={cn('text-ink-soft', portal ? 'text-sm' : 'text-[13px]')}>
                {t('revokeOthersHint')}
              </span>
            </span>
            <Switch
              id="profile-revoke-others"
              checked={revokeOthers}
              onCheckedChange={setRevokeOthers}
              disabled={changing}
            />
          </label>

          {changeFormError ? (
            <p role="alert" className="text-[13px] font-medium text-error-ink">
              {changeFormError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="submit"
              variant="primary"
              size={portal ? 'lg' : 'default'}
              disabled={changing}
            >
              {changing ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('changeSubmit')}</span>
            </Button>

            <Link
              href="/auth/forgot-password"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-link-active hover:bg-surface-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
            >
              {t('forgotCurrent')}
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
