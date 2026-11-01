'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/infrastructure/auth/auth';
import { setOwnPassword } from '@/infrastructure/auth/set-password';
import { db } from '@/infrastructure/db/connection';
import { getSessionUser } from '@/presentation/auth/session';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { setPasswordSchema } from '@/presentation/validation/auth-schemas';

export type SetPasswordActionState = {
  ok?: boolean;
  fieldErrors?: Partial<Record<'password' | 'confirmPassword', string>>;
  formError?: string;
};

export async function setPasswordAction(
  _prev: SetPasswordActionState,
  formData: FormData,
): Promise<SetPasswordActionState> {
  // Dueño, empleado o vecino desde su portal (US14.5): basta una sesión verificada
  const user = await getSessionUser();
  if (!user?.emailVerified) return actionRedirect('/login');

  const parsed = setPasswordSchema.safeParse({
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: SetPasswordActionState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'password' || field === 'confirmPassword') {
        fieldErrors[field] ??= issue.message;
      }
    }
    return { fieldErrors };
  }

  const reqHeaders = await headers();
  const forwarded = reqHeaders.get('x-forwarded-for');
  const result = await setOwnPassword(
    { auth: getAuth(), db },
    {
      headers: reqHeaders,
      newPassword: parsed.data.password,
      userId: user.id,
      storeId: user.storeId,
      ip: forwarded ? forwarded.split(',')[0]?.trim() : undefined,
      userAgent: reqHeaders.get('user-agent') ?? undefined,
    },
  );

  if (result === 'PASSWORD_ALREADY_SET') return { formError: 'passwordAlreadySet' };
  return { ok: true };
}
