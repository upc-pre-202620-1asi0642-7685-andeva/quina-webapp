'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArchiveIcon, ArchiveRestoreIcon, ClipboardListIcon, PackageMinusIcon } from 'lucide-react';
import {
  adjustStockAction,
  recordWasteAction,
  setProductActiveAction,
  type AdjustStockState,
  type RecordWasteState,
} from '@/presentation/actions/catalog';
import { FormField } from '@/presentation/components/auth/form-field';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';
import { Input } from '@/presentation/components/ui/input';

export function ProductActions({
  productId,
  name,
  isActive,
  isService,
  unitCode,
  allowDecimals,
}: {
  productId: string;
  name: string;
  isActive: boolean;
  isService: boolean;
  unitCode: string;
  allowDecimals: boolean;
}) {
  const t = useTranslations('Inventory.detail');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [recordingWaste, setRecordingWaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function toggle(active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setProductActiveAction(productId, active);
      setConfirm(false);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Notice tone={error === 'planLimit' ? 'warning' : 'error'}>
          <p>{t(`errors.${error}`)}</p>
          {error === 'planLimit' ? (
            <Link href="/settings" className="font-semibold underline underline-offset-4">
              {tPlans('seePlans')}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!isService && isActive ? (
          <>
            <Button variant="secondary" onClick={() => setAdjusting(true)} disabled={busy}>
              <ClipboardListIcon aria-hidden="true" />
              {t('adjustTitle')}
            </Button>
            <Button variant="secondary" onClick={() => setRecordingWaste(true)} disabled={busy}>
              <PackageMinusIcon aria-hidden="true" />
              {t('wasteTitle')}
            </Button>
          </>
        ) : null}
        {isActive ? (
          <Button variant="ghost" onClick={() => setConfirm(true)} disabled={busy}>
            <ArchiveIcon aria-hidden="true" />
            {t('deactivate')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => toggle(true)} disabled={busy}>
            <ArchiveRestoreIcon aria-hidden="true" />
            {t('reactivate')}
          </Button>
        )}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent showCloseButton={false} className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">{t('deactivateTitle', { name })}</DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            {t('deactivateBody')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => toggle(false)} disabled={busy}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjusting} onOpenChange={setAdjusting}>
        <DialogContent className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">{t('adjustTitle')}</DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">{t('adjustBody')}</DialogDescription>
          {adjusting ? (
            <AdjustStockForm
              productId={productId}
              unitCode={unitCode}
              allowDecimals={allowDecimals}
              onCancel={() => setAdjusting(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={recordingWaste} onOpenChange={setRecordingWaste}>
        <DialogContent className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">{t('wasteTitle')}</DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">{t('wasteBody')}</DialogDescription>
          {recordingWaste ? (
            <RecordWasteForm
              productId={productId}
              unitCode={unitCode}
              allowDecimals={allowDecimals}
              onCancel={() => setRecordingWaste(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdjustStockForm({
  productId,
  unitCode,
  allowDecimals,
  onCancel,
}: {
  productId: string;
  unitCode: string;
  allowDecimals: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations('Inventory.detail');
  const [state, formAction, pending] = useActionState<AdjustStockState, FormData>(
    adjustStockAction.bind(null, productId),
    {},
  );
  const error = (field: 'countedStock' | 'reason') =>
    state.errors?.[field] ? t(`errors.${state.errors[field]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.errors?.form ? <Notice tone="error">{t(`errors.${state.errors.form}`)}</Notice> : null}
      <FormField
        id="adjust-counted"
        label={t('countedLabel')}
        hint={t('countedHint')}
        error={error('countedStock')}
      >
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              name="countedStock"
              inputMode={allowDecimals ? 'decimal' : 'numeric'}
              autoComplete="off"
              required
              className="pr-14 tabular-nums"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-soft"
            >
              {unitCode}
            </span>
          </div>
        )}
      </FormField>
      <FormField
        id="adjust-reason"
        label={t('reasonLabel')}
        hint={t('reasonHint')}
        error={error('reason')}
      >
        {(props) => <Input {...props} name="reason" autoComplete="off" required />}
      </FormField>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('adjusting') : t('adjustSubmit')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RecordWasteForm({
  productId,
  unitCode,
  allowDecimals,
  onCancel,
}: {
  productId: string;
  unitCode: string;
  allowDecimals: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations('Inventory.detail');
  const [state, formAction, pending] = useActionState<RecordWasteState, FormData>(
    recordWasteAction.bind(null, productId),
    {},
  );
  const error = (field: 'quantity' | 'reason') =>
    state.errors?.[field] ? t(`errors.${state.errors[field]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.errors?.form ? <Notice tone="error">{t(`errors.${state.errors.form}`)}</Notice> : null}
      <FormField
        id="waste-quantity"
        label={t('wasteQuantityLabel')}
        hint={t('wasteQuantityHint')}
        error={error('quantity')}
      >
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              name="quantity"
              inputMode={allowDecimals ? 'decimal' : 'numeric'}
              autoComplete="off"
              required
              className="pr-14 tabular-nums"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-soft"
            >
              {unitCode}
            </span>
          </div>
        )}
      </FormField>
      <FormField
        id="waste-reason"
        label={t('wasteReasonLabel')}
        hint={t('wasteReasonHint')}
        error={error('reason')}
      >
        {(props) => <Input {...props} name="reason" autoComplete="off" required />}
      </FormField>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('wasteSubmitting') : t('wasteSubmit')}
        </Button>
      </DialogFooter>
    </form>
  );
}
