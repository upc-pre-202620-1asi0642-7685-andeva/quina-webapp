import type { PushPayload } from '../ports/push-notifier';
import type { Locale } from '../shared/locale';

export type DailyPushAlerts = {
  storeName: string;
  overdueCount: number;
  dueSoonCount: number;
  lowStockCount: number;
  isReadOnly: boolean;
  graceDaysRemaining: number | null;
  trialDaysRemaining: number | null;
  canViewBilling: boolean;
  canViewCollections: boolean;
  canViewStock: boolean;
};

type DailyCopy = {
  title: string;
  overdue: (n: number) => string;
  dueSoon: (n: number) => string;
  lowStock: (n: number) => string;
  readOnly: string;
  grace: (days: number) => string;
  trial: (days: number) => string;
};

const DAILY_COPY: Record<Locale, DailyCopy> = {
  es: {
    title: 'Quina · Resumen del día',
    overdue: (n) => (n === 1 ? '1 cobro vencido' : `${n} cobros vencidos`),
    dueSoon: (n) => (n === 1 ? '1 cobro por vencer' : `${n} cobros por vencer`),
    lowStock: (n) => (n === 1 ? '1 producto por agotarse' : `${n} productos por agotarse`),
    readOnly: 'Tu tienda está en solo lectura',
    grace: (days) =>
      days === 1 ? 'Queda 1 día de gracia de tu plan' : `Quedan ${days} días de gracia de tu plan`,
    trial: (days) =>
      days === 0
        ? 'Tu prueba Pro termina hoy'
        : days === 1
          ? 'Queda 1 día de tu prueba Pro'
          : `Quedan ${days} días de tu prueba Pro`,
  },
  en: {
    title: 'Quina · Daily summary',
    overdue: (n) => (n === 1 ? '1 overdue payment' : `${n} overdue payments`),
    dueSoon: (n) => (n === 1 ? '1 payment due soon' : `${n} payments due soon`),
    lowStock: (n) => (n === 1 ? '1 product low on stock' : `${n} products low on stock`),
    readOnly: 'Your store is in read-only mode',
    grace: (days) =>
      days === 1 ? '1 grace day left on your plan' : `${days} grace days left on your plan`,
    trial: (days) =>
      days === 0
        ? 'Your Pro trial ends today'
        : days === 1
          ? '1 day left on your Pro trial'
          : `${days} days left on your Pro trial`,
  },
  qu: {
    title: 'Quina · Punchaw willakuy',
    overdue: (n) => (n === 1 ? '1 cobro pasasqa' : `${n} cobrokuna pasasqa`),
    dueSoon: (n) => (n === 1 ? '1 cobro qayllapi' : `${n} cobrokuna qayllapi`),
    lowStock: (n) => (n === 1 ? '1 ranti pisi stockwan' : `${n} rantikuna pisi stockwan`),
    readOnly: 'Tiendayki ñawinchanallapaqmi',
    grace: (days) => `${days} punchaw puchun planniykipaq`,
    trial: (days) =>
      days === 0 ? 'Pro pruebayki kunan tukukun' : `${days} punchaw Pro pruebaykimanta puchun`,
  },
};

/**
 * Construye el aviso matutino del bodeguero según sus permisos y en su idioma.
 * Devuelve `null` si no hay pendientes accionables.
 */
export function buildDailyPushPayload(
  locale: Locale,
  alerts: DailyPushAlerts,
  dateIso: string,
): PushPayload | null {
  const copy = DAILY_COPY[locale];
  const parts: string[] = [];
  let url = '/app';

  if (alerts.canViewCollections) {
    if (alerts.overdueCount > 0) {
      parts.push(copy.overdue(alerts.overdueCount));
      url = '/app/collections';
    }
    if (alerts.dueSoonCount > 0) {
      parts.push(copy.dueSoon(alerts.dueSoonCount));
      if (url === '/app') url = '/app/collections';
    }
  }

  if (alerts.canViewStock && alerts.lowStockCount > 0) {
    parts.push(copy.lowStock(alerts.lowStockCount));
    if (url === '/app') url = '/app/inventory?filter=low';
  }

  if (alerts.canViewBilling) {
    if (alerts.isReadOnly) {
      parts.push(copy.readOnly);
      if (url === '/app') url = '/app/settings/subscription';
    } else if (alerts.graceDaysRemaining !== null) {
      parts.push(copy.grace(alerts.graceDaysRemaining));
      if (url === '/app') url = '/app/settings/subscription';
    } else if (alerts.trialDaysRemaining !== null && alerts.trialDaysRemaining <= 3) {
      parts.push(copy.trial(alerts.trialDaysRemaining));
      if (url === '/app') url = '/app/settings/subscription';
    }
  }

  if (parts.length === 0) return null;

  return {
    title: `${copy.title} · ${alerts.storeName}`,
    body: parts.join(' · '),
    url,
    tag: `quina-daily-${dateIso}`,
  };
}

export function buildChargeObjectedPushPayload(
  locale: Locale,
  input: { customerName: string; storeName: string; customerId: string; cycleId: string },
): PushPayload {
  const url = `/app/customers/${input.customerId}/cycles/${input.cycleId}`;
  if (locale === 'en') {
    return {
      title: `Quina · Charge flagged (${input.storeName})`,
      body: `${input.customerName} flagged a credit charge from the portal. Tap to review.`,
      url,
      tag: `quina-objection-${input.cycleId}`,
    };
  }
  if (locale === 'qu') {
    return {
      title: `Quina · Ranti qhawasqa (${input.storeName})`,
      body: `${input.customerName} huk fiadota mana riqsinichu nirqa. Qhawanaykipaq ñit'iy.`,
      url,
      tag: `quina-objection-${input.cycleId}`,
    };
  }
  return {
    title: `Quina · Cargo observado (${input.storeName})`,
    body: `${input.customerName} observó una compra fiada desde su portal. Toca para revisar.`,
    url,
    tag: `quina-objection-${input.cycleId}`,
  };
}

export function buildTestPushPayload(locale: Locale, storeName: string): PushPayload {
  if (locale === 'en') {
    return {
      title: `Quina · ${storeName}`,
      body: 'Push alerts are active on this device.',
      url: '/app/profile/preferences',
      tag: 'quina-push-test',
    };
  }
  if (locale === 'qu') {
    return {
      title: `Quina · ${storeName}`,
      body: "Kay celularpi willakuykunaqa llamk'achkanñam.",
      url: '/app/profile/preferences',
      tag: 'quina-push-test',
    };
  }
  return {
    title: `Quina · ${storeName}`,
    body: '¡Listo! Los avisos en este celular ya están activos.',
    url: '/app/profile/preferences',
    tag: 'quina-push-test',
  };
}
