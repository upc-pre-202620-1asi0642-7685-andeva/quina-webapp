import { redirect } from 'next/navigation';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const user = await getSessionUser();
  const target = nextRouteFor(user, '/login');
  if (target) redirect(target);

  return <LoginForm />;
}
