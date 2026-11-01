import { useTranslations } from 'next-intl';
import {
  CircleCheckIcon,
  CircleDashedIcon,
  ClockIcon,
  ReceiptTextIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { cn } from '@/presentation/lib/utils';

export type CycleBadgeStatus = 'OPEN' | 'BILLED' | 'DUE_SOON' | 'PAID' | 'OVERDUE';

// DESIGN.md §2.4: un solo color por estado del cobro en toda la app
const STYLES: Record<CycleBadgeStatus, string> = {
  OPEN: 'bg-paper-deep text-ink-soft',
  BILLED: 'bg-soft text-soft-ink',
  DUE_SOON: 'bg-amber/12 text-amber-ink',
  PAID: 'bg-success/12 text-success-ink',
  OVERDUE: 'bg-error/12 text-error-ink',
};

const ICONS = {
  OPEN: CircleDashedIcon,
  BILLED: ReceiptTextIcon,
  DUE_SOON: ClockIcon,
  PAID: CircleCheckIcon,
  OVERDUE: TriangleAlertIcon,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Un ciclo liquidado que vence en 3 días o menos se muestra en ámbar (US12). */
export function cycleBadgeStatus(
  status: 'OPEN' | 'BILLED' | 'PAID' | 'OVERDUE',
  paymentDueDate: Date,
  now: Date,
): CycleBadgeStatus {
  if (status === 'BILLED' && paymentDueDate.getTime() - now.getTime() <= 3 * DAY_MS) {
    return 'DUE_SOON';
  }
  return status;
}

export function CycleStatusBadge({ status }: { status: CycleBadgeStatus }) {
  const t = useTranslations('Collections.cycleStatus');
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap',
        STYLES[status],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {t(status)}
    </span>
  );
}
