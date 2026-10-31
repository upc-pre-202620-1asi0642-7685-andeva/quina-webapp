import { useTranslations } from 'next-intl';
import { CircleCheckIcon, CircleOffIcon, CrownIcon, MailIcon } from 'lucide-react';
import type { TeamMember } from '@/core/domain/ports/team-repository';
import { cn } from '@/presentation/lib/utils';

// DESIGN.md §2.4: fondo al 12 % y texto -ink; el color nunca va solo
const STYLES = {
  OWNER: 'bg-primary-soft text-success-ink dark:bg-success/12',
  ACTIVE: 'bg-success/12 text-success-ink',
  INVITED: 'bg-amber/12 text-amber-ink',
  DEACTIVATED: 'bg-paper-deep text-ink-soft',
} as const;

const ICONS = {
  OWNER: CrownIcon,
  ACTIVE: CircleCheckIcon,
  INVITED: MailIcon,
  DEACTIVATED: CircleOffIcon,
} as const;

export function MemberBadge({ role, status }: Pick<TeamMember, 'role' | 'status'>) {
  const t = useTranslations('Team.status');
  const key = role === 'STORE_OWNER' ? 'OWNER' : status;
  const Icon = ICONS[key];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap',
        STYLES[key],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {t(key)}
    </span>
  );
}
