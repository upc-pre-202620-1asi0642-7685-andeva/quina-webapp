'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@/presentation/lib/utils';
import { breadcrumbTrail, type NavGroup, type NavItem } from './nav-items';

const PROFILE: NavItem = { key: 'profile', href: '/profile' };

/** Navegación interna: dónde estoy y cómo vuelvo (Inicio / Inventario / Compras). */
export function Breadcrumbs({ groups, secondary }: { groups: NavGroup[]; secondary: NavItem[] }) {
  const t = useTranslations('Shell');
  const pathname = usePathname();
  const trail = breadcrumbTrail(pathname, groups, [...secondary, PROFILE]);
  if (trail.length < 2) return null;

  return (
    <nav aria-label={t('breadcrumb.label')} className="mb-3 print:hidden">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-ink-soft">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          const text = 'key' in crumb ? t(`nav.${crumb.key}`) : t(`breadcrumb.${crumb.label}`);
          return (
            <li
              key={crumb.href}
              // En el celular solo quedan el padre y la página actual
              className={cn(
                'flex min-w-0 items-center gap-1',
                i < trail.length - 2 && 'hidden sm:flex',
              )}
            >
              {i > 0 ? (
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft/70" />
              ) : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {text}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate rounded-full py-1 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-link-active"
                >
                  {text}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
