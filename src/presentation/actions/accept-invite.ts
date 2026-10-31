'use server';

import { redeemAccountSetup } from '@/infrastructure/auth/account-setup';
import { getAuth } from '@/infrastructure/auth/auth';
import { requestMeta } from '@/presentation/lib/request-meta';

export type AcceptInviteState = {
  done?: boolean;
  error?: 'passwordWeak' | 'invalid';
};

/** Ruta pública: el enlace de un solo uso es la única credencial. */
export async function acceptInviteAction(
  token: string,
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const password = String(formData.get('password') ?? '');
  const result = await redeemAccountSetup(
    { auth: getAuth() },
    { token, password, now: new Date(), ...(await requestMeta()) },
  );
  if (result === 'PASSWORD_WEAK') return { error: 'passwordWeak' };
  if (result === 'INVALID') return { error: 'invalid' };
  return { done: true };
}
