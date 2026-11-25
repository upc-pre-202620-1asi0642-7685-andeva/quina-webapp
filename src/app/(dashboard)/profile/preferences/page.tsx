import { requireUser } from '@/presentation/auth/session';
import { LocaleSelectorCard } from '@/presentation/components/profile/locale-selector-card';
import { PushNotificationsCard } from '@/presentation/components/profile/push-notifications-card';
import { ThemeSelectorCard } from '@/presentation/components/profile/theme-selector-card';
import { WorkspacePreferencesCard } from '@/presentation/components/profile/workspace-preferences-card';
import { loadProfileSummary } from '@/presentation/queries/profile';

export default async function ProfilePreferencesPage() {
  const user = await requireUser('/profile/preferences');
  const summary = await loadProfileSummary(user);
  const isStoreUser = summary.user.role === 'STORE_OWNER' || summary.user.role === 'STORE_EMPLOYEE';

  return (
    <>
      <ThemeSelectorCard />
      <LocaleSelectorCard currentLocale={summary.user.preferredLocale} />
      {isStoreUser ? <PushNotificationsCard /> : null}
      {isStoreUser ? (
        <WorkspacePreferencesCard hasCustomDashboard={summary.user.hasCustomDashboard} />
      ) : null}
    </>
  );
}
