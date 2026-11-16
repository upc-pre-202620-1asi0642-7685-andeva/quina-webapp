'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { cn } from '@/presentation/lib/utils';

type TabKey = 'all' | 'kardex' | 'prices' | 'details';

export function ProductDetailTabs({
  showKardex,
  movementsCount,
  priceChangesCount,
  detailsSlot,
  kardexSlot,
  pricesSlot,
}: {
  showKardex: boolean;
  movementsCount: number;
  priceChangesCount: number;
  detailsSlot: ReactNode;
  kardexSlot: ReactNode;
  pricesSlot: ReactNode;
}) {
  const t = useTranslations('Inventory.detail');

  const tabs: { key: TabKey; count?: number }[] = [
    { key: 'all' },
    ...(showKardex ? [{ key: 'kardex' as const, count: movementsCount }] : []),
    { key: 'prices', count: priceChangesCount },
    { key: 'details' },
  ];

  const triggerClass =
    'min-h-11 shrink-0 rounded-field px-3.5 text-sm font-medium text-ink-soft transition-[color,background-color,transform] duration-150 ease-(--ease-out-expo) hover:text-ink active:scale-[0.98] data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm';

  return (
    <Tabs defaultValue="all" className="flex flex-col gap-4">
      <TabsList
        aria-label={t('tabsLabel')}
        className={cn(
          'flex w-full touch-pan-x [scrollbar-width:none] justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-field bg-paper-deep p-1 group-data-[orientation=horizontal]/tabs:h-auto [&::-webkit-scrollbar]:hidden',
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} className={triggerClass}>
            <span>{t(`tabs.${tab.key}`)}</span>
            {tab.count !== undefined ? (
              <span className="rounded-full bg-paper-deep px-1.5 py-0.5 text-xs text-ink-soft tabular-nums group-data-[state=active]:bg-paper-deep">
                {tab.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="all" className="mt-0 flex flex-col gap-4">
        {detailsSlot}
        {showKardex ? kardexSlot : null}
        {pricesSlot}
      </TabsContent>

      {showKardex ? (
        <TabsContent value="kardex" className="mt-0 flex flex-col gap-4">
          {kardexSlot}
        </TabsContent>
      ) : null}

      <TabsContent value="prices" className="mt-0 flex flex-col gap-4">
        {pricesSlot}
      </TabsContent>

      <TabsContent value="details" className="mt-0 flex flex-col gap-4">
        {detailsSlot}
      </TabsContent>
    </Tabs>
  );
}
