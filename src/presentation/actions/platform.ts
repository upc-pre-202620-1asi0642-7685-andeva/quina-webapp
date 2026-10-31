'use server';

import { revalidatePath } from 'next/cache';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { z } from 'zod';
import {
  AddRateCapUseCase,
  CreateStoreUseCase,
  ResendOwnerLinkUseCase,
  SetStoreActiveUseCase,
  type AddRateCapError,
  type CreateStoreError,
} from '@/core/application/platform/manage-platform';
import { locales } from '@/core/domain/shared/locale';
import { DrizzleAccountSetupTokens } from '@/infrastructure/auth/account-setup';
import { DrizzlePlatformStoreRepository } from '@/infrastructure/db/repositories/drizzle-platform-store-repository';
import { DrizzleRateCapRepository } from '@/infrastructure/db/repositories/drizzle-rate-cap-repository';
import { getNotificationMailer } from '@/infrastructure/email/auth-mailer-factory';
import { authorizePlatform } from '@/presentation/auth/guards';
import { appUrl } from '@/presentation/lib/request-meta';
import { BUSINESS_TURNS } from '@/presentation/validation/auth-schemas';

export type PlatformFormState<E extends string> = { error?: E | 'generic' };
export type PlatformActionResult = { ok: true } | { ok: false; error: string };

const setupUrl = (token: string) => appUrl(`/auth/accept-invite?token=${token}`);
const idSchema = z.uuid();

const storeSchema = z.object({
  commercialName: z.string(),
  businessTurn: z.enum(BUSINESS_TURNS),
  taxId: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  locale: z.enum(locales),
});

/** US01: solo el Administrador de Plataforma crea tiendas. */
export async function createStoreAction(
  _prev: PlatformFormState<CreateStoreError>,
  formData: FormData,
): Promise<PlatformFormState<CreateStoreError>> {
  const admin = await authorizePlatform();
  if (!admin) return actionRedirect('/login');
  const parsed = storeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'generic' };

  const result = await new CreateStoreUseCase(
    new DrizzlePlatformStoreRepository(),
    new DrizzleAccountSetupTokens(),
    getNotificationMailer(),
  ).execute({ ...parsed.data, adminId: admin.id, setupUrl, now: new Date() });
  if (!result.ok) return { error: result.error };
  revalidatePath('/platform/stores');
  return actionRedirect(
    `/platform/stores/${result.value.storeId}?notice=${result.value.mailSent ? 'created' : 'createdNoMail'}`,
  );
}

export async function setStoreActiveAction(
  storeId: string,
  active: boolean,
): Promise<PlatformActionResult> {
  const admin = await authorizePlatform();
  if (!admin || !idSchema.safeParse(storeId).success) return { ok: false, error: 'generic' };
  const result = await new SetStoreActiveUseCase(new DrizzlePlatformStoreRepository()).execute({
    adminId: admin.id,
    storeId,
    active,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: 'generic' };
  revalidatePath('/platform/stores');
  revalidatePath(`/platform/stores/${storeId}`);
  return { ok: true };
}

export async function resendOwnerLinkAction(storeId: string): Promise<PlatformActionResult> {
  const admin = await authorizePlatform();
  if (!admin || !idSchema.safeParse(storeId).success) return { ok: false, error: 'generic' };
  const result = await new ResendOwnerLinkUseCase(
    new DrizzlePlatformStoreRepository(),
    new DrizzleAccountSetupTokens(),
    getNotificationMailer(),
  ).execute({ storeId, setupUrl, now: new Date() });
  if (!result.ok)
    return { ok: false, error: result.error === 'MAIL_FAILED' ? 'mailFailed' : 'generic' };
  return { ok: true };
}

const capSchema = z.object({
  kind: z.enum(['COMPENSATORY', 'MORATORY']),
  currency: z.enum(['PEN', 'USD']),
  percent: z.string(),
  validFrom: z.string(),
  source: z.string(),
});

/** Decisión 4: nueva vigencia de un tope del BCRP. */
export async function addRateCapAction(
  _prev: PlatformFormState<AddRateCapError> & { saved?: boolean },
  formData: FormData,
): Promise<PlatformFormState<AddRateCapError> & { saved?: boolean }> {
  const admin = await authorizePlatform();
  if (!admin) return actionRedirect('/login');
  const parsed = capSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'generic' };
  const result = await new AddRateCapUseCase(new DrizzleRateCapRepository()).execute({
    ...parsed.data,
    adminId: admin.id,
    now: new Date(),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath('/platform/rate-caps');
  return { saved: true };
}
