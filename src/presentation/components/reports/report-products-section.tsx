'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PackageIcon } from 'lucide-react';
import type { CategorySalesRow, ProductSalesRow } from '@/core/domain/analytics/report';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { PeriodSegmentedControl } from '@/presentation/components/dashboard/chart-primitives';
import { Money } from '@/presentation/components/money';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { cn } from '@/presentation/lib/utils';

function marginPercent(revenue: string, margin: string): number {
  const rev = MoneyValue.of(revenue, 'PEN');
  if (!rev.isPositive()) return 0;
  return MoneyValue.of(margin, 'PEN')
    .decimal()
    .dividedBy(rev.decimal())
    .times(100)
    .toDecimalPlaces(1)
    .toNumber();
}

function MarginBadge({ revenue, margin }: { revenue: string; margin: string }) {
  const m = MoneyValue.of(margin, 'PEN');
  const pct = marginPercent(revenue, margin);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        m.isNegative()
          ? 'bg-error/12 text-error-ink'
          : m.isPositive()
            ? 'bg-soft text-soft-ink'
            : 'bg-paper-deep text-ink-soft',
      )}
    >
      {pct} %
    </span>
  );
}

/** Top 10 productos más vendidos y desglose por categoría en el período. */
export function ReportProductsSection({
  topProducts,
  byCategory,
}: {
  topProducts: ProductSalesRow[];
  byCategory: CategorySalesRow[];
}) {
  const t = useTranslations('Reports.products');
  const [tab, setTab] = useState<'products' | 'categories'>('products');

  const isEmpty = tab === 'products' ? topProducts.length === 0 : byCategory.length === 0;

  return (
    <section
      aria-labelledby="report-products-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 print:break-inside-avoid"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="report-products-title" className="text-lg font-semibold text-ink">
            {tab === 'products' ? t('titleProducts') : t('titleCategories')}
          </h2>
          <p className="text-sm text-ink-soft">
            {tab === 'products' ? t('subtitleProducts') : t('subtitleCategories')}
          </p>
        </div>

        <PeriodSegmentedControl
          ariaLabel={t('viewAria')}
          value={tab}
          onChange={setTab}
          className="print:hidden"
          options={[
            { value: 'products', label: t('tabs.products') },
            { value: 'categories', label: t('tabs.categories') },
          ]}
        />
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 rounded-field bg-paper-deep px-4 py-8 text-center">
          <PackageIcon aria-hidden="true" className="size-7 text-ink-soft" />
          <p className="text-sm text-ink-soft">{t('empty')}</p>
        </div>
      ) : tab === 'products' ? (
        <>
          {/* Celular: tarjetas táctiles */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {topProducts.map((row) => (
              <li
                key={row.productId}
                className="flex flex-col gap-2.5 rounded-field border border-line bg-paper p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                    <p className="text-xs text-ink-soft tabular-nums">
                      {row.categoryName ?? t('uncategorized')} · {formatQuantity(row.quantitySold)}{' '}
                      {row.unitCode}
                    </p>
                  </div>
                  <MarginBadge revenue={row.revenue} margin={row.margin} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-soft">{t('columns.revenue')}</dt>
                    <dd className="font-semibold text-ink">
                      <Money amount={row.revenue} currency="PEN" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">{t('columns.cost')}</dt>
                    <dd className="font-medium text-ink-soft">
                      <Money amount={row.cost} currency="PEN" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">{t('columns.margin')}</dt>
                    <dd className="font-semibold text-success-ink">
                      <Money amount={row.margin} currency="PEN" />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla con encabezado fijo */}
          <div className="hidden max-h-104 overflow-auto rounded-field border border-line lg:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-deep text-left text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('columns.product')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.quantity')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.revenue')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.cost')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.margin')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row) => (
                  <tr key={row.productId} className="border-t border-line hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{row.name}</span>
                        <span className="text-[13px] text-ink-soft">
                          {row.categoryName ?? t('uncategorized')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">
                      {formatQuantity(row.quantitySold)} {row.unitCode}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      <Money amount={row.revenue} currency="PEN" />
                    </td>
                    <td className="px-4 py-3 text-right text-ink-soft">
                      <Money amount={row.cost} currency="PEN" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Money
                          amount={row.margin}
                          currency="PEN"
                          className="font-medium text-ink"
                        />
                        <MarginBadge revenue={row.revenue} margin={row.margin} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Celular: tarjetas de categorías */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {byCategory.map((row) => (
              <li
                key={row.categoryId ?? '__uncategorized__'}
                className="flex flex-col gap-2.5 rounded-field border border-line bg-paper p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {row.categoryName ?? t('uncategorized')}
                    </p>
                    <p className="text-xs text-ink-soft tabular-nums">
                      {t('productsCount', { count: row.productsCount })} ·{' '}
                      {t('unitsSold', { qty: formatQuantity(row.unitsSold) })}
                    </p>
                  </div>
                  <MarginBadge revenue={row.revenue} margin={row.margin} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-soft">{t('columns.revenue')}</dt>
                    <dd className="font-semibold text-ink">
                      <Money amount={row.revenue} currency="PEN" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">{t('columns.cost')}</dt>
                    <dd className="font-medium text-ink-soft">
                      <Money amount={row.cost} currency="PEN" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">{t('columns.margin')}</dt>
                    <dd className="font-semibold text-success-ink">
                      <Money amount={row.margin} currency="PEN" />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla de categorías */}
          <div className="hidden max-h-104 overflow-auto rounded-field border border-line lg:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-deep text-left text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('columns.category')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.products')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.units')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.revenue')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.cost')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('columns.margin')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((row) => (
                  <tr
                    key={row.categoryId ?? '__uncategorized__'}
                    className="border-t border-line hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.categoryName ?? t('uncategorized')}
                    </td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">
                      {row.productsCount}
                    </td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">
                      {formatQuantity(row.unitsSold)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      <Money amount={row.revenue} currency="PEN" />
                    </td>
                    <td className="px-4 py-3 text-right text-ink-soft">
                      <Money amount={row.cost} currency="PEN" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Money
                          amount={row.margin}
                          currency="PEN"
                          className="font-medium text-ink"
                        />
                        <MarginBadge revenue={row.revenue} margin={row.margin} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
