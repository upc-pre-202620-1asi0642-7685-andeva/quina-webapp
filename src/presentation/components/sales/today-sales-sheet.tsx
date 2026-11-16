'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BanknoteIcon, HandCoinsIcon, ReceiptTextIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import type { TodayCounterSummary } from '@/infrastructure/db/queries/sales';
import { formatMoney, Money } from '@/presentation/components/money';
import { Button } from '@/presentation/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { useDragToClose } from '@/presentation/lib/use-drag-to-close';
import { cn } from '@/presentation/lib/utils';

const LIMA_TIME = new Intl.DateTimeFormat('es-PE', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Lima',
});

export function TodaySalesSheet({
  summary,
  onRepeatSale,
}: {
  summary: TodayCounterSummary;
  onRepeatSale: (items: { productId: string; quantity: string }[]) => void;
}) {
  const t = useTranslations('Sales');
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { dy, handlers } = useDragToClose(close);

  const totalCount = summary.cashBox.count + summary.creditCount;
  const combinedTotal = MoneyValue.of(summary.cashBox.total, 'PEN')
    .plus(MoneyValue.of(summary.creditTotal, 'PEN'))
    .toFixed2();

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="shrink-0 gap-2 transition-[transform,color,background-color] duration-150 ease-(--ease-out-expo) active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <ReceiptTextIcon aria-hidden="true" className="size-5 text-ink-soft" />
        <span>
          {totalCount > 0
            ? t('todaySales.buttonCount', { count: totalCount })
            : t('todaySales.button')}
        </span>
        {totalCount > 0 ? (
          <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-soft-ink tabular-nums">
            <Money amount={combinedTotal} currency="PEN" />
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          // DESIGN.md §7.3: hoja inferior en celular y diálogo centrado en escritorio
          className="max-h-[88dvh] gap-0 overflow-hidden rounded-t-sheet border-line bg-surface p-0 pb-[max(1rem,env(safe-area-inset-bottom))] ease-(--ease-out-expo) data-[state=closed]:duration-150 data-[state=open]:duration-250 lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-h-[82dvh] lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:border lg:pb-0 lg:shadow-float"
          style={{
            transform: dy ? `translateY(${dy}px)` : undefined,
            transition: dy ? 'none' : undefined,
          }}
        >
          <div
            {...handlers}
            className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 border-b border-line px-4 pt-3 pb-3 lg:cursor-default"
          >
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line lg:hidden" />
            <div className="flex w-full items-center justify-between gap-2">
              <SheetTitle className="text-lg font-semibold text-ink">
                {t('todaySales.title')}
              </SheetTitle>
              <Button type="button" variant="ghost" size="icon" onClick={close}>
                <XIcon aria-hidden="true" />
                <span className="sr-only">{t('todaySales.close')}</span>
              </Button>
            </div>
            <SheetDescription className="sr-only">{t('todaySales.description')}</SheetDescription>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
                  <BanknoteIcon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{t('todaySales.cashBoxTitle')}</span>
                </span>
                <Money
                  amount={summary.cashBox.total}
                  currency="PEN"
                  className="text-xl font-bold text-ink tabular-nums"
                />
                <span className="text-[13px] text-ink-soft tabular-nums">
                  {t('todaySales.cashSalesCount', { count: summary.cashBox.count })}
                </span>
              </div>

              <div className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
                  <HandCoinsIcon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{t('todaySales.creditBoxTitle')}</span>
                </span>
                <Money
                  amount={summary.creditTotal}
                  currency="PEN"
                  className="text-xl font-bold text-ink tabular-nums"
                />
                <span className="text-[13px] text-ink-soft tabular-nums">
                  {t('todaySales.creditSalesCount', { count: summary.creditCount })}
                </span>
              </div>
            </div>

            {summary.cashBox.count > 0 ? (
              <dl className="grid grid-cols-2 gap-2 rounded-card border border-line bg-paper p-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
                {summary.cashBox.byMethod.map((row) => (
                  <div
                    key={row.method}
                    className="flex items-baseline justify-between gap-2 rounded-field bg-surface px-2.5 py-1.5"
                  >
                    <dt className="text-[13px] text-ink-soft">{t(`methods.${row.method}`)}</dt>
                    <dd className="text-[13px] font-semibold text-ink tabular-nums">
                      <Money amount={row.total} currency="PEN" />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-ink">{t('todaySales.recentTitle')}</h3>
              {summary.sales.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-paper px-6 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-soft text-soft-ink">
                    <ReceiptTextIcon aria-hidden="true" className="size-6" />
                  </span>
                  <p className="text-base font-semibold text-ink">{t('todaySales.emptyTitle')}</p>
                  <p className="max-w-xs text-sm text-ink-soft">{t('todaySales.empty')}</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {summary.sales.map((sale) => {
                    const isCredit = sale.saleModality !== 'CASH';
                    const badgeLabel =
                      sale.saleModality === 'INSTALLMENTS_CREDIT'
                        ? t('todaySales.creditInstallments')
                        : sale.saleModality === 'SINGLE_PAYMENT_CREDIT'
                          ? t('todaySales.creditSingle')
                          : t(`methods.${sale.paymentMethod as 'CASH' | 'YAPE' | 'PLIN' | 'CARD'}`);
                    return (
                      <li
                        key={sale.id}
                        className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-sm font-semibold text-ink">
                              {sale.customerName ?? t('todaySales.walkIn')}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft tabular-nums">
                              <span>{LIMA_TIME.format(new Date(sale.saleDate))}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-xs font-medium',
                                  isCredit
                                    ? 'bg-soft text-soft-ink'
                                    : 'bg-paper-deep text-ink-soft',
                                )}
                              >
                                {badgeLabel}
                              </span>
                              {sale.changeGiven &&
                              MoneyValue.of(sale.changeGiven, 'PEN').isPositive() ? (
                                <span>
                                  ·{' '}
                                  {t('todaySales.changeGiven', {
                                    amount: formatMoney(sale.changeGiven, 'PEN'),
                                  })}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <Money
                            amount={sale.totalAmount}
                            currency="PEN"
                            className="shrink-0 text-base font-bold text-ink tabular-nums"
                          />
                        </div>

                        {sale.items.length > 0 ? (
                          <ul className="flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
                            {sale.items.map((item) => (
                              <li
                                key={item.productId}
                                className="flex items-baseline justify-between gap-2 text-ink-soft"
                              >
                                <span className="truncate">
                                  <strong className="font-medium text-ink tabular-nums">
                                    {formatQuantity(item.quantity)} {item.unitCode}
                                  </strong>{' '}
                                  · {item.productName}
                                </span>
                                <Money
                                  amount={item.subtotal}
                                  currency="PEN"
                                  className="shrink-0 text-ink tabular-nums"
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {sale.items.length > 0 ? (
                          <div className="flex justify-end pt-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                onRepeatSale(
                                  sale.items.map((i) => ({
                                    productId: i.productId,
                                    quantity: formatQuantity(i.quantity),
                                  })),
                                );
                                close();
                              }}
                              className="transition-transform duration-150 ease-(--ease-out-expo) active:scale-[0.97]"
                            >
                              <RotateCcwIcon aria-hidden="true" className="size-4" />
                              {t('todaySales.repeatSale')}
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
