import type { PushPayload } from '../ports/push-notifier';
import type { Locale } from '../shared/locale';
import { Money, type Currency } from '../shared/money';

const CURRENCY_SYMBOL: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

function formatPushMoney(amount: string, currency: Currency): string {
  const [integer = '0', decimals = '00'] = Money.of(amount, currency).toFixed2().split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${CURRENCY_SYMBOL[currency]} ${grouped}.${decimals}`;
}

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

export function buildTestPushPayload(
  locale: Locale,
  storeName: string,
  url = '/app/profile/preferences',
): PushPayload {
  if (locale === 'en') {
    return {
      title: `Quina · ${storeName}`,
      body: 'Push alerts are active on this device.',
      url,
      tag: 'quina-push-test',
    };
  }
  if (locale === 'qu') {
    return {
      title: `Quina · ${storeName}`,
      body: "Kay celularpi willakuykunaqa llamk'achkanñam.",
      url,
      tag: 'quina-push-test',
    };
  }
  return {
    title: `Quina · ${storeName}`,
    body: '¡Listo! Los avisos en este celular ya están activos.',
    url,
    tag: 'quina-push-test',
  };
}

export type PortalPushNoticeKind =
  'charge-digest' | 'cycle-statement' | 'payment-reminder' | 'late-payment' | 'payment-receipt';

export function buildPortalCreditSalePushPayload(
  locale: Locale,
  input: { storeName: string; storeId: string; saleId: string; total: string; currency: Currency },
): PushPayload {
  const amount = formatPushMoney(input.total, input.currency);
  const url = `/app/portal/${input.storeId}`;
  const tag = `quina-portal-sale-${input.saleId}`;
  if (locale === 'en') {
    return {
      title: `Quina · New credit purchase (${input.storeName})`,
      body: `Recorded ${amount} on your credit tab. Tap to review it in your portal.`,
      url,
      tag,
    };
  }
  if (locale === 'qu') {
    return {
      title: `Quina · Musuq fiado (${input.storeName})`,
      body: `${amount} rantikuyta qillqarqanku. Portalniykipi qhaway.`,
      url,
      tag,
    };
  }
  return {
    title: `Quina · Nuevo fiado en ${input.storeName}`,
    body: `Se anotó una compra por ${amount}. Toca para revisarla en tu portal.`,
    url,
    tag,
  };
}

export function buildPortalChargeResolutionPushPayload(
  locale: Locale,
  input: {
    outcome: 'confirmed' | 'voided';
    storeName: string;
    storeId: string;
    cycleId: string;
  },
): PushPayload {
  const url = `/app/portal/${input.storeId}/cycles/${input.cycleId}`;
  const tag = `quina-portal-resolution-${input.cycleId}`;
  if (locale === 'en') {
    return input.outcome === 'voided'
      ? {
          title: `Quina · Charge voided (${input.storeName})`,
          body: 'The store accepted your report and removed that charge from your tab.',
          url,
          tag,
        }
      : {
          title: `Quina · Report reviewed (${input.storeName})`,
          body: 'The store reviewed your report and left a note on your statement.',
          url,
          tag,
        };
  }
  if (locale === 'qu') {
    return input.outcome === 'voided'
      ? {
          title: `Quina · Ranti qullusqa (${input.storeName})`,
          body: 'Qhatuqa willakuyniykita chaskispa chay fiadota qullurqan.',
          url,
          tag,
        }
      : {
          title: `Quina · Willakuy qhawasqa (${input.storeName})`,
          body: 'Qhatuqa willakuyniykita qhawarqanñam. Estadoykipi qhaway.',
          url,
          tag,
        };
  }
  return input.outcome === 'voided'
    ? {
        title: `Quina · Compra anulada (${input.storeName})`,
        body: 'La tienda aceptó tu observación y descontó ese cargo de tu cuenta.',
        url,
        tag,
      }
    : {
        title: `Quina · Observación revisada (${input.storeName})`,
        body: 'La tienda revisó tu observación y dejó su respuesta en tu estado de cuenta.',
        url,
        tag,
      };
}

export function buildPortalNoticePushPayload(
  locale: Locale,
  input: {
    kind: PortalPushNoticeKind;
    storeName: string;
    storeId: string;
    total: string;
    currency: Currency;
    cycleId?: string;
    paymentId?: string;
    receiptNumber?: string;
  },
): PushPayload {
  const amount = formatPushMoney(input.total, input.currency);
  const tag = `quina-portal-${input.kind}-${input.paymentId ?? input.cycleId ?? input.storeId}`;

  if (input.kind === 'charge-digest') {
    const url = `/app/portal/${input.storeId}`;
    if (locale === 'en') {
      return {
        title: `Quina · Credit summary (${input.storeName})`,
        body: `Your recent credit purchases total ${amount}. Review them in your portal.`,
        url,
        tag,
      };
    }
    if (locale === 'qu') {
      return {
        title: `Quina · Fiado resumen (${input.storeName})`,
        body: `${amount} rantikuykunaykiqa portalniykipi kachkanñam.`,
        url,
        tag,
      };
    }
    return {
      title: `Quina · Resumen de tu fiado (${input.storeName})`,
      body: `Tus compras recientes suman ${amount}. Revísalas en tu portal.`,
      url,
      tag,
    };
  }

  if (input.kind === 'cycle-statement') {
    const url = input.cycleId
      ? `/app/portal/${input.storeId}/cycles/${input.cycleId}`
      : `/app/portal/${input.storeId}/cycles`;
    if (locale === 'en') {
      return {
        title: `Quina · Statement ready (${input.storeName})`,
        body: `Your cycle closed for ${amount}. Tap to see due date and payment options.`,
        url,
        tag,
      };
    }
    if (locale === 'qu') {
      return {
        title: `Quina · Cuenta estado (${input.storeName})`,
        body: `Cicloykiqa ${amount} qullqiwan wichqakun. Hayk'aq pagayta qhaway.`,
        url,
        tag,
      };
    }
    return {
      title: `Quina · Estado de cuenta (${input.storeName})`,
      body: `Cerró tu ciclo por ${amount}. Mira la fecha de pago y cómo abonar.`,
      url,
      tag,
    };
  }

  if (input.kind === 'payment-reminder') {
    const url = `/app/portal/${input.storeId}/pay`;
    if (locale === 'en') {
      return {
        title: `Quina · Payment reminder (${input.storeName})`,
        body: `Your balance of ${amount} is due soon. Check payment details in Quina.`,
        url,
        tag,
      };
    }
    if (locale === 'qu') {
      return {
        title: `Quina · Pagay yuyarichiy (${input.storeName})`,
        body: `${amount} pagayniykiqa qayllamuchkanñam. Imayna pagayta qhaway.`,
        url,
        tag,
      };
    }
    return {
      title: `Quina · Recordatorio de pago (${input.storeName})`,
      body: `Falta poco para la fecha de pago (${amount}). Revisa Yape, Plin o cuenta aquí.`,
      url,
      tag,
    };
  }

  if (input.kind === 'late-payment') {
    const url = `/app/portal/${input.storeId}/pay`;
    if (locale === 'en') {
      return {
        title: `Quina · Overdue balance (${input.storeName})`,
        body: `You have an overdue balance of ${amount}. Tap to see how to catch up.`,
        url,
        tag,
      };
    }
    if (locale === 'qu') {
      return {
        title: `Quina · Pasasqa pagay (${input.storeName})`,
        body: `${amount} pasasqa manuyki kachkan. Imayna pagayta qhaway.`,
        url,
        tag,
      };
    }
    return {
      title: `Quina · Pago vencido (${input.storeName})`,
      body: `Tienes ${amount} pendiente de pago. Toca para ver los datos de cobro.`,
      url,
      tag,
    };
  }

  // payment-receipt
  const url = input.paymentId
    ? `/app/portal/${input.storeId}/payments/${input.paymentId}`
    : `/app/portal/${input.storeId}/cycles`;
  const receipt = input.receiptNumber ? `${input.receiptNumber} · ` : '';
  if (locale === 'en') {
    return {
      title: `Quina · Payment confirmed (${input.storeName})`,
      body: `Receipt ${receipt}${amount} was recorded by the store.`,
      url,
      tag,
    };
  }
  if (locale === 'qu') {
    return {
      title: `Quina · Pagay chaskisqa (${input.storeName})`,
      body: `Recibo ${receipt}${amount} qhatupi qillqasqañam.`,
      url,
      tag,
    };
  }
  return {
    title: `Quina · Pago registrado (${input.storeName})`,
    body: `La tienda confirmó tu abono (${receipt}${amount}). Toca para ver tu recibo.`,
    url,
    tag,
  };
}
