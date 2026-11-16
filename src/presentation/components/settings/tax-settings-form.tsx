'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon, IdCardIcon } from 'lucide-react';
import {
  RUS_CATEGORIES,
  TAX_REGIMES,
  type RusCategory,
  type TaxRegime,
  type TaxSettings,
} from '@/core/domain/tax/rus';
import type { RusStatus, StoreTaxContext } from '@/infrastructure/db/queries/tax';
import { saveTaxSettingsAction } from '@/presentation/actions/tax-settings';
import { FormField } from '@/presentation/components/auth/form-field';
import { useActionToast } from '@/presentation/components/feedback/use-action-toast';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { formatMoney } from '@/presentation/components/money';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

/** US21 crit. 1: el dueño elige su régimen y, en el Nuevo RUS, su categoría. */
export function TaxSettingsForm({
  initial,
  taxContext,
  rusStatus,
}: {
  initial: TaxSettings;
  taxContext: StoreTaxContext;
  rusStatus: RusStatus | null;
}) {
  const t = useTranslations('Settings.tax');
  const [state, formAction, pending] = useActionState(saveTaxSettingsAction, {});
  const [regime, setRegime] = useState<TaxRegime>(initial.taxRegime);
  const [category, setCategory] = useState<RusCategory>(initial.rusCategory);
  const [prevInitial, setPrevInitial] = useState(initial);

  if (
    initial.taxRegime !== prevInitial.taxRegime ||
    initial.rusCategory !== prevInitial.rusCategory
  ) {
    setPrevInitial(initial);
    setRegime(initial.taxRegime);
    setCategory(initial.rusCategory);
  }

  useActionToast(
    state,
    state.saved
      ? { type: 'success', title: t('saved') }
      : state.error
        ? { type: 'error', title: t('error') }
        : null,
  );

  const isDirty =
    regime !== initial.taxRegime || (regime === 'NUEVO_RUS' && category !== initial.rusCategory);

  function handleDiscard() {
    setRegime(initial.taxRegime);
    setCategory(initial.rusCategory);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-paper-deep px-3 py-1 text-[13px] font-medium text-ink tabular-nums">
        <IdCardIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
        <span>
          {t('taxIdPill', { type: taxContext.taxIdType, number: taxContext.taxIdNumber })}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="tax-regime" label={t('regime')} hint={t('regimeHint')}>
          {(props) => (
            <NativeSelect
              {...props}
              name="taxRegime"
              value={regime}
              onChange={(e) => setRegime(e.target.value as TaxRegime)}
            >
              {TAX_REGIMES.map((value) => (
                <option key={value} value={value}>
                  {t(`regimes.${value}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        {regime === 'NUEVO_RUS' ? (
          <FormField id="tax-category" label={t('category')} hint={t('categoryHint')}>
            {(props) => (
              <NativeSelect
                {...props}
                name="rusCategory"
                value={String(category)}
                onChange={(e) => setCategory(Number(e.target.value) as RusCategory)}
              >
                {RUS_CATEGORIES.map((value) => (
                  <option key={value} value={String(value)}>
                    {t('categoryOption', { category: value })}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        ) : (
          // Fuera del Nuevo RUS la categoría no se usa: se conserva la que tenía
          <input type="hidden" name="rusCategory" value={initial.rusCategory} />
        )}
      </div>

      {regime === 'NUEVO_RUS' ? (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-field border border-line bg-paper">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-[13px]">
              <span className="font-semibold text-ink">{t('comparison.title')}</span>
              {rusStatus ? (
                <span className="text-ink-soft tabular-nums">
                  {t('comparison.monthSummary', {
                    sales: formatMoney(rusStatus.sales, 'PEN'),
                    purchases: formatMoney(rusStatus.purchases, 'PEN'),
                  })}
                </span>
              ) : null}
            </div>

            <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {RUS_CATEGORIES.map((cat) => {
                const caps = taxContext.rusCaps[cat];
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer flex-col gap-2 p-4 text-left transition-colors duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link-active motion-reduce:transition-none',
                      isSelected ? 'bg-soft/50' : 'hover:bg-surface-hover/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {t('categoryOption', { category: cat })}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-xs font-medium text-soft-ink">
                          <CheckIcon aria-hidden="true" className="size-3.5" />
                          {t('comparison.selected')}
                        </span>
                      ) : null}
                    </div>

                    {caps ? (
                      <dl className="grid grid-cols-2 gap-3 text-[13px]">
                        <div className="flex flex-col">
                          <dt className="text-ink-soft">{t('comparison.incomeLabel')}</dt>
                          <dd className="font-semibold text-ink tabular-nums">
                            {formatMoney(caps.income, 'PEN')}
                          </dd>
                        </div>
                        <div className="flex flex-col">
                          <dt className="text-ink-soft">{t('comparison.purchasesLabel')}</dt>
                          <dd className="font-semibold text-ink tabular-nums">
                            {formatMoney(caps.purchases, 'PEN')}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-[13px] text-ink-soft">{t('comparison.noCap')}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[13px] text-ink-soft">{t('disclaimer')}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-start">
        <Button
          type="submit"
          variant={isDirty ? 'primary' : 'secondary'}
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? t('submitting') : t('submit')}
        </Button>
        {isDirty ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscard}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {t('discard')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
