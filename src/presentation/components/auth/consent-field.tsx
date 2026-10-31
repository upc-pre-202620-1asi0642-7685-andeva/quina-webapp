'use client';

import { useTranslations } from 'next-intl';
import { LEGAL_URLS } from '@/infrastructure/auth/consent';
import { Checkbox } from '@/presentation/components/ui/checkbox';

export type ConsentFieldProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | undefined;
};

/** Casilla obligatoria de Términos y Política de privacidad (Ley N.° 29733). */
export function ConsentField({ checked, onCheckedChange, error }: ConsentFieldProps) {
  const t = useTranslations('Register.account');
  const id = 'register-consent';
  const errorId = `${id}-error`;
  const link = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <a href={href} className="font-semibold text-link-active underline underline-offset-4">
          {chunks}
        </a>
      );
    };

  return (
    <div className="flex flex-col gap-1.5">
      {/* La etiqueta también marca la casilla */}
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 size-5"
        />
        <label htmlFor={id} className="cursor-pointer text-sm leading-snug text-ink-soft">
          {t.rich('consentLabel', {
            terms: link(LEGAL_URLS.terms),
            privacy: link(LEGAL_URLS.privacy),
          })}
        </label>
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[13px] leading-snug font-medium text-error-ink"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
