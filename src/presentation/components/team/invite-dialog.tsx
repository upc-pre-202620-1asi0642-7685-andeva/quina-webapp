'use client';

import { useEffect, useState } from 'react';
import { UserPlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InviteForm } from '@/presentation/components/team/invite-form';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

export const OPEN_INVITE_EVENT = 'quina:open-invite';

export function InviteDialog({
  hasRoom,
  isReadOnly,
  defaultOpen = false,
}: {
  hasRoom: boolean;
  isReadOnly: boolean;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('Team');
  const canInvite = hasRoom && !isReadOnly;
  const [open, setOpen] = useState(Boolean(defaultOpen && canInvite));

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && typeof window !== 'undefined' && window.location.search.includes('invite=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  useEffect(() => {
    if (!canInvite) return;
    const onOpenInvite = () => setOpen(true);
    window.addEventListener(OPEN_INVITE_EVENT, onOpenInvite);
    return () => window.removeEventListener(OPEN_INVITE_EVENT, onOpenInvite);
  }, [canInvite]);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        disabled={!canInvite}
        onClick={() => handleOpenChange(true)}
      >
        <UserPlusIcon aria-hidden="true" />
        {t('invite.openButton')}
      </Button>

      <ResponsiveSheet
        open={open}
        onOpenChange={handleOpenChange}
        title={t('invite.title')}
        description={t('invite.subtitle')}
        closeLabel={t('close')}
      >
        <InviteForm onSuccess={() => handleOpenChange(false)} />
      </ResponsiveSheet>
    </>
  );
}
