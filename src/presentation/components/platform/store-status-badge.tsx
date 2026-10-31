import { useTranslations } from 'next-intl';
import { CircleCheckIcon, CirclePauseIcon } from 'lucide-react';
import { cn } from '@/presentation/lib/utils';

// DESIGN.md §2.4: fondo al 12 % y texto -ink; el color nunca va solo
export function StoreStatusBadge({ active }: { active: boolean }) {
  const t = useTranslations('Platform.status');
  const Icon = active ? CircleCheckIcon : CirclePauseIcon;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap',
        active ? 'bg-success/12 text-success-ink' : 'bg-error/12 text-error-ink',
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {active ? t('active') : t('suspended')}
    </span>
  );
}
