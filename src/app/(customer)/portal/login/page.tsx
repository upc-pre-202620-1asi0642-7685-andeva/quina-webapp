import { redirect } from 'next/navigation';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { PortalLoginForm } from './portal-login-form';

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const target = nextRouteFor(await getSessionUser(), '/portal/login');
  if (target) redirect(target);
  const { error } = await searchParams;
  // ?error=link: enlace mágico vencido o usado; cualquier otro: Google no encontró la cuenta
  const notice = error === 'link' ? 'link' : error ? 'google' : null;
  return <PortalLoginForm notice={notice} />;
}
