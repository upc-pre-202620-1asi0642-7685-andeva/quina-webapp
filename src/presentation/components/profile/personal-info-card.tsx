'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { updateProfileAction, type UpdateProfileActionState } from '@/presentation/actions/profile';
import { FormField } from '@/presentation/components/auth/form-field';
import { useActionToast } from '@/presentation/components/feedback/use-action-toast';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

export function PersonalInfoCard({
  initialName,
  initialPhone,
  isStoreOwner,
}: {
  initialName: string;
  initialPhone: string | null;
  isStoreOwner: boolean;
}) {
  const t = useTranslations('Profile.personal');
  const tErr = useTranslations('Auth.errors');
  const router = useRouter();

  const [savedName, setSavedName] = useState(initialName);
  const [savedPhone, setSavedPhone] = useState(initialPhone ?? '');
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [prevProps, setPrevProps] = useState({ initialName, initialPhone });

  if (initialName !== prevProps.initialName || initialPhone !== prevProps.initialPhone) {
    setPrevProps({ initialName, initialPhone });
    setSavedName(initialName);
    setSavedPhone(initialPhone ?? '');
    setName(initialName);
    setPhone(initialPhone ?? '');
  }

  const [state, formAction, pending] = useActionState<UpdateProfileActionState, FormData>(
    async (prev, formData) => {
      const res = await updateProfileAction(prev, formData);
      if (res.ok) {
        setSavedName(res.savedName ?? name.trim());
        setSavedPhone(res.savedPhone ?? '');
        setName(res.savedName ?? name.trim());
        setPhone(res.savedPhone ?? '');
        router.refresh();
      }
      return res;
    },
    {},
  );

  useActionToast(
    state,
    state.ok
      ? { type: 'success', title: t('saved') }
      : state.formError
        ? { type: 'error', title: tErr('generic') }
        : null,
  );

  const isDirty = name.trim() !== savedName || phone.trim() !== savedPhone;

  function handleUndo() {
    setName(savedName);
    setPhone(savedPhone);
  }

  return (
    <section
      aria-labelledby="profile-personal-title"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-personal-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="text-sm text-ink-soft">{t(isStoreOwner ? 'subtitleOwner' : 'subtitle')}</p>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="profile-name"
            label={t('nameLabel')}
            hint={t(isStoreOwner ? 'nameHintOwner' : 'nameHint')}
            error={state.fieldErrors?.name ? tErr(state.fieldErrors.name) : undefined}
          >
            {(props) => (
              <Input
                {...props}
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            )}
          </FormField>

          <FormField
            id="profile-phone"
            label={t('phoneLabel')}
            hint={t('phoneHint')}
            error={state.fieldErrors?.phone ? t('phoneInvalid') : undefined}
          >
            {(props) => (
              <Input
                {...props}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t('phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pending}
                className="tabular-nums"
              />
            )}
          </FormField>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" variant="primary" disabled={!isDirty || pending}>
            {pending ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
            <span>{pending ? t('saving') : t('save')}</span>
          </Button>

          {isDirty ? (
            <Button type="button" variant="ghost" onClick={handleUndo} disabled={pending}>
              <RotateCcwIcon aria-hidden="true" />
              <span>{t('undo')}</span>
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
