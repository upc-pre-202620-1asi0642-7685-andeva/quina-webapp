import { redirect } from 'next/navigation';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const target = nextRouteFor(user, '/');
  if (target) redirect(target);

  return <>{children}</>;
}
