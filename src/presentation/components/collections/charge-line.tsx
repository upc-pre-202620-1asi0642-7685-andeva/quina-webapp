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
import { Textarea } from '@/presentation/components/ui/textarea';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

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
          <ul className={cn('flex flex-col text-ink-soft', large && 'text-base')}>
            {line.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="truncate">
                  {item.quantity} × {item.name}
                </span>
                <Money amount={item.amount} currency={currency} />
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

      <Dialog open={action !== null} onOpenChange={(open) => (open ? null : setAction(null))}>
        <DialogContent showCloseButton={false} className="rounded-card border-line bg-surface">
          {action ? (
            <>
              <DialogTitle className={cn('text-ink', portalStoreId ? 'text-xl' : 'text-lg')}>
                {t(`${action}Title`)}
              </DialogTitle>
              <DialogDescription
                className={cn('text-ink-soft', portalStoreId ? 'text-base' : 'text-sm')}
              >
                {t(`${action}Body`)}
              </DialogDescription>
              {error ? (
                <Notice tone="error">
                  <p>{t(`errors.${error}`)}</p>
                </Notice>
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
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  size={portalStoreId ? 'lg' : 'default'}
                  onClick={() => setAction(null)}
                  disabled={busy}
                >
                  {t('cancel')}
                </Button>
                <Button
                  variant={action === 'void' ? 'destructive' : 'default'}
                  size={portalStoreId ? 'lg' : 'default'}
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
    </>
  );
}
