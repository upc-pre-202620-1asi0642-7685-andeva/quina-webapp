'use client';

import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PasswordPolicy, type PasswordRule } from '@/core/domain/identity/password-policy';

const zxcvbn = new ZxcvbnFactory();

const ALL_RULES: {
  rule: PasswordRule;
  key: 'ruleMinLength' | 'ruleUppercase' | 'ruleNumber' | 'ruleSymbol';
}[] = [
  { rule: 'MIN_LENGTH', key: 'ruleMinLength' },
  { rule: 'UPPERCASE', key: 'ruleUppercase' },
  { rule: 'NUMBER', key: 'ruleNumber' },
  { rule: 'SYMBOL', key: 'ruleSymbol' },
];

export function isPasswordStrong(password: string): boolean {
  if (!PasswordPolicy.check(password).ok) return false;
  return zxcvbn.check(password).score >= 3;
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations('Register.strength');
  const policy = PasswordPolicy.check(password);
  const missing = new Set<PasswordRule>(policy.ok ? [] : policy.error);
  const score = password ? zxcvbn.check(password).score : 0;
  const strong = policy.ok && score >= 3;

  return (
    <div className="flex flex-col gap-2 rounded-field bg-paper-deep p-3">
      <div
        className="flex items-center justify-between gap-2 text-[13px] font-medium text-ink"
        aria-live="polite"
      >
        <span>{t('label')}</span>
        <span className={strong ? 'text-success-ink' : 'text-ink-soft'}>
          {strong ? t('strong') : t('weak')}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1 text-[13px]">
        {ALL_RULES.map(({ rule, key }) => {
          const passed = password.length > 0 && !missing.has(rule);
          return (
            <li
              key={rule}
              className={`flex items-center gap-2 ${passed ? 'text-success-ink' : 'text-ink-soft'}`}
            >
              {passed ? (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{t(key)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
