import { redirect } from 'next/navigation';
import { getSessionUser } from '@/presentation/auth/session';
import { StoreRegistrationForm } from './store-form';

export default async function RegisterStorePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.emailVerified) {
    redirect(`/register/verify?email=${encodeURIComponent(user.email)}`);
  }
  if (user.role === 'STORE_OWNER' && user.storeId) {
    redirect('/');
  }

  return <StoreRegistrationForm ownerName={user.name} ownerEmail={user.email} />;
}
