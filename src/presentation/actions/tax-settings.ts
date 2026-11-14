'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { RUS_CATEGORIES, TAX_REGIMES } from '@/core/domain/tax/rus';
import { saveTaxSettings } from '@/infrastructure/db/repositories/drizzle-tax-settings-repository';
import { authorizeStore } from '@/presentation/auth/guards';
import { actionRedirect } from '@/presentation/lib/action-redirect';

export type TaxSettingsState = { saved?: boolean; error?: 'generic' };

const schema = z.object({
  taxRegime: z.enum(TAX_REGIMES),
  rusCategory: z.coerce.number().pipe(z.literal(RUS_CATEGORIES)),
});

/** US21 crit. 1: solo el dueño elige el régimen y la categoría del Nuevo RUS. */
export async function saveTaxSettingsAction(
  _prev: TaxSettingsState,
  formData: FormData,
): Promise<TaxSettingsState> {
  const user = await authorizeStore('rus.view', { allowWhenReadOnly: true });
  if (!user) return actionRedirect('/login');
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'generic' };

  try {
    await saveTaxSettings({
      storeId: user.storeId,
      actorId: user.id,
      taxRegime: parsed.data.taxRegime,
      rusCategory: parsed.data.rusCategory,
    });
  } catch (error) {
    console.error('[settings] no se pudo guardar el régimen tributario', error);
    return { error: 'generic' };
  }
  revalidatePath('/settings');
  revalidatePath('/');
  return { saved: true };
}
