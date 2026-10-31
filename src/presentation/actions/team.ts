'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CancelInviteUseCase,
  InviteEmployeeUseCase,
  ResendInviteUseCase,
  SetEmployeeActiveUseCase,
} from '@/core/application/team/manage-team';
import { DrizzleAccountSetupTokens } from '@/infrastructure/auth/account-setup';
import { DrizzleTeamRepository } from '@/infrastructure/db/repositories/drizzle-team-repository';
import { getNotificationMailer } from '@/infrastructure/email/auth-mailer-factory';
import { authorizeStore } from '@/presentation/auth/guards';
import { appUrl } from '@/presentation/lib/request-meta';
import { loadStoreContext } from '@/presentation/queries/store-context';

export type InviteFormState = {
  error?: 'nameInvalid' | 'emailInvalid' | 'emailTaken' | 'planLimit' | 'generic';
  /** Correo del último invitado, para el aviso de éxito. */
  invited?: string;
  mailFailed?: boolean;
};

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();
const INVITE_ERRORS = {
  NAME_INVALID: 'nameInvalid',
  EMAIL_INVALID: 'emailInvalid',
  EMAIL_TAKEN: 'emailTaken',
  PLAN_LIMIT_REACHED: 'planLimit',
} as const;

const tokens = () => new DrizzleAccountSetupTokens();

async function setupMail(storeId: string) {
  const store = await loadStoreContext(storeId);
  return {
    storeName: store.name,
    locale: store.defaultLocale,
    setupUrl: (token: string) => appUrl(`/auth/accept-invite?token=${token}`),
  };
}

/** US05: solo el dueño invita; el límite de usuarios lo vigila el repositorio (US26). */
export async function inviteEmployeeAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const user = await authorizeStore('team.manage');
  if (!user) return { error: 'generic' };

  const email = String(formData.get('email') ?? '');
  const result = await new InviteEmployeeUseCase(
    new DrizzleTeamRepository(),
    tokens(),
    getNotificationMailer(),
  ).execute({
    storeId: user.storeId,
    actorId: user.id,
    name: String(formData.get('name') ?? ''),
    email,
    now: new Date(),
    ...(await setupMail(user.storeId)),
  });
  if (!result.ok) return { error: INVITE_ERRORS[result.error] };
  revalidatePath('/team');
  return { invited: email.trim().toLowerCase(), mailFailed: !result.value.mailSent };
}

export async function resendInviteAction(userId: string): Promise<TeamActionResult> {
  const user = await authorizeStore('team.manage');
  if (!user || !idSchema.safeParse(userId).success) return { ok: false, error: 'generic' };
  const result = await new ResendInviteUseCase(
    new DrizzleTeamRepository(),
    tokens(),
    getNotificationMailer(),
  ).execute({
    storeId: user.storeId,
    actorId: user.id,
    userId,
    now: new Date(),
    ...(await setupMail(user.storeId)),
  });
  if (!result.ok)
    return { ok: false, error: result.error === 'MAIL_FAILED' ? 'mailFailed' : 'generic' };
  return { ok: true };
}

export async function cancelInviteAction(userId: string): Promise<TeamActionResult> {
  const user = await authorizeStore('team.manage');
  if (!user || !idSchema.safeParse(userId).success) return { ok: false, error: 'generic' };
  const result = await new CancelInviteUseCase(new DrizzleTeamRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    userId,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: 'generic' };
  revalidatePath('/team');
  return { ok: true };
}

export async function setEmployeeActiveAction(
  userId: string,
  active: boolean,
): Promise<TeamActionResult> {
  const user = await authorizeStore('team.manage');
  if (!user || !idSchema.safeParse(userId).success) return { ok: false, error: 'generic' };
  const result = await new SetEmployeeActiveUseCase(new DrizzleTeamRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    userId,
    active,
    now: new Date(),
  });
  if (!result.ok) {
    return { ok: false, error: result.error === 'PLAN_LIMIT_REACHED' ? 'planLimit' : 'generic' };
  }
  revalidatePath('/team');
  return { ok: true };
}
