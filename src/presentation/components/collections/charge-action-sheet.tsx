'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { sileo } from 'sileo';
import type { Currency } from '@/core/domain/shared/money';
import {
  confirmChargeAction,
  objectChargeAction,
  voidChargeAction,
  type ChargeActionResult,
} from '@/presentation/actions/collections';
import { objectChargeFromPortalAction } from '@/presentation/actions/portal';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Label } from '@/presentation/components/ui/label';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { Textarea } from '@/presentation/components/ui/textarea';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

export const NOTE_MAX = 500;
const QUICK_REASON_KEYS = ['notMine', 'wrongAmount', 'wrongItem'] as const;
const MERCHANT_QUICK_REASONS = {
  object: ['notMine', 'wrongAmount', 'wrongItem'],
  confirm: ['confirmedWithNeighbor', 'receiptVerified'],
  void: ['duplicateCharge', 'returnedItems', 'pricingError'],
} as const;

export type ChargeActionKind = 'object' | 'confirm' | 'void';

export type ChargeActionContext = {
  date: Date;
  amount: string;
  currency: Currency;
  items: { name: string; quantity: string; amount: string }[];
  objectionNote?: string | null;
};

const ACTIONS: Record<
  ChargeActionKind,
  (input: Parameters<typeof objectChargeAction>[0]) => Promise<ChargeActionResult>
> = {
  object: objectChargeAction,
  confirm: confirmChargeAction,
  void: voidChargeAction,
};

/**
 * Hoja compartida para observar, confirmar o anular un cargo fiado (US11).
 * Se usa desde ChargeLine (ficha y portal), la cola de Observaciones y la pantalla de cobro.
 */
export function ChargeActionSheet({
  action,
  onClose,
  chargeId,
  customerId,
  cycleId,
  portalStoreId,
  context,
  redirectToCycleNotice = true,
}: {
  action: ChargeActionKind | null;
  onClose: () => void;
  chargeId: string;
  customerId: string;
  cycleId: string;
  portalStoreId?: string;
  context?: ChargeActionContext;
  /** En la vista de ciclo redirige con `?notice=...`; en /collections o /pay solo refresca con toast. */
  redirectToCycleNotice?: boolean;
}) {
  const tStore = useTranslations('Collections.charge');
  const tCycleNotice = useTranslations('Collections.cycle.notice');
  const tPortal = useTranslations('Portal.charge');
  const t = (key: string) =>
    portalStoreId && key.startsWith('object') ? tPortal(key) : tStore(key);

  const router = useRouter();
  const noteId = useId();
  const hintId = useId();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (!open) {
      setNote('');
      setError(null);
      onClose();
    }
  }

  function submit() {
    if (!action || busy || note.trim().length === 0) return;
    const done = action;
    setError(null);
    startTransition(async () => {
      const result = portalStoreId
        ? await objectChargeFromPortalAction({ storeId: portalStoreId, cycleId, chargeId, note })
        : await ACTIONS[done]({ customerId, cycleId, chargeId, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote('');
      setError(null);
      onClose();
      const notice = done === 'object' ? 'objected' : done === 'confirm' ? 'confirmed' : 'voided';
      if (redirectToCycleNotice) {
        const base = portalStoreId ? `/portal/${portalStoreId}` : `/customers/${customerId}`;
        router.replace(`${base}/cycles/${cycleId}?notice=${notice}`);
      } else {
        sileo.clear();
        sileo.success({ title: tCycleNotice(notice) });
      }
      router.refresh();
    });
  }

  const quickReasons = action
    ? portalStoreId && action === 'object'
      ? QUICK_REASON_KEYS.map((key) => tPortal(`quickReasons.${key}`))
      : !portalStoreId
        ? MERCHANT_QUICK_REASONS[action].map((key) => tStore(`quickReasons.${key}`))
        : []
    : [];

  return (
    <ResponsiveSheet
      open={action !== null}
      onOpenChange={handleOpenChange}
      closeLabel={t('cancel')}
      title={action ? t(`${action}Title`) : ''}
      description={action ? t(`${action}Body`) : undefined}
      footer={
        action ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size={portalStoreId ? 'lg' : 'default'}
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant={action === 'void' && !portalStoreId ? 'destructive' : 'primary'}
              size={portalStoreId ? 'lg' : 'default'}
              disabled={busy || note.trim().length === 0}
              onClick={submit}
            >
              {busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              {t(`${action}Submit`)}
            </Button>
          </>
        ) : null
      }
    >
      {action ? (
        <>
          {context ? (
            <div className="flex flex-col gap-1.5 rounded-field bg-paper-deep p-3.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-ink">
                  {tStore('purchase', { date: formatDate(context.date) })}
                </span>
                <Money
                  amount={context.amount}
                  currency={context.currency}
                  className="font-semibold text-ink"
                />
              </div>
              {context.items.length > 0 ? (
                <p className="line-clamp-2 text-[13px] text-ink-soft">
                  {context.items.map((item) => `${item.quantity} × ${item.name}`).join(' · ')}
                </p>
              ) : null}
              {context.objectionNote ? (
                <p className="text-[13px] text-amber-ink">
                  {tStore('objectionNote', { note: context.objectionNote })}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <Notice tone="error">
              <p>{t(`errors.${error}`)}</p>
            </Notice>
          ) : null}

          {quickReasons.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {quickReasons.map((reasonText) => {
                const selected = note.trim() === reasonText;
                return (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => {
                      setNote(selected ? '' : reasonText);
                      setError(null);
                    }}
                    className={cn(
                      'min-h-11 cursor-pointer rounded-full border px-3.5 py-2 text-sm font-medium transition-[transform,colors] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                      selected
                        ? 'border-link-active bg-soft text-soft-ink'
                        : 'border-line bg-paper-deep/60 text-ink hover:bg-surface-hover',
                    )}
                  >
                    {reasonText}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={noteId}
                className={cn('font-medium text-ink', portalStoreId ? 'text-base' : 'text-sm')}
              >
                {t(`${action}Label`)}
              </Label>
              {note.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setNote('');
                    setError(null);
                  }}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-link-active"
                >
                  <RotateCcwIcon aria-hidden="true" className="size-3.5" />
                  {tStore('clearNote')}
                </button>
              ) : null}
            </div>
            <Textarea
              id={noteId}
              value={note}
              maxLength={NOTE_MAX}
              aria-describedby={hintId}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
              onChange={(event) => {
                setNote(event.target.value);
                if (error) setError(null);
              }}
            />
            <div className="flex items-center justify-between gap-2 text-[13px] text-ink-soft">
              <p id={hintId}>{portalStoreId ? tPortal('objectHint') : tStore('noteHint')}</p>
              <span className="shrink-0 tabular-nums">
                {note.length}/{NOTE_MAX}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </ResponsiveSheet>
  );
}
