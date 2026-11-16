import { requireUser } from '@/presentation/auth/session';
import { EmailChangeCard } from '@/presentation/components/profile/email-change-card';
import { PersonalInfoCard } from '@/presentation/components/profile/personal-info-card';
import { SignOutCard } from '@/presentation/components/profile/sign-out-card';
import { loadProfileSummary } from '@/presentation/queries/profile';

export default async function ProfileAccountPage() {
  const user = await requireUser('/profile');
  const summary = await loadProfileSummary(user);

  return (
    <>
      <PersonalInfoCard
        initialName={summary.user.name}
        initialPhone={summary.user.phone}
        isStoreOwner={summary.user.role === 'STORE_OWNER'}
      />
      <EmailChangeCard
        currentEmail={summary.user.email}
        emailVerified={summary.user.emailVerified}
      />
      <SignOutCard />
    </>
  );
}
