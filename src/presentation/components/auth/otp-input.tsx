'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';

const LENGTH = 6;

export type OtpInputProps = {
  value: string;
  onChange: (next: string) => void;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export function OtpInput({ value, onChange, describedBy, invalid, disabled }: OtpInputProps) {
  const t = useTranslations('Register.verify');
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: LENGTH }, (_, idx) => value[idx] ?? '');

  function setAt(index: number, char: string) {
    const next = [...digits];
    next[index] = char;
    onChange(next.join(''));
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      setAt(index, '');
      return;
    }
    if (clean.length > 1) {
      const merged = [...digits];
      for (let i = 0; i < clean.length && index + i < LENGTH; i += 1) {
        merged[index + i] = clean[i]!;
      }
      onChange(merged.join(''));
      const focusIdx = Math.min(index + clean.length, LENGTH - 1);
      refs.current[focusIdx]?.focus();
      return;
    }
    setAt(index, clean);
    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const clean = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!clean) return;
    event.preventDefault();
    onChange(clean);
    refs.current[Math.min(clean.length, LENGTH) - 1]?.focus();
  }

  return (
    <div className="flex items-center justify-between gap-2" aria-describedby={describedBy}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={t('digitLabel', { index: index + 1 })}
          aria-invalid={Boolean(invalid)}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="h-12 w-11 rounded-field border border-line bg-surface text-center text-lg font-semibold text-ink tabular-nums outline-none focus-visible:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active disabled:opacity-50 aria-invalid:border-error-ink"
        />
      ))}
    </div>
  );
}
