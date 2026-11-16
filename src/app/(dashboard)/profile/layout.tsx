import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/presentation/auth/session';
import { ProfileShell } from '@/presentation/components/profile/profile-shell';
import { loadProfileSummary } from '@/presentation/queries/profile';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/profile');
  const [summary, tPlatform] = await Promise.all([
    loadProfileSummary(user),
    getTranslations('Platform'),
  ]);

  const contextLabel =
    summary.access.kind === 'owner' || summary.access.kind === 'employee'
      ? summary.access.storeName
      : tPlatform('shellName');

  return (
    <ProfileShell user={summary.user} contextLabel={contextLabel}>
      {children}
    </ProfileShell>
  );
}
