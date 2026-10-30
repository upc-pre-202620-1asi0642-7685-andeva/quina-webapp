import { redirect } from 'next/navigation';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { RegisterForm } from './register-form';

export default async function RegisterPage() {
  const user = await getSessionUser();
  const target = nextRouteFor(user, '/register');
  if (target) redirect(target);

  return <RegisterForm />;
}
