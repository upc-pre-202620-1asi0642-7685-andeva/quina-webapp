'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  RUS_CATEGORIES,
  TAX_REGIMES,
  type TaxRegime,
  type TaxSettings,
} from '@/core/domain/tax/rus';
import { saveTaxSettingsAction } from '@/presentation/actions/tax-settings';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';

/** US21 crit. 1: el dueño elige su régimen y, en el Nuevo RUS, su categoría. */
export function TaxSettingsForm({ initial }: { initial: TaxSettings }) {
  const t = useTranslations('Settings.tax');
  const [state, formAction, pending] = useActionState(saveTaxSettingsAction, {});
  const [regime, setRegime] = useState<TaxRegime>(initial.taxRegime);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.saved ? (
        <Notice tone="success">
          <p>{t('saved')}</p>
        </Notice>
      ) : null}
      {state.error ? (
        <Notice tone="error">
          <p>{t('error')}</p>
        </Notice>
      ) : null}

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
              <NativeSelect {...props} name="rusCategory" defaultValue={initial.rusCategory}>
                {RUS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t('categoryOption', { category })}
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

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
