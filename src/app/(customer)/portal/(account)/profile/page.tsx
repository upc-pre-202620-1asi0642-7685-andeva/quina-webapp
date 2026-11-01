import { headers } from 'next/headers';
import { ProfileView } from '@/app/(dashboard)/profile/profile-view';
import { getAuth } from '@/infrastructure/auth/auth';
import { requirePortalUser } from '@/presentation/auth/guards';

/** US14.5: idioma, contraseña opcional y salir, sin el marco del comerciante. */
export default async function PortalProfilePage() {
  const { user } = await requirePortalUser('/portal/profile');
  const accounts = await getAuth().api.listUserAccounts({ headers: await headers() });
  const hasPassword = accounts.some((account) => account.providerId === 'credential');
  return (
    <ProfileView
      currentEmail={user.email}
      currentLocale={user.preferredLocale}
      hasPassword={hasPassword}
      variant="portal"
    />
  );
}
