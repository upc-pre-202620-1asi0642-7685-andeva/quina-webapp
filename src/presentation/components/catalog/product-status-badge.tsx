import { useTranslations } from 'next-intl';
import { CircleCheckIcon, CircleOffIcon, PackageXIcon, TriangleAlertIcon } from 'lucide-react';
import { Quantity } from '@/core/domain/catalog/quantity';
import { cn } from '@/presentation/lib/utils';

export type ProductStatus = 'active' | 'inactive' | 'lowStock' | 'noStock';

// DESIGN.md §2.4: fondo al 12 % y texto -ink; el color nunca va solo
const STYLES: Record<ProductStatus, string> = {
  active: 'bg-success/12 text-success-ink',
  inactive: 'bg-paper-deep text-ink-soft',
  lowStock: 'bg-amber/12 text-amber-ink',
  noStock: 'bg-error/12 text-error-ink',
};

const ICONS = {
  active: CircleCheckIcon,
  inactive: CircleOffIcon,
  lowStock: TriangleAlertIcon,
  noStock: PackageXIcon,
} as const;

export function productStatus(product: {
  isActive: boolean;
  isService: boolean;
  currentStock: string;
  minimumStock: string;
}): ProductStatus {
  if (!product.isActive) return 'inactive';
  if (product.isService) return 'active';
  if (Quantity.isZero(product.currentStock)) return 'noStock';
  // US17 crit. 2: stock en el mínimo o debajo
  if (
    !Quantity.isZero(product.minimumStock) &&
    Quantity.compare(product.currentStock, product.minimumStock) <= 0
  ) {
    return 'lowStock';
  }
  return 'active';
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const t = useTranslations('Inventory.status');
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
