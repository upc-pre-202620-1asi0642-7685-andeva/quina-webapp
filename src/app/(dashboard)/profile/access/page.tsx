import { requireUser } from '@/presentation/auth/session';
import { RoleAccessCard } from '@/presentation/components/profile/role-access-card';
import { loadProfileSummary } from '@/presentation/queries/profile';

export default async function ProfileAccessPage() {
  const user = await requireUser('/profile/access');
  const summary = await loadProfileSummary(user);

  return <RoleAccessCard access={summary.access} />;
}
