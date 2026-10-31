'use server';

import { headers } from 'next/headers';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { RegisterStoreUseCase } from '@/core/application/identity/register-store';
import { DrizzleStoreRegistrationRepository } from '@/infrastructure/db/repositories/drizzle-store-registration-repository';
import { getSessionUser } from '@/presentation/auth/session';
import { storeSchema } from '@/presentation/validation/auth-schemas';

export type RegisterStoreActionState = {
  fieldErrors?: Partial<Record<'commercialName' | 'businessTurn' | 'taxId', string>>;
  formError?: string;
};

export async function completeStoreAction(
  _prev: RegisterStoreActionState,
  formData: FormData,
): Promise<RegisterStoreActionState> {
  const user = await getSessionUser();
  if (!user) return actionRedirect('/login');
  if (!user.emailVerified) return actionRedirect('/register/verify');
  if (user.role === 'STORE_OWNER' && user.storeId) return actionRedirect('/');
  if (user.role !== 'PENDING_OWNER') {
    return { formError: 'generic' };
  }

  const parsed = storeSchema.safeParse({
    commercialName: String(formData.get('commercialName') ?? ''),
    businessTurn: String(formData.get('businessTurn') ?? ''),
    taxId: String(formData.get('taxId') ?? ''),
  });

  if (!parsed.success) {
    const fieldErrors: RegisterStoreActionState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'commercialName' || field === 'businessTurn' || field === 'taxId') {
        fieldErrors[field] ??= issue.message;
      }
    }
    return { fieldErrors };
  }

  const reqHeaders = await headers();
  const forwarded = reqHeaders.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]?.trim() : undefined;
  const userAgent = reqHeaders.get('user-agent') ?? undefined;

  const useCase = new RegisterStoreUseCase(new DrizzleStoreRegistrationRepository());
  const result = await useCase.execute({
    userId: user.id,
    commercialName: parsed.data.commercialName,
    businessTurn: parsed.data.businessTurn,
    taxId: parsed.data.taxId,
    ownerFullName: user.name,
    contactEmail: user.email,
    ip,
    userAgent,
    now: new Date(),
  });

  if (!result.ok) {
    if (result.error === 'TAX_ID_INVALID') {
      return { fieldErrors: { taxId: 'taxIdInvalid' } };
    }
    if (result.error === 'TAX_ID_TAKEN') {
      return { fieldErrors: { taxId: 'taxIdTaken' } };
    }
    if (result.error === 'EMAIL_TAKEN') {
      return { formError: 'emailTaken' };
    }
    return { formError: 'generic' };
  }

  return actionRedirect('/');
}
