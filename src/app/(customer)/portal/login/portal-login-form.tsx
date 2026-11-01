'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DOCUMENT_TYPES, type DocumentType } from '@/core/domain/identity/document-id';
import {
  requestPortalCodeAction,
  verifyPortalCodeAction,
  type PortalCodeError,
} from '@/presentation/actions/portal';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { FormField } from '@/presentation/components/auth/form-field';
import { GoogleButton } from '@/presentation/components/auth/google-button';
import { OtpInput } from '@/presentation/components/auth/otp-input';
import {
  TURNSTILE_DUMMY_TOKEN,
  TurnstileField,
} from '@/presentation/components/auth/turnstile-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

/** US14.3 y US14.4: el vecino entra con Google o con su documento y un código. */
export function PortalLoginForm({ notice }: { notice: 'link' | 'google' | null }) {
  const t = useTranslations('Portal.login');
  const tAuth = useTranslations('Auth');
  const tDoc = useTranslations('Customers.documentTypes');
  const router = useRouter();

  const [step, setStep] = useState<'document' | 'code'>('document');
  const [documentType, setDocumentType] = useState<DocumentType>('DNI');
  const [documentNumber, setDocumentNumber] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState(TURNSTILE_DUMMY_TOKEN);
  const [error, setError] = useState<PortalCodeError | null>(null);
  const [sending, setSending] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const result = await requestPortalCodeAction({ documentType, documentNumber, captchaToken });
      if (!result.ok) return setError(result.error);
      setCode('');
      setStep('code');
    } catch {
      setError('GENERIC');
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('CODE_INVALID');
    setSending(true);
    try {
      const result = await verifyPortalCodeAction({ documentType, documentNumber, code });
      if (!result.ok) return setError(result.error);
      router.push('/portal');
      router.refresh();
    } catch {
      setError('GENERIC');
    } finally {
      setSending(false);
    }
  }

  const footer = (
    <p>
      {t('merchantQuestion')}{' '}
      <Link
        href="/login"
        className="font-semibold text-link-active underline-offset-4 hover:underline"
      >
        {t('merchantLink')}
      </Link>
    </p>
  );

  return (
    <AuthShell
      logoAlt={tAuth('logoAlt')}
      title={t('title')}
      subtitle={t('subtitle')}
      footer={footer}
      aside="portal"
    >
      {notice ? <Notice tone="error">{t(`notice.${notice}`)}</Notice> : null}

      {step === 'document' ? (
        <>
          <div className="flex flex-col gap-4">
            <GoogleButton callbackURL="/app/portal" errorCallbackURL="/app/portal/login" />
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              <span className="h-px flex-1 bg-line" />
              <span>{t('or')}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>

          <form onSubmit={requestCode} noValidate className="flex flex-col gap-4">
            <FormField id="portal-document-type" label={t('typeLabel')} hint={t('typeHint')}>
              {(props) => (
                <NativeSelect
                  {...props}
                  name="documentType"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                >
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tDoc(type)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField
              id="portal-document-number"
              label={t('numberLabel')}
              hint={t('numberHint')}
              error={error && error !== 'CAPTCHA_REQUIRED' ? t(`errors.${error}`) : undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  name="documentNumber"
                  inputMode={documentType === 'DNI' ? 'numeric' : 'text'}
                  autoComplete="off"
                  autoCapitalize="characters"
                  required
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  className="tabular-nums"
                />
              )}
            </FormField>
            <TurnstileField onToken={setCaptchaToken} />
            {error === 'CAPTCHA_REQUIRED' ? (
              <p role="alert" className="text-[13px] font-medium text-error-ink">
                {t('errors.CAPTCHA_REQUIRED')}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="w-full" disabled={sending}>
              {sending ? t('sending') : t('send')}
            </Button>
          </form>

          <p className="text-sm text-ink-soft">
            {t('passwordQuestion')}{' '}
            <Link
              href="/login"
              className="font-medium text-link-active underline-offset-4 hover:underline"
            >
              {t('passwordLink')}
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={verifyCode} noValidate className="flex flex-col gap-4">
          <Notice tone="success">
            <p>{t('sent')}</p>
          </Notice>
          <div className="flex flex-col gap-1.5">
            <span id="portal-code-label" className="text-sm font-medium text-ink">
              {t('codeLabel')}
            </span>
            <OtpInput
              value={code}
              onChange={setCode}
              describedBy="portal-code-label portal-code-hint"
              invalid={error === 'CODE_INVALID'}
              disabled={sending}
            />
            <p id="portal-code-hint" className="text-[13px] leading-snug text-ink-soft">
              {t('codeHint')}
            </p>
            {error ? (
              <p role="alert" className="text-[13px] font-medium text-error-ink">
                {t(`errors.${error}`)}
              </p>
            ) : null}
          </div>
          <Button type="submit" variant="primary" className="w-full" disabled={sending}>
            {sending ? t('verifying') : t('verify')}
          </Button>
          {/* El token de Turnstile es de un solo uso: otro código se pide desde el primer paso */}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => setStep('document')}
          >
            {t('again')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
