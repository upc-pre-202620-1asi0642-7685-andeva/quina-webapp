import { getTranslations } from 'next-intl/server';
import { can } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';
import { countLowStockProducts } from '@/infrastructure/db/queries/catalog';
import { listCollections } from '@/infrastructure/db/queries/collections';
import { formatMoney } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

export type AppNotification = {
  /** Estable mientras el hecho no cambie: así "marcar como leídas" sobrevive a recargar. */
  id: string;
  tone: 'error' | 'warning' | 'info';
  kind:
    | 'overdue'
    | 'dueSoon'
    | 'lowStock'
    | 'plan'
    | 'billed'
    | 'pendingCharge'
    | 'objectedCharge'
    | 'accountAlert';
  title: string;
  body: string;
  href: string;
};

const DUE_SOON_DAYS = 3;
const MAX_PER_KIND = 8;

/**
 * Avisos del panel derivados de lo que ya existe (sin tabla propia): ciclos vencidos,
 * cobros que vencen pronto, stock bajo y prueba o gracia del plan.
 */
export async function loadNotifications(input: {
  storeId: string;
  role: Role;
  now: Date;
  lowStockCount: number;
  trialDaysRemaining: number | null;
  graceDaysRemaining: number | null;
  isReadOnly: boolean;
}): Promise<{ items: AppNotification[]; overdueCount: number }> {
  const t = await getTranslations('Shell.notifications');
  const items: AppNotification[] = [];
  let overdueCount = 0;

  if (input.isReadOnly && can(input.role, 'settings.billing')) {
    items.push({
      id: 'plan:readonly',
      tone: 'error',
      kind: 'plan',
      title: t('readOnlyTitle'),
      body: t('readOnlyBody'),
      href: '/settings/subscription',
    });
  } else if (input.graceDaysRemaining !== null && can(input.role, 'settings.billing')) {
    items.push({
      id: `plan:grace:${input.graceDaysRemaining}`,
      tone: 'warning',
      kind: 'plan',
      title: t('graceTitle'),
      body: t('graceBody', { days: input.graceDaysRemaining }),
      href: '/settings/subscription',
    });
  } else if (
    input.trialDaysRemaining !== null &&
    input.trialDaysRemaining <= DUE_SOON_DAYS &&
    can(input.role, 'settings.billing')
  ) {
    items.push({
      id: `plan:trial:${input.trialDaysRemaining}`,
      tone: 'info',
      kind: 'plan',
      title: t('trialTitle'),
      body: t('trialBody', { days: input.trialDaysRemaining }),
      href: '/settings/subscription',
    });
  }

  if (can(input.role, 'payments.create')) {
    const rows = await listCollections(input.storeId);
    const overdue = rows.filter((row) => row.status === 'OVERDUE');
    overdueCount = overdue.length;
    const soonLimit = input.now.getTime() + DUE_SOON_DAYS * 86_400_000;
    const dueSoon = rows.filter(
      (row) => row.status === 'BILLED' && row.paymentDueDate.getTime() <= soonLimit,
    );
    for (const row of overdue.slice(0, MAX_PER_KIND)) {
      items.push({
        id: `overdue:${row.cycleId}`,
        tone: 'error',
        kind: 'overdue',
        title: t('overdueTitle', { name: row.name }),
        body: t('overdueBody', {
          amount: formatMoney(row.totalDue, row.currency),
          date: formatDate(row.paymentDueDate),
        }),
        href: `/customers/${row.customerId}/cycles/${row.cycleId}`,
      });
    }
    for (const row of dueSoon.slice(0, MAX_PER_KIND)) {
      items.push({
        id: `due:${row.cycleId}`,
        tone: 'warning',
        kind: 'dueSoon',
        title: t('dueSoonTitle', { name: row.name }),
        body: t('dueSoonBody', {
          amount: formatMoney(row.totalDue, row.currency),
          date: formatDate(row.paymentDueDate),
        }),
        href: `/customers/${row.customerId}/cycles/${row.cycleId}`,
      });
    }
  }

  if (input.lowStockCount > 0 && can(input.role, 'stock.read')) {
    items.push({
      id: `lowstock:${input.lowStockCount}`,
      tone: 'warning',
      kind: 'lowStock',
      title: t('lowStockTitle'),
      body: t('lowStockBody', { count: input.lowStockCount }),
      href: '/inventory?filter=low',
    });
  }

  return { items, overdueCount };
}

/** Tienda, stock bajo y avisos: lo usan el layout y el sondeo en vivo (/api/notifications). */
export async function loadStoreNotifications(storeId: string, role: Role, now = new Date()) {
  const [store, lowStockCount] = await Promise.all([
    loadStoreContext(storeId),
    countLowStockProducts(storeId),
  ]);
  const notifications = await loadNotifications({
    storeId,
    role,
    now,
    lowStockCount,
    trialDaysRemaining: store.trialDaysRemaining,
    graceDaysRemaining: store.graceDaysRemaining,
    isReadOnly: store.isReadOnly,
  });
  return { store, lowStockCount, ...notifications };
}
