'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcwIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/core/domain/catalog/product-image';
import {
  PaymentDetails,
  type PaymentDetails as PaymentDetailsValue,
} from '@/core/domain/identity/payment-details';
import {
  savePaymentDetailsAction,
  type PaymentDetailsField,
  type PaymentDetailsState,
} from '@/presentation/actions/payment-details';
import { FormField } from '@/presentation/components/auth/form-field';
import { useActionToast } from '@/presentation/components/feedback/use-action-toast';
import { PaymentPreviewCard } from '@/presentation/components/settings/payment-preview-card';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

type FormValues = {
  yapeNumber: string;
  plinNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankCci: string;
};

type TextField = keyof FormValues;

const PERUVIAN_BANKS = [
  'BCP',
  'BBVA',
  'Interbank',
  'Scotiabank',
  'Banco de la Nación',
  'BanBif',
  'Pichincha',
  'Mibanco',
  'Caja Arequipa',
  'Caja Huancayo',
  'Caja Piura',
  'Caja Trujillo',
  'Banco Falabella',
  'Banco Ripley',
] as const;

const BANK_DATALIST_ID = 'payment-peruvian-banks';

const toFormValues = (details: PaymentDetailsValue): FormValues => ({
  yapeNumber: details.yapeNumber ?? '',
  plinNumber: details.plinNumber ?? '',
  bankName: details.bankName ?? '',
  bankAccountNumber: details.bankAccountNumber ?? '',
  bankCci: details.bankCci ?? '',
});

/** Plan 5, P3: lo que el vecino verá en su portal para pagarle a la tienda (US14.6). */
export function PaymentDetailsForm({
  initial,
  qrUrl,
}: {
  initial: PaymentDetailsValue;
  qrUrl: string | null;
}) {
  const t = useTranslations('Settings.payment');
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial));
  const [prevInitial, setPrevInitial] = useState(initial);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<PaymentDetailsField | 'form', string>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrPreviewRef = useRef<string | null>(null);

  if (
    initial.yapeNumber !== prevInitial.yapeNumber ||
    initial.plinNumber !== prevInitial.plinNumber ||
    initial.bankName !== prevInitial.bankName ||
    initial.bankAccountNumber !== prevInitial.bankAccountNumber ||
    initial.bankCci !== prevInitial.bankCci
  ) {
    setPrevInitial(initial);
    setValues(toFormValues(initial));
  }

  function replaceQrFile(file: File | null) {
    if (qrPreviewRef.current) {
      URL.revokeObjectURL(qrPreviewRef.current);
      qrPreviewRef.current = null;
    }
    if (!file) {
      setQrFile(null);
      setQrPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    qrPreviewRef.current = objectUrl;
    setQrFile(file);
    setQrPreviewUrl(objectUrl);
  }

  useEffect(() => {
    return () => {
      if (qrPreviewRef.current) URL.revokeObjectURL(qrPreviewRef.current);
    };
  }, []);

  const [state, formAction, pending] = useActionState(
    async (prev: PaymentDetailsState, formData: FormData) => {
      const result = await savePaymentDetailsAction(prev, formData);
      if (result.saved) {
        setRemoveQr(false);
        replaceQrFile(null);
        setErrors({});
        if (fileInputRef.current) fileInputRef.current.value = '';
        const parsed = PaymentDetails.parse({
          yapeNumber: String(formData.get('yapeNumber') ?? ''),
          plinNumber: String(formData.get('plinNumber') ?? ''),
          bankName: String(formData.get('bankName') ?? ''),
          bankAccountNumber: String(formData.get('bankAccountNumber') ?? ''),
          bankCci: String(formData.get('bankCci') ?? ''),
        });
        if (parsed.ok) setValues(toFormValues(parsed.value));
      } else if (result.errors) {
        setErrors(result.errors);
      }
      return result;
    },
    {},
  );

  useActionToast(
    state,
    state.saved
      ? { type: 'success', title: t('saved') }
      : state.errors?.form
        ? { type: 'error', title: t('errors.form') }
        : null,
  );

  const baseline = toFormValues(initial);
  const isDirty =
    values.yapeNumber !== baseline.yapeNumber ||
    values.plinNumber !== baseline.plinNumber ||
    values.bankName !== baseline.bankName ||
    values.bankAccountNumber !== baseline.bankAccountNumber ||
    values.bankCci !== baseline.bankCci ||
    qrFile !== null ||
    removeQr;

  const effectiveQrUrl = removeQr ? null : (qrPreviewUrl ?? qrUrl);
  const error = (field: PaymentDetailsField) =>
    errors[field] ? t(`errors.${field}.${errors[field]}`) : undefined;

  const setField = (field: TextField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setValues((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  function handleQrChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      e.target.value = '';
      replaceQrFile(null);
      setErrors((current) => ({ ...current, qr: 'IMAGE_TYPE' }));
      return;
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      e.target.value = '';
      replaceQrFile(null);
      setErrors((current) => ({ ...current, qr: 'IMAGE_TOO_LARGE' }));
      return;
    }
    setErrors((current) => ({ ...current, qr: undefined, form: undefined }));
    setRemoveQr(false);
    replaceQrFile(file);
  }

  function handleRemoveQr() {
    replaceQrFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (qrUrl) setRemoveQr(true);
    setErrors((current) => ({ ...current, qr: undefined }));
  }

  function handleDiscard() {
    setValues(toFormValues(initial));
    replaceQrFile(null);
    setRemoveQr(false);
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const next: Partial<Record<PaymentDetailsField, string>> = {};
    const parsed = PaymentDetails.parse(values);
    if (!parsed.ok) {
      next[parsed.error.field] = parsed.error.error;
    }
    if (qrFile) {
      if (!IMAGE_TYPES.includes(qrFile.type as (typeof IMAGE_TYPES)[number])) {
        next.qr = 'IMAGE_TYPE';
      } else if (qrFile.size === 0 || qrFile.size > MAX_IMAGE_BYTES) {
        next.qr = 'IMAGE_TOO_LARGE';
      }
    }
    if (Object.keys(next).length > 0) {
      event.preventDefault();
      setErrors(next);
      return;
    }
    setErrors({});
  }

  const qrError = error('qr');
  const qrDescribedBy = qrError ? 'payment-qr-hint payment-qr-error' : 'payment-qr-hint';

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start">
      <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div role="group" aria-labelledby="payment-wallets-title" className="flex flex-col gap-3">
          <h3 id="payment-wallets-title" className="text-base font-semibold text-ink">
            {t('sections.wallets')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="payment-yapeNumber"
              label={t('yapeNumber.label')}
              hint={t('yapeNumber.hint')}
              error={error('yapeNumber')}
            >
              {(props) => (
                <Input
                  {...props}
                  name="yapeNumber"
                  inputMode="tel"
                  autoComplete="off"
                  value={values.yapeNumber}
                  onChange={setField('yapeNumber')}
                  className="tabular-nums"
                />
              )}
            </FormField>

            <FormField
              id="payment-plinNumber"
              label={t('plinNumber.label')}
              hint={t('plinNumber.hint')}
              error={error('plinNumber')}
            >
              {(props) => (
                <Input
                  {...props}
                  name="plinNumber"
                  inputMode="tel"
                  autoComplete="off"
                  value={values.plinNumber}
                  onChange={setField('plinNumber')}
                  className="tabular-nums"
                />
              )}
            </FormField>
          </div>
        </div>

        <div
          role="group"
          aria-labelledby="payment-bank-title"
          className="flex flex-col gap-3 border-t border-line pt-5"
        >
          <h3 id="payment-bank-title" className="text-base font-semibold text-ink">
            {t('sections.bank')}
          </h3>
          <div className="flex flex-col gap-4">
            <FormField
              id="payment-bankName"
              label={t('bankName.label')}
              hint={t('bankName.hint')}
              error={error('bankName')}
            >
              {(props) => (
                <>
                  <Input
                    {...props}
                    name="bankName"
                    inputMode="text"
                    autoComplete="off"
                    list={BANK_DATALIST_ID}
                    value={values.bankName}
                    onChange={setField('bankName')}
                  />
                  <datalist id={BANK_DATALIST_ID}>
                    {PERUVIAN_BANKS.map((bank) => (
                      <option key={bank} value={bank} />
                    ))}
                  </datalist>
                </>
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="payment-bankAccountNumber"
                label={t('bankAccountNumber.label')}
                hint={t('bankAccountNumber.hint')}
                error={error('bankAccountNumber')}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="bankAccountNumber"
                    inputMode="text"
                    autoComplete="off"
                    value={values.bankAccountNumber}
                    onChange={setField('bankAccountNumber')}
                    className="tabular-nums"
                  />
                )}
              </FormField>

              <FormField
                id="payment-bankCci"
                label={t('bankCci.label')}
                hint={t('bankCci.hint')}
                error={error('bankCci')}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="bankCci"
                    inputMode="numeric"
                    autoComplete="off"
                    value={values.bankCci}
                    onChange={setField('bankCci')}
                    className="tabular-nums"
                  />
                )}
              </FormField>
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-labelledby="payment-qr-title"
          className="flex flex-col gap-3 border-t border-line pt-5"
        >
          <h3 id="payment-qr-title" className="text-base font-semibold text-ink">
            {t('qr.title')}
          </h3>
          <label htmlFor="payment-qr" className="text-sm font-medium text-ink">
            {t('qr.label')}
          </label>
          <input
            ref={fileInputRef}
            id="payment-qr"
            name="qr"
            type="file"
            accept={IMAGE_TYPES.join(',')}
            tabIndex={-1}
            aria-describedby={qrDescribedBy}
            aria-invalid={Boolean(qrError)}
            onChange={handleQrChange}
            className="sr-only"
          />
          <input type="hidden" name="removeQr" value={removeQr ? 'on' : ''} />

          <div className="flex flex-wrap items-center gap-4">
            {effectiveQrUrl ? (
              <div className="shrink-0 rounded-field border border-line bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal o vista previa local */}
                <img
                  src={effectiveQrUrl}
                  alt={t('qr.currentAlt')}
                  className="size-20 object-contain"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
              >
                <UploadIcon aria-hidden="true" />
                {effectiveQrUrl ? t('qr.change') : t('qr.upload')}
              </Button>

              {effectiveQrUrl ? (
                <Button type="button" variant="ghost" onClick={handleRemoveQr} disabled={pending}>
                  <Trash2Icon aria-hidden="true" />
                  {t('qr.remove')}
                </Button>
              ) : removeQr && qrUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRemoveQr(false)}
                  disabled={pending}
                >
                  <RotateCcwIcon aria-hidden="true" />
                  {t('qr.keep')}
                </Button>
              ) : null}
            </div>
          </div>

          {removeQr && qrUrl && !qrFile ? (
            <p className="text-[13px] font-medium text-amber-ink">{t('qr.willRemove')}</p>
          ) : null}

          <p id="payment-qr-hint" className="text-[13px] leading-snug text-ink-soft">
            {t('qr.hint')}
          </p>

          {qrError ? (
            <p
              id="payment-qr-error"
              role="alert"
              className="text-[13px] leading-snug font-medium text-error-ink"
            >
              {qrError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDiscard}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {t('discard')}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>

      <PaymentPreviewCard
        yapeNumber={values.yapeNumber}
        plinNumber={values.plinNumber}
        bankName={values.bankName}
        bankAccountNumber={values.bankAccountNumber}
        bankCci={values.bankCci}
        qrUrl={effectiveQrUrl}
      />
    </div>
  );
}
