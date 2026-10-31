import { useTranslations } from 'next-intl';
import {
  CircleCheckIcon,
  CircleOffIcon,
  CirclePauseIcon,
  OctagonXIcon,
  WalletIcon,
} from 'lucide-react';
import { cn } from '@/presentation/lib/utils';

export type CustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'noAccount' | 'inactive';

// DESIGN.md §2.4: fondo al 12 % y texto -ink; el color nunca va solo
const STYLES: Record<CustomerStatus, string> = {
  ACTIVE: 'bg-success/12 text-success-ink',
  SUSPENDED: 'bg-paper-deep text-ink-soft',
  BLOCKED: 'bg-error/12 text-error-ink',
  noAccount: 'bg-paper-deep text-ink-soft',
  inactive: 'bg-paper-deep text-ink-soft',
};

const ICONS = {
  ACTIVE: CircleCheckIcon,
  SUSPENDED: CirclePauseIcon,
  BLOCKED: OctagonXIcon,
  noAccount: WalletIcon,
  inactive: CircleOffIcon,
} as const;

export function customerStatus(
  isActive: boolean,
  accountStatus: string | null | undefined,
): CustomerStatus {
  if (!isActive) return 'inactive';
  if (accountStatus === 'ACTIVE' || accountStatus === 'SUSPENDED' || accountStatus === 'BLOCKED') {
    return accountStatus;
  }
  return 'noAccount';
}

export function StatusBadge({ status }: { status: CustomerStatus }) {
  const t = useTranslations('Customers.status');
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
