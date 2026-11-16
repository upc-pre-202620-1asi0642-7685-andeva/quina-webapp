'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { cn } from '@/presentation/lib/utils';

type TabKey = 'cycles' | 'installments' | 'payments' | 'info';

export function CustomerDetailTabs({
  hasAccount,
  cyclesCount,
  installmentsCount,
  paymentsCount,
  cyclesSlot,
  installmentsSlot,
  paymentsSlot,
  infoSlot,
}: {
  hasAccount: boolean;
  cyclesCount: number;
  installmentsCount: number;
  paymentsCount: number;
  cyclesSlot: ReactNode;
  installmentsSlot: ReactNode;
  paymentsSlot: ReactNode;
  infoSlot: ReactNode;
}) {
  const t = useTranslations('Customers.detail');

  if (!hasAccount) {
    return <div className="flex flex-col gap-6">{infoSlot}</div>;
  }

  const tabs: { key: TabKey; count?: number }[] = [
    { key: 'cycles', count: cyclesCount },
    ...(installmentsCount > 0 ? [{ key: 'installments' as const, count: installmentsCount }] : []),
    { key: 'payments', count: paymentsCount },
    { key: 'info' },
  ];

  const triggerClass =
    'min-h-11 shrink-0 rounded-field px-3.5 text-sm font-medium text-ink-soft transition-[color,background-color,transform] duration-150 ease-(--ease-out-expo) hover:text-ink active:scale-[0.98] data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm';

  return (
    <Tabs defaultValue="cycles" className="flex flex-col gap-4">
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

      <TabsContent value="cycles" className="mt-0 flex flex-col gap-4">
        {cyclesSlot}
      </TabsContent>

      {installmentsCount > 0 ? (
        <TabsContent value="installments" className="mt-0 flex flex-col gap-4">
          {installmentsSlot}
        </TabsContent>
      ) : null}

      <TabsContent value="payments" className="mt-0 flex flex-col gap-4">
        {paymentsSlot}
      </TabsContent>

      <TabsContent value="info" className="mt-0 flex flex-col gap-4">
        {infoSlot}
      </TabsContent>
    </Tabs>
  );
}
