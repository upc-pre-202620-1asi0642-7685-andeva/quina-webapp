'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckIcon, LanguagesIcon, Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { sileo } from 'sileo';
import { locales, type Locale } from '@/core/domain/shared/locale';
import { setLocaleAction } from '@/presentation/actions/locale';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

const press =
  'transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100';

export function LocaleSelectorCard({
  currentLocale,
  variant = 'store',
}: {
  currentLocale: Locale;
  variant?: 'store' | 'portal';
}) {
  const portal = variant === 'portal';
  const t = useTranslations('Profile');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();

  const [savedLocale, setSavedLocale] = useState<Locale>(currentLocale);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const [prevProp, setPrevProp] = useState<Locale>(currentLocale);
  const [isPending, startTransition] = useTransition();

  if (currentLocale !== prevProp) {
    setPrevProp(currentLocale);
    setSavedLocale(currentLocale);
    setSelectedLocale(currentLocale);
  }

  const isDirty = selectedLocale !== savedLocale;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const res = await setLocaleAction(selectedLocale);
      if (res.ok) {
        setSavedLocale(selectedLocale);
        sileo.success({ title: t('localeSaved') });
        router.refresh();
      } else {
        sileo.error({ title: tErr('generic') });
      }
    });
  }

  return (
    <section
      aria-labelledby="profile-locale-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="profile-locale-title"
          className={cn('font-semibold text-ink', portal ? 'text-xl' : 'text-lg')}
        >
          {t('localeTitle')}
        </h2>
        <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>{t('localeHint')}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={t('localeLabel')} className="grid gap-3 sm:grid-cols-3">
          {locales.map((loc) => {
            const selected = selectedLocale === loc;
            return (
              <label
                key={loc}
                className={cn(
                  'relative flex min-h-14 cursor-pointer items-start gap-3 rounded-field border p-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-link-active',
                  selected
                    ? 'border-link-active bg-soft/70 text-soft-ink'
                    : 'border-line bg-paper/40 text-ink hover:bg-surface-hover',
                  press,
                )}
              >
                <input
                  type="radio"
                  name="locale"
                  value={loc}
                  checked={selected}
                  disabled={isPending}
                  onChange={() => setSelectedLocale(loc)}
                  className="absolute inset-0 z-10 cursor-pointer opacity-0"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                    selected ? 'bg-primary text-primary-dark' : 'bg-paper-deep text-ink-soft',
                  )}
                >
                  <LanguagesIcon className="size-4.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      'flex items-center justify-between gap-2 font-semibold text-ink',
                      portal ? 'text-base' : 'text-sm',
                    )}
                  >
                    <span>{t(`locales.${loc}`)}</span>
                    {selected ? (
                      <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-link-active" />
                    ) : null}
                  </span>
                  <span
                    className={cn('leading-snug text-ink-soft', portal ? 'text-sm' : 'text-[13px]')}
                  >
                    {t(`localeDescriptions.${loc}`)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            type="submit"
            variant="primary"
            size={portal ? 'lg' : 'default'}
            disabled={!isDirty || isPending}
          >
            {isPending ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
            <span>{t('saveLocale')}</span>
          </Button>

          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              size={portal ? 'lg' : 'default'}
              disabled={isPending}
              onClick={() => setSelectedLocale(savedLocale)}
            >
              <RotateCcwIcon aria-hidden="true" />
              <span>{t('personal.undo')}</span>
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
