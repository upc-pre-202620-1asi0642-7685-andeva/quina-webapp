'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon, ChevronDownIcon, CrownIcon, ShieldCheckIcon } from 'lucide-react';
import { cn } from '@/presentation/lib/utils';

const EMPLOYEE_KEYS = ['employee1', 'employee2', 'employee3'] as const;
const OWNER_KEYS = ['owner1', 'owner2', 'owner3'] as const;

export function RolePermissionsCard() {
  const t = useTranslations('Team.roles');
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-labelledby="role-permissions-title"
      className="rounded-card border border-line bg-surface"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="role-permissions-panel"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded-card px-4 py-4 text-left transition-colors duration-150 ease-(--ease-out-expo) outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active motion-reduce:transition-none sm:px-6"
      >
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-link-active" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="role-permissions-title" className="text-base font-semibold text-ink">
              {t('toggleTitle')}
            </h2>
            <p className="text-sm text-ink-soft">{t('toggleSubtitle')}</p>
          </div>
        </div>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            'size-5 shrink-0 text-ink-soft transition-transform duration-200 ease-(--ease-out-expo) motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>

      <div
        id="role-permissions-panel"
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-(--ease-out-expo) motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className={cn('overflow-hidden', !open && 'invisible')}>
          <div className="grid gap-6 border-t border-line px-4 py-4 sm:grid-cols-2 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CheckIcon aria-hidden="true" className="size-4 text-success-ink" />
                {t('employeeHeading')}
              </h3>
              <ul className="flex flex-col gap-2 text-sm text-ink-soft">
                {EMPLOYEE_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success"
                    />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CrownIcon aria-hidden="true" className="size-4 text-soft-ink" />
                {t('ownerHeading')}
              </h3>
              <ul className="flex flex-col gap-2 text-sm text-ink-soft">
                {OWNER_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-soft"
                    />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
