'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { locales, type Locale } from '@/core/domain/shared/locale';
import { db } from '@/infrastructure/db/connection';
import { users } from '@/infrastructure/db/schema';
import { getSessionUser } from '@/presentation/auth/session';
import { LOCALE_COOKIE } from '@/presentation/i18n/resolve-locale';

const localeSchema = z.enum(locales);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setLocaleAction(
  rawLocale: string,
): Promise<{ ok: boolean; locale?: Locale }> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const parsed = localeSchema.safeParse(rawLocale);
  if (!parsed.success) return { ok: false };

  const locale = parsed.data;
  await db
    .update(users)
    .set({ preferredLocale: locale, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  });

  revalidatePath('/', 'layout');
  return { ok: true, locale };
}
