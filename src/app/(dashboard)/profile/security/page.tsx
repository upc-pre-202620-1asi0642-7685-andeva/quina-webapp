import { requireUser } from '@/presentation/auth/session';
import { ActiveSessionsCard } from '@/presentation/components/profile/active-sessions-card';
import { ConnectedAccountsCard } from '@/presentation/components/profile/connected-accounts-card';
import { OfflineSafetyCard } from '@/presentation/components/profile/offline-safety-card';
import { PasswordCard } from '@/presentation/components/profile/password-card';
import { loadProfileSummary } from '@/presentation/queries/profile';

export default async function ProfileSecurityPage() {
  const user = await requireUser('/profile/security');
  const summary = await loadProfileSummary(user);

  return (
    <>
      <PasswordCard hasPassword={summary.accounts.hasPassword} />
      <ConnectedAccountsCard
        hasPassword={summary.accounts.hasPassword}
        hasGoogle={summary.accounts.hasGoogle}
        googleAccountId={summary.accounts.googleAccountId}
        googleEnabled={summary.accounts.googleEnabled}
      />
      <ActiveSessionsCard sessions={summary.sessions} />
      <OfflineSafetyCard />
    </>
  );
}
