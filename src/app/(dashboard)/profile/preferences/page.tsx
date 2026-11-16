import { requireUser } from '@/presentation/auth/session';
import { LocaleSelectorCard } from '@/presentation/components/profile/locale-selector-card';
import { ThemeSelectorCard } from '@/presentation/components/profile/theme-selector-card';
import { WorkspacePreferencesCard } from '@/presentation/components/profile/workspace-preferences-card';
import { loadProfileSummary } from '@/presentation/queries/profile';

export default async function ProfilePreferencesPage() {
  const user = await requireUser('/profile/preferences');
  const summary = await loadProfileSummary(user);
  const canCustomizeDashboard =
    summary.user.role === 'STORE_OWNER' || summary.user.role === 'STORE_EMPLOYEE';

  return (
    <>
      <ThemeSelectorCard />
      <LocaleSelectorCard currentLocale={summary.user.preferredLocale} />
      {canCustomizeDashboard ? (
        <WorkspacePreferencesCard hasCustomDashboard={summary.user.hasCustomDashboard} />
      ) : null}
    </>
  );
}
