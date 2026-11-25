import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import type { PortalLink } from '@/core/domain/ports/portal-directory';
import { type Currency } from '@/core/domain/shared/money';
import { getPortalAccount, type PortalAccount } from '@/infrastructure/db/queries/portal';
import { creditCharges } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { formatMoney } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import type { AppNotification } from '@/presentation/queries/notifications';

const DUE_SOON_MS = 3 * 86_400_000;
const MAX_CHARGES_PER_STORE = 4;

export type PortalChargeAlert = {
  storeId: string;
  storeName: string;
  chargeId: string;
  cycleId: string;
  amount: string;
  currency: Currency;
  consentStatus: 'PENDING' | 'OBJECTED';
  consentDeadline: Date | null;
};

export type PortalNotificationMessages = {
  overdueTitle: (params: { store: string }) => string;
  overdueBody: (params: { amount: string; date: string }) => string;
  dueSoonTitle: (params: { store: string }) => string;
  dueSoonBody: (params: { amount: string; date: string }) => string;
  billedTitle: (params: { store: string }) => string;
  billedBody: (params: { amount: string; date: string }) => string;
  pendingChargeTitle: (params: { store: string }) => string;
  pendingChargeBody: (params: { amount: string; date: string }) => string;
  objectedChargeTitle: (params: { store: string }) => string;
  objectedChargeBody: (params: { amount: string }) => string;
  blockedTitle: (params: { store: string }) => string;
  blockedBody: () => string;
  bouncedTitle: (params: { store: string }) => string;
  bouncedBody: () => string;
};

/** Deriva avisos accionables del vecino sin tabla propia (mismo patrón que bodega). */
export function buildPortalNotifications(
  accounts: PortalAccount[],
  chargeAlerts: PortalChargeAlert[],
  now: Date,
  m: PortalNotificationMessages,
): AppNotification[] {
  const items: AppNotification[] = [];
  const soonLimit = now.getTime() + DUE_SOON_MS;

  for (const portal of accounts) {
    const account = portal.account;
    if (account?.payable) {
      const { cycleId, totalDue, paymentDueDate, status } = account.payable;
      const amount = formatMoney(totalDue, account.currency);
      const date = formatDate(paymentDueDate);
      const href = `/portal/${portal.storeId}/cycles/${cycleId}`;

      if (status === 'OVERDUE') {
        items.push({
          id: `portal:overdue:${cycleId}`,
          tone: 'error',
          kind: 'overdue',
          title: m.overdueTitle({ store: portal.storeName }),
          body: m.overdueBody({ amount, date }),
          href,
        });
      } else if (paymentDueDate.getTime() <= soonLimit) {
        items.push({
          id: `portal:duesoon:${cycleId}`,
          tone: 'warning',
          kind: 'dueSoon',
          title: m.dueSoonTitle({ store: portal.storeName }),
          body: m.dueSoonBody({ amount, date }),
          href,
        });
      } else {
        items.push({
          id: `portal:billed:${cycleId}`,
          tone: 'info',
          kind: 'billed',
          title: m.billedTitle({ store: portal.storeName }),
          body: m.billedBody({ amount, date }),
          href,
        });
      }
    }

    if (account && account.status !== 'ACTIVE') {
      items.push({
        id: `portal:blocked:${portal.storeId}`,
        tone: 'warning',
        kind: 'accountAlert',
        title: m.blockedTitle({ store: portal.storeName }),
        body: m.blockedBody(),
        href: `/portal/${portal.storeId}`,
      });
    }

    if (portal.emailBouncedAt) {
      items.push({
        id: `portal:bounced:${portal.storeId}`,
        tone: 'warning',
        kind: 'accountAlert',
        title: m.bouncedTitle({ store: portal.storeName }),
        body: m.bouncedBody(),
        href: `/portal/${portal.storeId}/store`,
      });
    }
  }

  for (const alert of chargeAlerts) {
    const amount = formatMoney(alert.amount, alert.currency);
    const href = `/portal/${alert.storeId}/cycles/${alert.cycleId}`;
    if (alert.consentStatus === 'OBJECTED') {
      items.push({
        id: `portal:objected:${alert.chargeId}`,
        tone: 'warning',
        kind: 'objectedCharge',
        title: m.objectedChargeTitle({ store: alert.storeName }),
        body: m.objectedChargeBody({ amount }),
        href,
      });
    } else if (alert.consentDeadline) {
      items.push({
        id: `portal:pending:${alert.chargeId}`,
        tone: 'info',
        kind: 'pendingCharge',
        title: m.pendingChargeTitle({ store: alert.storeName }),
        body: m.pendingChargeBody({ amount, date: formatDate(alert.consentDeadline) }),
        href,
      });
    }
  }

  return items;
}

/** Carga cuentas y avisos del vecino autenticado respetando RLS por tienda. */
export async function loadPortalNotifications(
  links: PortalLink[],
  now = new Date(),
): Promise<{ accounts: PortalAccount[]; items: AppNotification[] }> {
  if (links.length === 0) return { accounts: [], items: [] };

  const t = await getTranslations('Portal.notifications');
  const resolved = await Promise.all(
    links.map(async (link) => {
      const portal = await getPortalAccount(link, now);
      if (!portal) return null;

      let alerts: PortalChargeAlert[] = [];
      if (portal.account) {
        const accountId = portal.account.id;
        const currency = portal.account.currency;
        const rows = await withTenant(link.storeId, async (tx) => {
          const [pending, objected] = await Promise.all([
            tx
              .select({
                id: creditCharges.id,
                cycleId: creditCharges.settlementCycleId,
                amount: creditCharges.principalAmount,
                consentDeadline: creditCharges.consentDeadline,
              })
              .from(creditCharges)
              .where(
                and(
                  eq(creditCharges.creditAccountId, accountId),
                  eq(creditCharges.consentStatus, 'PENDING'),
                  ne(creditCharges.status, 'VOIDED'),
                  ne(creditCharges.status, 'PAID'),
                  gt(creditCharges.consentDeadline, now),
                ),
              )
              .orderBy(desc(creditCharges.purchaseDate))
              .limit(MAX_CHARGES_PER_STORE),
            tx
              .select({
                id: creditCharges.id,
                cycleId: creditCharges.settlementCycleId,
                amount: creditCharges.principalAmount,
              })
              .from(creditCharges)
              .where(
                and(
                  eq(creditCharges.creditAccountId, accountId),
                  eq(creditCharges.consentStatus, 'OBJECTED'),
                  ne(creditCharges.status, 'VOIDED'),
                  ne(creditCharges.status, 'PAID'),
                ),
              )
              .orderBy(desc(creditCharges.purchaseDate))
              .limit(MAX_CHARGES_PER_STORE),
          ]);
          return { pending, objected };
        });

        alerts = [
          ...rows.objected.map((r) => ({
            storeId: portal.storeId,
            storeName: portal.storeName,
            chargeId: r.id,
            cycleId: r.cycleId,
            amount: r.amount,
            currency,
            consentStatus: 'OBJECTED' as const,
            consentDeadline: null,
          })),
          ...rows.pending.map((r) => ({
            storeId: portal.storeId,
            storeName: portal.storeName,
            chargeId: r.id,
            cycleId: r.cycleId,
            amount: r.amount,
            currency,
            consentStatus: 'PENDING' as const,
            consentDeadline: r.consentDeadline,
          })),
        ];
      }

      return { portal, alerts };
    }),
  );

  const valid = resolved.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const accounts = valid.map((v) => v.portal);
  const allAlerts = valid.flatMap((v) => v.alerts);

  const items = buildPortalNotifications(accounts, allAlerts, now, {
    overdueTitle: (p) => t('overdueTitle', p),
    overdueBody: (p) => t('overdueBody', p),
    dueSoonTitle: (p) => t('dueSoonTitle', p),
    dueSoonBody: (p) => t('dueSoonBody', p),
    billedTitle: (p) => t('billedTitle', p),
    billedBody: (p) => t('billedBody', p),
    pendingChargeTitle: (p) => t('pendingChargeTitle', p),
    pendingChargeBody: (p) => t('pendingChargeBody', p),
    objectedChargeTitle: (p) => t('objectedChargeTitle', p),
    objectedChargeBody: (p) => t('objectedChargeBody', p),
    blockedTitle: (p) => t('blockedTitle', p),
    blockedBody: () => t('blockedBody'),
    bouncedTitle: (p) => t('bouncedTitle', p),
    bouncedBody: () => t('bouncedBody'),
  });

  return { accounts, items };
}
