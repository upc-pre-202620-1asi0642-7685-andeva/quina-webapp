import { getPortalAccount } from '@/infrastructure/db/queries/portal';
import { requirePortalUser } from '@/presentation/auth/guards';
import { PortalProfileView } from '@/presentation/components/profile/portal-profile-view';
import { loadProfileSummary } from '@/presentation/queries/profile';

/** US14.5: idioma, tema, contraseña opcional, sesiones y salir dentro de PortalShell. */
export default async function PortalProfilePage() {
  const { user, links } = await requirePortalUser('/portal/profile');
  const now = new Date();
  const [summary, accounts] = await Promise.all([
    loadProfileSummary(user),
    Promise.all(links.map((link) => getPortalAccount(link, now))),
  ]);

  const linkedStores = accounts
    .filter((account): account is NonNullable<typeof account> => account !== null)
    .map((account) => ({ storeId: account.storeId, storeName: account.storeName }));

  return <PortalProfileView profile={summary} stores={linkedStores} />;
}
