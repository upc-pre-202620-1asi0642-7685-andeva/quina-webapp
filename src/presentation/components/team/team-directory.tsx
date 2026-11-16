'use client';

import Link from 'next/link';
import { UserPlusIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TeamMember } from '@/core/domain/ports/team-repository';
import { OPEN_INVITE_EVENT } from '@/presentation/components/team/invite-dialog';
import { MemberActions } from '@/presentation/components/team/member-actions';
import { MemberBadge, type MemberBadgeStatus } from '@/presentation/components/team/member-badge';
import { Avatar, AvatarFallback } from '@/presentation/components/ui/avatar';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

function getInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return letters || '?';
}

export function TeamDirectory({
  members,
  currentUserId,
  hasRoom,
  storeIsReadOnly,
  nowMs,
}: {
  members: TeamMember[];
  currentUserId: string;
  hasRoom: boolean;
  storeIsReadOnly: boolean;
  nowMs: number;
}) {
  const t = useTranslations('Team');
  const tPlans = useTranslations('Plans');

  const activeAndInvited = members.filter((m) => m.status !== 'DEACTIVATED');
  const deactivated = members.filter((m) => m.status === 'DEACTIVATED');

  const resolveMemberMeta = (
    member: TeamMember,
  ): { badgeStatus: MemberBadgeStatus; activityLabel: string } => {
    const expiresAt = member.inviteExpiresAt ? new Date(member.inviteExpiresAt) : null;
    const isExpired =
      member.status === 'INVITED' && expiresAt !== null && expiresAt.getTime() <= nowMs;
    const badgeStatus: MemberBadgeStatus = isExpired ? 'EXPIRED' : member.status;

    let activityLabel: string;
    if (member.status === 'INVITED') {
      if (isExpired && expiresAt) {
        activityLabel = t('directory.activity.expiredOn', { date: formatDate(expiresAt) });
      } else if (expiresAt) {
        activityLabel = t('directory.activity.expiresOn', { date: formatDate(expiresAt) });
      } else {
        activityLabel = t('directory.activity.invitedOn', {
          date: formatDate(new Date(member.createdAt)),
        });
      }
    } else if (member.lastLoginAt) {
      activityLabel = t('directory.activity.lastLogin', {
        date: formatDate(new Date(member.lastLoginAt)),
      });
    } else {
      activityLabel = t('directory.activity.since', {
        date: formatDate(new Date(member.createdAt)),
      });
    }

    return { badgeStatus, activityLabel };
  };

  const renderMemberList = (items: TeamMember[]) => (
    <>
      {/* Celular: lista de tarjetas táctiles (DESIGN.md §5) */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {items.map((member) => {
          const { badgeStatus, activityLabel } = resolveMemberMeta(member);
          return (
            <li key={member.userId}>
              <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Avatar size="lg" aria-hidden="true">
                    <AvatarFallback
                      className={cn(
                        'font-semibold',
                        member.status === 'DEACTIVATED'
                          ? 'bg-paper-deep text-ink-soft'
                          : 'bg-soft text-soft-ink',
                      )}
                    >
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-base font-medium text-ink">
                        {member.name}
                        {member.userId === currentUserId ? (
                          <span className="text-ink-soft"> · {t('you')}</span>
                        ) : null}
                      </p>
                      <MemberBadge role={member.role} status={badgeStatus} />
                    </div>
                    <p className="truncate text-sm text-ink-soft">{member.email}</p>
                    <p className="text-[13px] text-ink-soft tabular-nums">{activityLabel}</p>
                  </div>
                </div>
                {member.role === 'STORE_EMPLOYEE' ? (
                  <MemberActions
                    userId={member.userId}
                    name={member.name}
                    status={member.status}
                    storeIsReadOnly={storeIsReadOnly}
                  />
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla con encabezado fijo (DESIGN.md §5) */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-paper-deep text-left text-ink-soft">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('directory.columns.member')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('directory.columns.status')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('directory.columns.activity')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('directory.columns.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((member) => {
              const { badgeStatus, activityLabel } = resolveMemberMeta(member);
              return (
                <tr key={member.userId} className="border-t border-line hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar size="lg" aria-hidden="true">
                        <AvatarFallback
                          className={cn(
                            'font-semibold',
                            member.status === 'DEACTIVATED'
                              ? 'bg-paper-deep text-ink-soft'
                              : 'bg-soft text-soft-ink',
                          )}
                        >
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <p className="truncate font-medium text-ink">
                          {member.name}
                          {member.userId === currentUserId ? (
                            <span className="text-ink-soft"> · {t('you')}</span>
                          ) : null}
                        </p>
                        <p className="truncate text-sm text-ink-soft">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <MemberBadge role={member.role} status={badgeStatus} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-soft tabular-nums">
                    {activityLabel}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.role === 'STORE_EMPLOYEE' ? (
                      <MemberActions
                        userId={member.userId}
                        name={member.name}
                        status={member.status}
                        storeIsReadOnly={storeIsReadOnly}
                      />
                    ) : (
                      <span className="text-[13px] text-ink-soft">{t('directory.ownerNote')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <section aria-labelledby="team-directory-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-directory-title" className="text-lg font-semibold text-ink">
          {t('membersTitle')}
        </h2>
      </div>

      <Tabs defaultValue="active" className="gap-4">
        <TabsList className="h-11 w-full rounded-full bg-paper-deep p-1 sm:w-fit">
          <TabsTrigger
            value="active"
            className="rounded-full px-4 text-sm font-medium text-ink-soft tabular-nums data-[state=active]:bg-surface data-[state=active]:text-ink dark:text-ink-soft dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-surface dark:data-[state=active]:text-ink"
          >
            {t('directory.tabs.activeAndInvited', { count: activeAndInvited.length })}
          </TabsTrigger>
          <TabsTrigger
            value="deactivated"
            className="rounded-full px-4 text-sm font-medium text-ink-soft tabular-nums data-[state=active]:bg-surface data-[state=active]:text-ink dark:text-ink-soft dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-surface dark:data-[state=active]:text-ink"
          >
            {t('directory.tabs.deactivated', { count: deactivated.length })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex flex-col gap-4">
          {renderMemberList(activeAndInvited)}

          {activeAndInvited.length <= 1 ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-8 text-center">
              <UsersIcon aria-hidden="true" className="size-8 text-ink-soft" />
              <div className="flex max-w-md flex-col gap-1">
                <h3 className="text-base font-semibold text-ink">{t('directory.empty.title')}</h3>
                <p className="text-sm text-ink-soft">
                  {hasRoom ? t('directory.empty.body') : t('directory.empty.upgradeHint')}
                </p>
              </div>
              {hasRoom && !storeIsReadOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => window.dispatchEvent(new Event(OPEN_INVITE_EVENT))}
                >
                  <UserPlusIcon aria-hidden="true" />
                  {t('invite.openButton')}
                </Button>
              ) : !hasRoom ? (
                <Link
                  href="/settings/subscription"
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  {tPlans('seePlans')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="deactivated" className="flex flex-col gap-4">
          {deactivated.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-center">
              <UsersIcon aria-hidden="true" className="size-8 text-ink-soft" />
              <p className="text-sm text-ink-soft">{t('directory.emptyDeactivated')}</p>
            </div>
          ) : (
            renderMemberList(deactivated)
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
