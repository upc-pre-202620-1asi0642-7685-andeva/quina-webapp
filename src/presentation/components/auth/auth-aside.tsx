import { CalendarClock, Check, Mail, NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatDate } from '@/presentation/lib/format-date';

export type AuthAsideVariant = 'register' | 'login';

// Ficha de ejemplo: la misma vecina que muestra la portada del sitio (DESIGN.md §1).
// Son valores ilustrativos y la tarjeta lo dice con su etiqueta "Ejemplo".
const EXAMPLE = {
  balance: 'S/ 186.40',
  limit: 'S/ 300.00',
  usedPercent: 62,
  cutOff: new Date('2026-11-25T17:00:00Z'),
  due: new Date('2026-12-05T17:00:00Z'),
};

const POINTS = [
  { key: 'point1', icon: NotebookPen },
  { key: 'point2', icon: CalendarClock },
  { key: 'point3', icon: Mail },
] as const;

/** Panel de marca de las pantallas de acceso (DESIGN.md §6.1). Solo en escritorio. */
export function AuthAside({ variant }: { variant: AuthAsideVariant }) {
  const t = useTranslations('AuthAside');

  return (
    <aside className="relative hidden overflow-hidden rounded-card bg-primary-dark text-primary-soft lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:p-12 xl:p-16">
      <div className="flex max-w-md flex-col gap-4">
        <h2 className="text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
          {t(`${variant}.title`)}
        </h2>
        <p className="text-base text-primary-soft/75">{t(`${variant}.lead`)}</p>
      </div>

      <article
        aria-label={t('card.label')}
        className="auth-aside-card w-full max-w-sm self-center rounded-card border border-primary-soft/15 bg-primary-soft/[0.06] p-5"
      >
        <header className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-dark"
          >
            RQ
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold">{t('card.name')}</span>
            <span className="text-[13px] text-primary-soft/70">{t('card.example')}</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[13px] font-medium text-primary">
            <Check className="size-4" aria-hidden="true" />
            {t('card.status')}
          </span>
        </header>

        <dl className="mt-5 flex flex-col gap-1">
          <dt className="text-[13px] text-primary-soft/70">{t('card.balance')}</dt>
          <dd className="text-amount font-bold text-primary tabular-nums">{EXAMPLE.balance}</dd>
        </dl>

        <div className="mt-4 flex flex-col gap-2">
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={EXAMPLE.usedPercent}
            aria-label={t('card.limitUsed', { percent: EXAMPLE.usedPercent })}
            className="h-1.5 overflow-hidden rounded-full bg-primary-soft/10"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${EXAMPLE.usedPercent}%` }}
            />
          </div>
          <p className="text-[13px] text-primary-soft/70 tabular-nums">
            {t('card.limit', { limit: EXAMPLE.limit })}
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-primary-soft/15 pt-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[13px] text-primary-soft/70">{t('card.cutOff')}</dt>
            <dd className="font-medium tabular-nums">{formatDate(EXAMPLE.cutOff)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[13px] text-primary-soft/70">{t('card.due')}</dt>
            <dd className="font-medium tabular-nums">{formatDate(EXAMPLE.due)}</dd>
          </div>
        </dl>
      </article>

      <ul className="flex max-w-md flex-col gap-3">
        {POINTS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-3 text-sm">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>{t(`${variant}.${key}`)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
