import { getTranslations } from 'next-intl/server';
import { requirePlatformAdmin } from '@/presentation/auth/guards';
import { AppShell } from '@/presentation/components/shell/app-shell';

export const dynamic = 'force-dynamic';

/** Panel del Administrador de Plataforma (US01): el mismo marco, con sus propias secciones. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin('/platform');
  const t = await getTranslations('Platform');
  return (
    <AppShell
      user={{ name: admin.name, role: admin.role }}
      store={{ name: t('shellName'), trialEndsAt: null }}
    >
      {children}
    </AppShell>
  );
}
