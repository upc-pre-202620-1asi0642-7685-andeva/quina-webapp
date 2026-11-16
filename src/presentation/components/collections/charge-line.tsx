'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BanIcon, CheckIcon, MessageSquareWarningIcon } from 'lucide-react';
import type { Currency } from '@/core/domain/shared/money';
import type { CycleDetailLine } from '@/infrastructure/db/queries/collections';
import { Money, formatMoney } from '@/presentation/components/money';
import { Button } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import {
  ChargeActionSheet,
  type ChargeActionContext,
  type ChargeActionKind,
} from './charge-action-sheet';

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
          context={{
            date: line.date,
            amount: line.amount,
            currency,
            items: line.items,
            objectionNote: line.objectionNote,
          }}
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
  context,
}: {
  chargeId: string;
  customerId: string;
  cycleId: string;
  canObject: boolean;
  canResolve: boolean;
  portalStoreId?: string | undefined;
  context: ChargeActionContext;
}) {
  const tStore = useTranslations('Collections.charge');
  const tPortal = useTranslations('Portal.charge');
  const t = (key: string) =>
    portalStoreId && key.startsWith('object') ? tPortal(key) : tStore(key);
  const [action, setAction] = useState<ChargeActionKind | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canObject ? (
          <Button
            variant="secondary"
            size={portalStoreId ? 'lg' : 'sm'}
            className={cn(portalStoreId && 'w-full text-base sm:w-auto')}
            onClick={() => setAction('object')}
          >
            <MessageSquareWarningIcon aria-hidden="true" />
            {t('object')}
          </Button>
        ) : null}
        {canResolve ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setAction('confirm')}>
              <CheckIcon aria-hidden="true" />
              {t('confirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAction('void')}>
              <BanIcon aria-hidden="true" />
              {t('void')}
            </Button>
          </>
        ) : null}
      </div>

      <ChargeActionSheet
        action={action}
        onClose={() => setAction(null)}
        chargeId={chargeId}
        customerId={customerId}
        cycleId={cycleId}
        portalStoreId={portalStoreId}
        context={context}
      />
    </>
  );
}
