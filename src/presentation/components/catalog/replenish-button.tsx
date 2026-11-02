'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import { ClipboardListIcon, Trash2Icon } from 'lucide-react';
import {
  discardPurchaseOrderAction,
  generateReplenishmentOrdersAction,
} from '@/presentation/actions/purchases';
import { Button } from '@/presentation/components/ui/button';

export function ReplenishButton() {
  const t = useTranslations('Inventory.list');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const handleGenerate = () => {
    start(async () => {
      const result = await generateReplenishmentOrdersAction();
      if (!result.ok) {
        sileo.error({ title: t('noLowStockResults') });
        return;
      }
      sileo.success({
        title: t('replenishSuccess', {
          orders: result.createdCount,
          items: result.createdCount,
        }),
      });
      if (pathname.endsWith('/inventory/purchases')) {
        router.refresh();
      } else {
        router.push('/inventory/purchases');
      }
    });
  };

  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={handleGenerate}>
      <ClipboardListIcon aria-hidden="true" />
      {pending ? t('replenishBusy') : t('replenishButton')}
    </Button>
  );
}

export function DiscardPurchaseOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations('Purchases.orders');
  const router = useRouter();
  const [pending, start] = useTransition();

  const handleDiscard = () => {
    start(async () => {
      const result = await discardPurchaseOrderAction(orderId);
      if (!result.ok) return;
      sileo.success({ title: t('discarded') });
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={handleDiscard}
      className="text-error-ink hover:bg-error/12 hover:text-error-ink"
    >
      <Trash2Icon aria-hidden="true" />
      {t('discardButton')}
    </Button>
  );
}
