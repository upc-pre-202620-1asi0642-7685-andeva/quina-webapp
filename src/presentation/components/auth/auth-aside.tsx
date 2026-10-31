import Image from 'next/image';
import { Check, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatDate } from '@/presentation/lib/format-date';
import photo from '../../../../public/auth/bodeguero.jpg';

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

/**
 * Panel de marca de las pantallas de acceso (DESIGN.md §6.1). Solo en escritorio:
 * la foto del bodeguero de fondo y, flotando encima, lo que ve en su celular.
 */
export function AuthAside({ variant }: { variant: AuthAsideVariant }) {
  const t = useTranslations('AuthAside');

  return (
    // Fijo a la altura de la ventana: el formulario de registro es más alto y se desplaza solo
    <aside className="relative hidden overflow-hidden rounded-card bg-primary-dark lg:sticky lg:top-3 lg:block lg:h-[calc(100dvh-1.5rem)]">
      <Image
        src={photo}
        alt={t('photoAlt')}
        fill
        priority
        sizes="50vw"
        placeholder="blur"
        className="object-cover"
      />
      {/* Velo de marca: el título se lee sobre cualquier foto */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-b from-primary-dark/90 via-primary-dark/25 to-primary-dark/50"
      />

      <div className="relative flex h-full flex-col justify-between gap-10 p-12 xl:p-16">
        <div className="flex max-w-md flex-col gap-4 text-primary-soft">
          <h2 className="text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
            {t(`${variant}.title`)}
          </h2>
          <p className="text-base text-primary-soft/85">{t(`${variant}.lead`)}</p>
        </div>

        <div className="auth-aside-card relative w-full max-w-sm pb-8">
          <article
            aria-label={t('card.label')}
            className="rounded-card bg-surface p-5 text-ink shadow-float"
          >
            <header className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full bg-soft text-sm font-bold text-soft-ink"
              >
                RQ
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-semibold">{t('card.name')}</span>
                <span className="text-[13px] text-ink-soft">{t('card.example')}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2.5 py-1 text-[13px] font-medium text-soft-ink">
                <Check className="size-4" aria-hidden="true" />
                {t('card.status')}
              </span>
            </header>

            <dl className="mt-5 flex flex-col gap-1">
              <dt className="text-[13px] text-ink-soft">{t('card.balance')}</dt>
              <dd className="text-amount font-bold tabular-nums">{EXAMPLE.balance}</dd>
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              <div
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={EXAMPLE.usedPercent}
                aria-label={t('card.limitUsed', { percent: EXAMPLE.usedPercent })}
                className="h-1.5 overflow-hidden rounded-full bg-paper-deep"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${EXAMPLE.usedPercent}%` }}
                />
              </div>
              <p className="text-[13px] text-ink-soft tabular-nums">
                {t('card.limit', { limit: EXAMPLE.limit })}
              </p>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-[13px] text-ink-soft">{t('card.cutOff')}</dt>
                <dd className="font-medium tabular-nums">{formatDate(EXAMPLE.cutOff)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[13px] text-ink-soft">{t('card.due')}</dt>
                <dd className="font-medium tabular-nums">{formatDate(EXAMPLE.due)}</dd>
              </div>
            </dl>
          </article>

          {/* El cobro: el aviso que Quina le manda a la vecina */}
          <div className="absolute right-[-2rem] bottom-0 flex items-center gap-3 rounded-full bg-surface py-2 pr-5 pl-2 text-ink shadow-float">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-dark">
              <Mail className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{t('card.reminder')}</span>
              <span className="text-[13px] text-ink-soft">{t('card.reminderTo')}</span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
