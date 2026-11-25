'use server';

import { revalidatePath } from 'next/cache';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { themeChoices, type ThemeChoice } from '@/core/domain/shared/theme';
import { db } from '@/infrastructure/db/connection';
import { users } from '@/infrastructure/db/schema';
import { getSessionUser } from '@/presentation/auth/session';

const themeSchema = z.enum(themeChoices);

export async function setThemeAction(
  rawTheme: string,
): Promise<{ ok: boolean; theme?: ThemeChoice }> {
  const user = await getSessionUser();
  if (!user) return actionRedirect('/login');

  const parsed = themeSchema.safeParse(rawTheme);
  if (!parsed.success) return { ok: false };

  const theme = parsed.data;
  await db
    .update(users)
    .set({ preferredTheme: theme, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidatePath('/', 'layout');
  return { ok: true, theme };
}
