'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import { ArchiveIcon, ArchiveRestoreIcon, ClipboardListIcon, PackageMinusIcon } from 'lucide-react';
import { Quantity } from '@/core/domain/catalog/quantity';
import { Dec } from '@/core/domain/shared/decimal';
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
import { Input } from '@/presentation/components/ui/input';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { cn } from '@/presentation/lib/utils';

type SheetKind = 'adjust' | 'waste' | 'deactivate' | null;

export function ProductActions({
  productId,
  name,
  isActive,
  isService,
  unitCode,
  allowDecimals,
  currentStock,
  isReadOnly,
}: {
  productId: string;
  name: string;
  isActive: boolean;
  isService: boolean;
  unitCode: string;
  allowDecimals: boolean;
  currentStock: string;
  isReadOnly: boolean;
}) {
  const t = useTranslations('Inventory.detail');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function runToggle(active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setProductActiveAction(productId, active);
      setSheet(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const canUndo = !(active === false && isReadOnly);
      sileo.clear();
      sileo.success({
        title: active ? t('toast.reactivated', { name }) : t('toast.deactivated', { name }),
        duration: 6000,
        autopilot: { expand: 0, collapse: 5800 },
        button: canUndo
          ? {
              title: t('undo'),
              onClick: () => {
                startTransition(async () => {
                  const undoResult = await setProductActiveAction(productId, !active);
                  if (!undoResult.ok) {
                    setError(undoResult.error);
                    return;
                  }
                  sileo.clear();
                  sileo.info({ title: t('toast.undone') });
                  router.refresh();
                });
              },
            }
          : undefined,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Notice tone={error === 'planLimit' ? 'warning' : 'error'}>
          <p>{t(`errors.${error}`)}</p>
          {error === 'planLimit' ? (
            <Link
              href="/settings/subscription"
              className="font-semibold underline underline-offset-4"
            >
              {tPlans('seePlans')}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!isService && isActive && !isReadOnly ? (
          <>
            <Button variant="secondary" onClick={() => setSheet('adjust')} disabled={busy}>
              <ClipboardListIcon aria-hidden="true" />
              {t('adjustTitle')}
            </Button>
            <Button variant="secondary" onClick={() => setSheet('waste')} disabled={busy}>
              <PackageMinusIcon aria-hidden="true" />
              {t('wasteTitle')}
            </Button>
          </>
        ) : null}
        {isActive ? (
          <Button variant="ghost" onClick={() => setSheet('deactivate')} disabled={busy}>
            <ArchiveIcon aria-hidden="true" />
            {t('deactivate')}
          </Button>
        ) : !isReadOnly ? (
          <Button variant="secondary" onClick={() => runToggle(true)} disabled={busy}>
            <ArchiveRestoreIcon aria-hidden="true" />
            {t('reactivate')}
          </Button>
        ) : null}
      </div>

      <ResponsiveSheet
        open={sheet === 'deactivate'}
        onOpenChange={(open) => setSheet(open ? 'deactivate' : null)}
        title={t('deactivateTitle', { name })}
        description={t('deactivateBody')}
        closeLabel={t('cancel')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSheet(null)}
              disabled={busy}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => runToggle(false)}
              disabled={busy}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{t('deactivateHint')}</p>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={sheet === 'adjust'}
        onOpenChange={(open) => setSheet(open ? 'adjust' : null)}
        title={t('adjustTitle')}
        description={t('adjustBody')}
        closeLabel={t('cancel')}
      >
        {sheet === 'adjust' ? (
          <AdjustStockForm
            productId={productId}
            unitCode={unitCode}
            allowDecimals={allowDecimals}
            currentStock={currentStock}
            onCancel={() => setSheet(null)}
          />
        ) : null}
      </ResponsiveSheet>

      <ResponsiveSheet
        open={sheet === 'waste'}
        onOpenChange={(open) => setSheet(open ? 'waste' : null)}
        title={t('wasteTitle')}
        description={t('wasteBody')}
        closeLabel={t('cancel')}
      >
        {sheet === 'waste' ? (
          <RecordWasteForm
            productId={productId}
            unitCode={unitCode}
            allowDecimals={allowDecimals}
            currentStock={currentStock}
            onCancel={() => setSheet(null)}
          />
        ) : null}
      </ResponsiveSheet>
    </div>
  );
}

function AdjustStockForm({
  productId,
  unitCode,
  allowDecimals,
  currentStock,
  onCancel,
}: {
  productId: string;
  unitCode: string;
  allowDecimals: boolean;
  currentStock: string;
  onCancel: () => void;
}) {
  const t = useTranslations('Inventory.detail');
  const [state, formAction, pending] = useActionState<AdjustStockState, FormData>(
    adjustStockAction.bind(null, productId),
    {},
  );
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');

  const parsedCounted = counted.trim()
    ? Quantity.parse(counted, { allowDecimals, allowZero: true })
    : null;
  const diff = parsedCounted?.ok ? Quantity.minus(parsedCounted.value, currentStock) : null;
  const isNoChange = diff !== null && Quantity.isZero(diff);
  const diffPositive = diff !== null && !diff.startsWith('-') && !isNoChange;

  const presets = [t('adjustPresetMonthly'), t('adjustPresetShelf'), t('adjustPresetOpening')];

  const error = (field: 'countedStock' | 'reason') =>
    state.errors?.[field] ? t(`errors.${state.errors[field]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.errors?.form ? <Notice tone="error">{t(`errors.${state.errors.form}`)}</Notice> : null}

      <div className="flex items-center justify-between gap-3 rounded-field bg-paper-deep px-3.5 py-2.5 text-sm">
        <span className="text-ink-soft">{t('currentStockInSystem')}</span>
        <span className="font-semibold text-ink tabular-nums">
          {formatQuantity(currentStock)} {unitCode}
        </span>
      </div>

      <FormField
        id="adjust-counted"
        label={t('countedLabel')}
        hint={t('countedHint')}
        error={error('countedStock') ?? (isNoChange ? t('errors.noChange') : undefined)}
      >
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              name="countedStock"
              inputMode={allowDecimals ? 'decimal' : 'numeric'}
              autoComplete="off"
              required
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
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

      {parsedCounted?.ok && diff !== null && !isNoChange ? (
        <div
          aria-live="polite"
          className={cn(
            'flex items-center justify-between rounded-field px-3.5 py-2 text-sm font-medium tabular-nums',
            diffPositive ? 'bg-success/12 text-success-ink' : 'bg-amber/12 text-amber-ink',
          )}
        >
          <span>{t('adjustPreviewLabel')}</span>
          <span>
            {formatQuantity(currentStock)} → {formatQuantity(parsedCounted.value)} {unitCode} (
            {diffPositive ? `+${formatQuantity(diff)}` : formatQuantity(diff)})
          </span>
        </div>
      ) : null}

      <FormField
        id="adjust-reason"
        label={t('reasonLabel')}
        hint={t('reasonHint')}
        error={error('reason')}
      >
        {(props) => (
          <Input
            {...props}
            name="reason"
            autoComplete="off"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </FormField>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setReason(preset)}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line bg-paper px-3 text-xs font-medium text-ink-soft transition-[transform,color,background-color] duration-150 hover:bg-surface-hover hover:text-ink active:scale-[0.97]"
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending || isNoChange}>
          {pending ? t('adjusting') : t('adjustSubmit')}
        </Button>
      </div>
    </form>
  );
}

function RecordWasteForm({
  productId,
  unitCode,
  allowDecimals,
  currentStock,
  onCancel,
}: {
  productId: string;
  unitCode: string;
  allowDecimals: boolean;
  currentStock: string;
  onCancel: () => void;
}) {
  const t = useTranslations('Inventory.detail');
  const [state, formAction, pending] = useActionState<RecordWasteState, FormData>(
    recordWasteAction.bind(null, productId),
    {},
  );
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const parsedQty = quantity.trim()
    ? Quantity.parse(quantity, { allowDecimals, allowZero: false })
    : null;
  const exceedsStock = parsedQty?.ok ? Quantity.compare(parsedQty.value, currentStock) > 0 : false;
  const remaining =
    parsedQty?.ok && !exceedsStock ? new Dec(currentStock).minus(parsedQty.value).toFixed(3) : null;

  const presets = [t('wastePresetDamaged'), t('wastePresetExpired'), t('wastePresetSpoiled')];

  const error = (field: 'quantity' | 'reason') =>
    state.errors?.[field] ? t(`errors.${state.errors[field]}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.errors?.form ? <Notice tone="error">{t(`errors.${state.errors.form}`)}</Notice> : null}

      <div className="flex items-center justify-between gap-3 rounded-field bg-paper-deep px-3.5 py-2.5 text-sm">
        <span className="text-ink-soft">{t('currentStockInSystem')}</span>
        <span className="font-semibold text-ink tabular-nums">
          {formatQuantity(currentStock)} {unitCode}
        </span>
      </div>

      <FormField
        id="waste-quantity"
        label={t('wasteQuantityLabel')}
        hint={t('wasteQuantityHint')}
        error={error('quantity') ?? (exceedsStock ? t('errors.insufficientStock') : undefined)}
      >
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              name="quantity"
              inputMode={allowDecimals ? 'decimal' : 'numeric'}
              autoComplete="off"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
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

      {remaining !== null ? (
        <div
          aria-live="polite"
          className="flex items-center justify-between rounded-field bg-error/12 px-3.5 py-2 text-sm font-medium text-error-ink tabular-nums"
        >
          <span>{t('wastePreviewLabel')}</span>
          <span>
            {formatQuantity(currentStock)} → {formatQuantity(remaining)} {unitCode}
          </span>
        </div>
      ) : null}

      <FormField
        id="waste-reason"
        label={t('wasteReasonLabel')}
        hint={t('wasteReasonHint')}
        error={error('reason')}
      >
        {(props) => (
          <Input
            {...props}
            name="reason"
            autoComplete="off"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </FormField>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setReason(preset)}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line bg-paper px-3 text-xs font-medium text-ink-soft transition-[transform,color,background-color] duration-150 hover:bg-surface-hover hover:text-ink active:scale-[0.97]"
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending || exceedsStock}>
          {pending ? t('wasteSubmitting') : t('wasteSubmit')}
        </Button>
      </div>
    </form>
  );
}
