import { cache } from 'react';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import type { Role } from '@/core/domain/identity/roles';
import type { Locale } from '@/core/domain/shared/locale';
import type { ThemeChoice } from '@/core/domain/shared/theme';
import { getAuth } from '@/infrastructure/auth/auth';
import { db } from '@/infrastructure/db/connection';
import { stores, users } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import type { SessionUser } from '@/presentation/auth/session';
import { isLocale } from '@/presentation/i18n/resolve-locale';
import { isThemeChoice } from '@/presentation/lib/resolve-theme';
import { parseUserAgent, type ParsedUserAgent } from '@/presentation/lib/user-agent';

export type ProfileAccountMethod = {
  id: string;
  providerId: string;
  createdAt: Date;
};

export type ProfileSessionItem = {
  id: string;
  token: string;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
  device: ParsedUserAgent;
};

export type OwnerStoreAccess = {
  kind: 'owner';
  storeName: string;
};

export type EmployeeStoreAccess = {
  kind: 'employee';
  storeName: string;
};

export type PlatformAdminAccess = {
  kind: 'platform';
};

export type CustomerPortalAccess = {
  kind: 'customer';
};

export type ProfileAccessContext =
  OwnerStoreAccess | EmployeeStoreAccess | PlatformAdminAccess | CustomerPortalAccess;

export type ProfileSummary = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    phone: string | null;
    image: string | null;
    role: Role;
    preferredLocale: Locale;
    preferredTheme: ThemeChoice;
    hasCustomDashboard: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
  };
  accounts: {
    hasPassword: boolean;
    hasGoogle: boolean;
    googleAccountId: string | null;
    googleEnabled: boolean;
    items: ProfileAccountMethod[];
  };
  sessions: ProfileSessionItem[];
  access: ProfileAccessContext;
};

/** Carga la vista consolidada del perfil respetando RBAC y sin exponer secretos entre roles. */
export const loadProfileSummary = cache(
  async (sessionUser: SessionUser): Promise<ProfileSummary> => {
    const reqHeaders = await headers();
    const auth = getAuth();

    const [[userRow], rawAccounts, rawSessions, currentSession] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          emailVerified: users.emailVerified,
          phone: users.phone,
          image: users.image,
          role: users.role,
          preferredLocale: users.preferredLocale,
          preferredTheme: users.preferredTheme,
          dashboardLayout: users.dashboardLayout,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.id, sessionUser.id)),
      auth.api.listUserAccounts({ headers: reqHeaders }),
      auth.api.listSessions({ headers: reqHeaders }).catch(() => []),
      auth.api.getSession({ headers: reqHeaders }).catch(() => null),
    ]);

    const currentToken = currentSession?.session?.token ?? null;
    const googleAccount = rawAccounts.find((account) => account.providerId === 'google');

    const sessions: ProfileSessionItem[] = rawSessions
      .map((session) => ({
        id: session.id,
        token: session.token,
        ipAddress: session.ipAddress ?? null,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        expiresAt: new Date(session.expiresAt),
        isCurrent: currentToken !== null && session.token === currentToken,
        device: parseUserAgent(session.userAgent),
      }))
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

    let access: ProfileAccessContext;
    if (
      (sessionUser.role === 'STORE_OWNER' || sessionUser.role === 'STORE_EMPLOYEE') &&
      sessionUser.storeId
    ) {
      const row = await withTenant(sessionUser.storeId, async (tx) => {
        const [found] = await tx
          .select({ commercialName: stores.commercialName })
          .from(stores)
          .where(eq(stores.id, sessionUser.storeId!));
        return found ?? null;
      });
      access = {
        kind: sessionUser.role === 'STORE_OWNER' ? 'owner' : 'employee',
        storeName: row?.commercialName ?? '',
      };
    } else if (sessionUser.role === 'PLATFORM_ADMIN') {
      access = { kind: 'platform' };
    } else {
      access = { kind: 'customer' };
    }

    return {
      user: {
        id: sessionUser.id,
        name: userRow?.name ?? sessionUser.name,
        email: userRow?.email ?? sessionUser.email,
        emailVerified: userRow?.emailVerified ?? sessionUser.emailVerified,
        phone: userRow?.phone ?? null,
        image: userRow?.image ?? null,
        role: sessionUser.role,
        preferredLocale: isLocale(userRow?.preferredLocale)
          ? userRow.preferredLocale
          : sessionUser.preferredLocale,
        preferredTheme: isThemeChoice(userRow?.preferredTheme)
          ? userRow.preferredTheme
          : sessionUser.preferredTheme,
        hasCustomDashboard: Boolean(userRow?.dashboardLayout),
        createdAt: userRow?.createdAt ? new Date(userRow.createdAt) : new Date(),
        lastLoginAt: userRow?.lastLoginAt ? new Date(userRow.lastLoginAt) : null,
      },
      accounts: {
        hasPassword: rawAccounts.some((account) => account.providerId === 'credential'),
        hasGoogle: Boolean(googleAccount),
        googleAccountId: googleAccount?.id ?? null,
        googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        items: rawAccounts.map((account) => ({
          id: account.id,
          providerId: account.providerId,
          createdAt: new Date(account.createdAt),
        })),
      },
      sessions,
      access,
    };
  },
);
