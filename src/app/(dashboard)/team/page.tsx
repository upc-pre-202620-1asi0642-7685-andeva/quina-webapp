import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LockIcon } from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { listTeam } from '@/infrastructure/db/queries/team';
import { requireStoreUser } from '@/presentation/auth/guards';
import { InviteForm } from '@/presentation/components/team/invite-form';
import { MemberActions } from '@/presentation/components/team/member-actions';
import { MemberBadge } from '@/presentation/components/team/member-badge';
import { buttonVariants } from '@/presentation/components/ui/button';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function TeamPage() {
  const user = await requireStoreUser('/team', 'team.manage');
  const [store, members] = await Promise.all([
    loadStoreContext(user.storeId),
    listTeam(user.storeId),
  ]);
  const t = await getTranslations('Team');
  const tPlans = await getTranslations('Plans');

  const max = PlanLimits.of(store.tier).users;
  const seats = members.filter((m) => m.status !== 'DEACTIVATED').length;
  const hasRoom = PlanLimits.canAdd(store.tier, 'users', seats);
  const upgrade = PlanLimits.upgradeFor('users', seats);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">
          {max === null ? t('usageUnlimited', { seats }) : t('usage', { seats, max })}
        </p>
      </header>

      {hasRoom ? (
        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-ink">{t('invite.title')}</h2>
            <p className="text-sm text-ink-soft">{t('invite.subtitle')}</p>
          </div>
          <InviteForm />
        </section>
      ) : (
        // US26 crit. 2 y 5: se ve bloqueado, con el plan que lo habilita
        <section className="flex flex-col items-start gap-3 rounded-card border border-line bg-paper-deep p-4 sm:p-6">
          <LockIcon aria-hidden="true" className="size-6 text-ink-soft" />
          <h2 className="text-lg font-semibold text-ink">
            {store.tier === 'CASERO' ? t('locked.caseroTitle') : t('locked.fullTitle')}
          </h2>
          <p className="text-sm text-ink-soft">
            {upgrade ? t('locked.body', { plan: tPlans(`names.${upgrade}`) }) : null}
          </p>
          <Link href="/settings#plans" className={buttonVariants({ variant: 'secondary' })}>
            {tPlans('seePlans')}
          </Link>
        </section>
      )}

      <section className="flex flex-col rounded-card border border-line bg-surface">
        <h2 className="px-4 pt-4 text-lg font-semibold text-ink sm:px-6 sm:pt-6">
          {t('membersTitle')}
        </h2>
        <ul className="divide-y divide-line">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium text-ink">
                  {member.name}
                  {member.userId === user.id ? (
                    <span className="text-ink-soft"> · {t('you')}</span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-ink-soft">{member.email}</p>
                <MemberBadge role={member.role} status={member.status} />
              </div>
              {member.role === 'STORE_EMPLOYEE' ? (
                <MemberActions userId={member.userId} name={member.name} status={member.status} />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
