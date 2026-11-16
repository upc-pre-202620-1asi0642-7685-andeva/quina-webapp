import { useTranslations } from 'next-intl';
import {
  CircleCheckIcon,
  CircleOffIcon,
  CircleXIcon,
  ClockIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import type { SubscriptionPaymentStatus } from '@/core/domain/ports/subscription-gateway';
import { cn } from '@/presentation/lib/utils';

export type SubscriptionBadgeStatus = SubscriptionStatus | SubscriptionPaymentStatus;

// DESIGN.md §2.4: un solo color por estado en toda la app (fondo al 12 % y texto -ink)
const STYLES: Record<SubscriptionBadgeStatus, string> = {
  ACTIVE: 'bg-success/12 text-success-ink',
  TRIALING: 'bg-soft text-soft-ink',
  PAST_DUE: 'bg-amber/12 text-amber-ink',
  CANCELED: 'bg-paper-deep text-ink-soft',
  APPROVED: 'bg-success/12 text-success-ink',
  REJECTED: 'bg-error/12 text-error-ink',
  REFUNDED: 'bg-amber/12 text-amber-ink',
};

const ICONS = {
  ACTIVE: CircleCheckIcon,
  TRIALING: ClockIcon,
  PAST_DUE: TriangleAlertIcon,
  CANCELED: CircleOffIcon,
  APPROVED: CircleCheckIcon,
  REJECTED: CircleXIcon,
  REFUNDED: RotateCcwIcon,
} as const;

const PAYMENT_STATUSES = new Set<SubscriptionBadgeStatus>(['APPROVED', 'REJECTED', 'REFUNDED']);

/** Insignia unificada para el estado de la suscripción y de cada pago (DESIGN.md §2.4). */
export function SubscriptionStatusBadge({ status }: { status: SubscriptionBadgeStatus }) {
  const t = useTranslations('Settings');
  const Icon = ICONS[status];
  const label = PAYMENT_STATUSES.has(status)
    ? t(`billingHistory.statuses.${status as SubscriptionPaymentStatus}`)
    : t(`subscriptionStatus.${status as SubscriptionStatus}`);

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap',
        STYLES[status],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}
