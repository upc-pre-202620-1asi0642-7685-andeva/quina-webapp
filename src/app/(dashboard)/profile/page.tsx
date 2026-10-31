import { headers } from 'next/headers';
import { getAuth } from '@/infrastructure/auth/auth';
import { requireUser } from '@/presentation/auth/session';
import { ProfileView } from './profile-view';

export default async function ProfilePage() {
  const user = await requireUser('/profile');
  // Quien entró solo con Google no tiene cuenta `credential` todavía
  const accounts = await getAuth().api.listUserAccounts({ headers: await headers() });
  const hasPassword = accounts.some((account) => account.providerId === 'credential');
  return (
    <ProfileView
      currentEmail={user.email}
      currentLocale={user.preferredLocale}
      hasPassword={hasPassword}
    />
  );
}
