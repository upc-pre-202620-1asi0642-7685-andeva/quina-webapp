'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';
import { sileo } from 'sileo';
import {
  applyTheme,
  readThemeChoice,
  subscribeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from '@/presentation/lib/theme';
import { cn } from '@/presentation/lib/utils';

const THEME_ICONS: Record<ThemeChoice, LucideIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

const press =
  'transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100';

export function ThemeSelectorCard({ variant = 'store' }: { variant?: 'store' | 'portal' }) {
  const portal = variant === 'portal';
  const t = useTranslations('Profile.theme');
  const currentTheme = useSyncExternalStore(
    subscribeTheme,
    readThemeChoice,
    () => 'system' as ThemeChoice,
  );

  function handleSelect(choice: ThemeChoice) {
    if (choice === currentTheme) return;
    applyTheme(choice);
    sileo.success({ title: t('saved') });
  }

  return (
    <section
      aria-labelledby="profile-theme-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="profile-theme-title"
          className={cn('font-semibold text-ink', portal ? 'text-xl' : 'text-lg')}
        >
          {t('title')}
        </h2>
        <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>{t('subtitle')}</p>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="profile-theme-title"
        className="grid gap-3 sm:grid-cols-3"
      >
        {THEME_CHOICES.map((choice) => {
          const Icon = THEME_ICONS[choice];
          const selected = currentTheme === choice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleSelect(choice)}
              className={cn(
                'flex min-h-14 cursor-pointer items-start gap-3 rounded-field border p-3.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
                selected
                  ? 'border-link-active bg-soft/70 text-soft-ink'
                  : 'border-line bg-paper/40 text-ink hover:bg-surface-hover',
                press,
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                  selected ? 'bg-primary text-primary-dark' : 'bg-paper-deep text-ink-soft',
                )}
              >
                <Icon aria-hidden="true" className="size-4.5" />
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'flex items-center justify-between gap-2 font-semibold text-ink',
                    portal ? 'text-base' : 'text-sm',
                  )}
                >
                  <span>{t(`options.${choice}.label`)}</span>
                  {selected ? (
                    <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-link-active" />
                  ) : null}
                </span>
                <span
                  className={cn('leading-snug text-ink-soft', portal ? 'text-sm' : 'text-[13px]')}
                >
                  {t(`options.${choice}.hint`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
