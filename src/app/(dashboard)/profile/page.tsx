import { requireOwner } from '@/presentation/auth/session';
import { ProfileView } from './profile-view';

export default async function ProfilePage() {
  const user = await requireOwner();
  return <ProfileView currentEmail={user.email} currentLocale={user.preferredLocale} />;
}
