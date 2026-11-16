'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BanIcon, CheckIcon, MessageSquareWarningIcon } from 'lucide-react';
import type { Currency } from '@/core/domain/shared/money';
import type { CycleDetailLine } from '@/infrastructure/db/queries/collections';
import {
  confirmChargeAction,
  objectChargeAction,
  voidChargeAction,
  type ChargeActionResult,
} from '@/presentation/actions/collections';
import { objectChargeFromPortalAction } from '@/presentation/actions/portal';
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';
import { Label } from '@/presentation/components/ui/label';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { Textarea } from '@/presentation/components/ui/textarea';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

const NOTE_MAX = 500;
const QUICK_REASON_KEYS = ['notMine', 'wrongAmount', 'wrongItem'] as const;

type Action = 'object' | 'confirm' | 'void';

const ACTIONS: Record<
  Action,
  (input: Parameters<typeof objectChargeAction>[0]) => Promise<ChargeActionResult>
> = {
  object: objectChargeAction,
  confirm: confirmChargeAction,
  void: voidChargeAction,
};

// DESIGN.md §2.4: el ámbar avisa que algo espera una decisión; el rojo, que se anuló
const CONSENT_STYLES = {
  PENDING: 'bg-paper-deep text-ink-soft',
  ACCEPTED: 'bg-success/12 text-success-ink',
  OBJECTED: 'bg-amber/12 text-amber-ink',
  VOIDED: 'bg-error/12 text-error-ink',
} as const;

/** Una línea del estado de cuenta; las compras muestran su conformidad y acciones (US11). */
export function ChargeLine({
  line,
  installments,
  currency,
  customerId,
  cycleId,
  permissions,
  now,
  portalStoreId,
}: {
  line: CycleDetailLine;
  /** Solo compras en cuotas: cuántas cuotas tiene. */
  installments?: number;
  currency: Currency;
  customerId: string;
  cycleId: string;
  permissions: { object: boolean; resolve: boolean };
  /** Hora del servidor al pintar la página: decide si sigue abierta la ventana de 48 h. */
  now: Date;
  /** Portal del vecino (US14.9): el propio vecino observa; los textos le hablan a él. */
  portalStoreId?: string;
}) {
  const t = useTranslations('Collections.charge');
  const tPortal = useTranslations('Portal.charge');
  // DESIGN.md §6.2: el portal usa un escalón más de letra
  const large = Boolean(portalStoreId);
  const body = large ? 'text-lg' : 'text-sm';
  const small = large ? 'text-base' : 'text-[13px]';
  const note = large ? 'text-base' : 'text-sm';

  if (line.kind === 'installment') {
    return (
      <div className={cn('flex items-start justify-between gap-3', body)}>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">
            {t('installment', { number: line.number, total: line.total })}
          </span>
          <span className="text-ink-soft">
            {t('installmentBreakdown', {
              principal: formatMoney(line.principal, currency),
              interest: formatMoney(line.interest, currency),
            })}
          </span>
        </div>
        <Money amount={line.amount} currency={currency} className="font-semibold text-ink" />
      </div>
    );
  }

  if (line.kind === 'void') {
    return (
      <div className={cn('flex items-start justify-between gap-3', body)}>
        <span className="font-medium text-ink">{t('voidLine')}</span>
        <span className="font-semibold whitespace-nowrap text-ink">
          − <Money amount={line.amount} currency={currency} />
        </span>
      </div>
    );
  }

  const voided = line.chargeStatus === 'VOIDED';
  const consent = voided ? 'VOIDED' : line.consentStatus;
  const open = !voided && line.chargeStatus !== 'PAID';
  const canObject =
    permissions.object &&
    open &&
    line.consentStatus === 'PENDING' &&
    (!line.consentDeadline || line.consentDeadline.getTime() > now.getTime());
  const canResolve = permissions.resolve && open && line.consentStatus === 'OBJECTED';

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex items-start justify-between gap-3', body)}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cn('font-medium text-ink', voided && 'line-through')}>
            {t('purchase', { date: formatDate(line.date) })}
            {installments ? ` · ${t('inInstallments', { count: installments })}` : ''}
          </span>
          <ul className={cn('flex flex-col gap-0.5 text-ink-soft', large && 'text-base')}>
            {line.items.map((item, index) => (
              <li key={index} className="flex items-start justify-between gap-3">
                <span className="line-clamp-2 min-w-0 flex-1">
                  {item.quantity} × {item.name}
                </span>
                <Money amount={item.amount} currency={currency} className="shrink-0" />
              </li>
            ))}
          </ul>
          {line.days !== null && line.interest !== null ? (
            <span className="text-ink-soft">
              {t('interest', { days: line.days })}{' '}
              <Money amount={line.interest} currency={currency} />
            </span>
          ) : null}
        </div>
        <Money
          amount={line.amount}
          currency={currency}
          className={cn('font-semibold text-ink', voided && 'line-through')}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 font-medium',
            small,
            CONSENT_STYLES[consent],
          )}
        >
          {t(`consent.${consent}`)}
        </span>
        {line.consentStatus === 'PENDING' && line.consentDeadline && !voided ? (
          <span className={cn('text-ink-soft', small)}>
            {t('deadline', { date: formatDate(line.consentDeadline) })}
          </span>
        ) : null}
      </div>

      {line.objectionNote ? (
        <p className={cn('text-ink-soft', note)}>
          {t('objectionNote', { note: line.objectionNote })}
        </p>
      ) : null}
      {line.voidReason ? (
        <p className={cn('text-ink-soft', note)}>{t('voidReason', { note: line.voidReason })}</p>
      ) : line.resolutionNote ? (
        <p className={cn('text-ink-soft', note)}>
          {t('resolutionNote', { note: line.resolutionNote })}
        </p>
      ) : null}
      {permissions.object && !permissions.resolve && open && line.consentStatus === 'OBJECTED' ? (
        <p className={cn('text-ink-soft', note)}>
          {portalStoreId ? tPortal('waiting') : t('askOwner')}
        </p>
      ) : null}

      {canObject || canResolve ? (
        <ChargeActions
          chargeId={line.chargeId}
          customerId={customerId}
          cycleId={cycleId}
          canObject={canObject}
          canResolve={canResolve}
          portalStoreId={portalStoreId}
        />
      ) : null}
    </div>
  );
}

function ChargeActions({
  chargeId,
  customerId,
  cycleId,
  canObject,
  canResolve,
  portalStoreId,
}: {
  chargeId: string;
  customerId: string;
  cycleId: string;
  canObject: boolean;
  canResolve: boolean;
  portalStoreId?: string | undefined;
}) {
  const tStore = useTranslations('Collections.charge');
  const tPortal = useTranslations('Portal.charge');
  // En el portal, observar le habla al vecino; los errores y botones son los mismos
  const t = (key: string) =>
    portalStoreId && key.startsWith('object') ? tPortal(key) : tStore(key);
  const router = useRouter();
  const noteId = useId();
  const hintId = useId();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function openDialog(next: Action) {
    setNote('');
    setError(null);
    setAction(next);
  }

  function submit() {
    if (!action) return;
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
      setAction(null);
      const notice = done === 'object' ? 'objected' : done === 'confirm' ? 'confirmed' : 'voided';
      const base = portalStoreId ? `/portal/${portalStoreId}` : `/customers/${customerId}`;
      router.replace(`${base}/cycles/${cycleId}?notice=${notice}`);
      router.refresh();
    });
  }

  const formFields = action ? (
    <>
      {error ? (
        <Notice tone="error">
          <p>{t(`errors.${error}`)}</p>
        </Notice>
      ) : null}
      {portalStoreId && action === 'object' ? (
        <div className="flex flex-wrap gap-2">
          {QUICK_REASON_KEYS.map((key) => {
            const reasonText = tPortal(`quickReasons.${key}`);
            const selected = note.trim() === reasonText;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setNote(reasonText);
                  setError(null);
                }}
                className={cn(
                  'min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[transform,colors] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
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
        <Label
          htmlFor={noteId}
          className={cn('font-medium text-ink', portalStoreId ? 'text-base' : 'text-sm')}
        >
          {t(`${action}Label`)}
        </Label>
        <Textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          aria-describedby={portalStoreId ? hintId : undefined}
          onChange={(event) => {
            setNote(event.target.value);
            if (error) setError(null);
          }}
        />
        <div className="flex items-center justify-between gap-2 text-[13px] text-ink-soft">
          {portalStoreId ? <p id={hintId}>{tPortal('objectHint')}</p> : <span />}
          <span className="shrink-0 tabular-nums">
            {note.length}/{NOTE_MAX}
          </span>
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canObject ? (
          <Button
            variant="secondary"
            size={portalStoreId ? 'lg' : 'sm'}
            className={cn(portalStoreId && 'w-full text-base sm:w-auto')}
            onClick={() => openDialog('object')}
          >
            <MessageSquareWarningIcon aria-hidden="true" />
            {t('object')}
          </Button>
        ) : null}
        {canResolve ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => openDialog('confirm')}>
              <CheckIcon aria-hidden="true" />
              {t('confirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openDialog('void')}>
              <BanIcon aria-hidden="true" />
              {t('void')}
            </Button>
          </>
        ) : null}
      </div>

      {portalStoreId ? (
        <ResponsiveSheet
          open={action !== null}
          onOpenChange={(open) => (open ? null : setAction(null))}
          title={action ? t(`${action}Title`) : ''}
          description={action ? t(`${action}Body`) : undefined}
          footer={
            action ? (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setAction(null)}
                  disabled={busy}
                >
                  {t('cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busy || note.trim().length === 0}
                  onClick={submit}
                >
                  {t(`${action}Submit`)}
                </Button>
              </>
            ) : null
          }
        >
          {formFields}
        </ResponsiveSheet>
      ) : (
        <Dialog open={action !== null} onOpenChange={(open) => (open ? null : setAction(null))}>
          <DialogContent showCloseButton={false} className="rounded-card border-line bg-surface">
            {action ? (
              <>
                <DialogTitle className="text-lg text-ink">{t(`${action}Title`)}</DialogTitle>
                <DialogDescription className="text-sm text-ink-soft">
                  {t(`${action}Body`)}
                </DialogDescription>
                {formFields}
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>
                    {t('cancel')}
                  </Button>
                  <Button
                    variant={action === 'void' ? 'destructive' : 'default'}
                    disabled={busy || note.trim().length === 0}
                    onClick={submit}
                  >
                    {t(`${action}Submit`)}
                  </Button>
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
