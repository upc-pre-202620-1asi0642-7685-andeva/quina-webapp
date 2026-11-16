import { getTranslations } from 'next-intl/server';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { listTeam } from '@/infrastructure/db/queries/team';
import { requireStoreUser } from '@/presentation/auth/guards';
import { InviteDialog } from '@/presentation/components/team/invite-dialog';
import { RolePermissionsCard } from '@/presentation/components/team/role-permissions-card';
import { TeamCapacityCard } from '@/presentation/components/team/team-capacity-card';
import { TeamDirectory } from '@/presentation/components/team/team-directory';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function TeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>;
}) {
  const user = await requireStoreUser('/team', 'team.manage');
  const [store, members, params] = await Promise.all([
    loadStoreContext(user.storeId),
    listTeam(user.storeId),
    searchParams,
  ]);
  const t = await getTranslations('Team');

  const limits = PlanLimits.of(store.tier);
  const seats = store.usage.users;
  const hasRoom = PlanLimits.canAdd(store.tier, 'users', seats);
  const upgradeTier = PlanLimits.upgradeFor('users', seats);

  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;
  const invitedCount = members.filter((m) => m.status === 'INVITED').length;
  const deactivatedCount = members.filter((m) => m.status === 'DEACTIVATED').length;
  const defaultOpen = params?.invite === '1' && hasRoom && !store.isReadOnly;
  const nowMs = new Date().getTime();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        <InviteDialog hasRoom={hasRoom} isReadOnly={store.isReadOnly} defaultOpen={defaultOpen} />
      </header>

      <TeamCapacityCard
        tier={store.tier}
        seats={seats}
        max={limits.users}
        activeCount={activeCount}
        invitedCount={invitedCount}
        deactivatedCount={deactivatedCount}
        isReadOnly={store.isReadOnly}
        overLimitResources={store.overLimitResources}
        upgradeTier={upgradeTier}
      />

      <RolePermissionsCard />

      <TeamDirectory
        members={members}
        currentUserId={user.id}
        hasRoom={hasRoom}
        storeIsReadOnly={store.isReadOnly}
        nowMs={nowMs}
      />
    </div>
  );
}
