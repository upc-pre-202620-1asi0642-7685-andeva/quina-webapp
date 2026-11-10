import { BusinessDate } from '../shared/business-date';

export const PLAN_TIERS = ['CASERO', 'BODEGA_PRO', 'NEGOCIO_PLUS'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PAID_PLAN_TIERS = ['BODEGA_PRO', 'NEGOCIO_PLUS'] as const;
export type PaidPlanTier = (typeof PAID_PLAN_TIERS)[number];

export const BILLING_INTERVALS = ['MONTHLY', 'YEARLY'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export const GRACE_BUSINESS_DAYS = 5;
export const TRIAL_WARNING_DAYS = 3;

/** Lo que importa de `store_subscriptions` para saber qué plan rige y su ciclo de vida. */
export type Subscription = {
  planTier: PlanTier;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  gracePeriodEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  billingInterval?: BillingInterval | null;
  mpPreapprovalId?: string | null;
};

export type Feature =
  'receipts' | 'kardexAverageCost' | 'reportsExport' | 'ai' | 'automaticNotifications';

/** `null` = ilimitado. */
export type PlanQuota = {
  activeCreditCustomers: number | null;
  users: number | null;
  products: number | null;
  receiptsPerMonth: number | null;
  aiQueriesPerMonth: number | null;
};

export const COUNTED_RESOURCES = ['activeCreditCustomers', 'users', 'products'] as const;
export type CountedResource = (typeof COUNTED_RESOURCES)[number];

export type PlanLimit = PlanQuota & { features: Record<Feature, boolean> };

const PRO_FEATURES: Record<Feature, boolean> = {
  receipts: true,
  kardexAverageCost: true,
  reportsExport: true,
  ai: true,
  automaticNotifications: true,
};

/** Único lugar con los límites de cada plan (US26 crit. 1; docs/pricing-strategy.md §3). */
const LIMITS: Record<PlanTier, PlanLimit> = {
  CASERO: {
    activeCreditCustomers: 15,
    users: 1,
    products: 50,
    receiptsPerMonth: 0,
    aiQueriesPerMonth: 0,
    features: {
      receipts: false,
      kardexAverageCost: false,
      reportsExport: false,
      ai: false,
      automaticNotifications: false,
    },
  },
  BODEGA_PRO: {
    activeCreditCustomers: null,
    users: 3,
    products: null,
    receiptsPerMonth: 50,
    aiQueriesPerMonth: 20,
    features: PRO_FEATURES,
  },
  NEGOCIO_PLUS: {
    activeCreditCustomers: null,
    users: null,
    products: null,
    receiptsPerMonth: null,
    aiQueriesPerMonth: 100,
    features: PRO_FEATURES,
  },
};

export const PlanLimits = {
  of(tier: PlanTier): PlanLimit {
    return LIMITS[tier];
  },

  /**
   * Plan que rige hoy. La prueba vencida, el período de gracia vencido y la
   * suscripción cancelada al fin de su ciclo valen como Casero aunque el proceso
   * diario aún no haya actualizado la fila (US23 crit. 4 y 6; US25 crit. 4).
   */
  effectiveTier(subscription: Subscription, now: Date): PlanTier {
    if (subscription.status === 'CANCELED') return 'CASERO';
    if (subscription.status === 'TRIALING') {
      const endsAt = subscription.trialEndsAt;
      return endsAt && endsAt.getTime() > now.getTime() ? subscription.planTier : 'CASERO';
    }
    if (subscription.status === 'PAST_DUE') {
      const graceEnds = subscription.gracePeriodEndsAt;
      return graceEnds && graceEnds.getTime() > now.getTime() ? subscription.planTier : 'CASERO';
    }
    if (
      subscription.status === 'ACTIVE' &&
      subscription.planTier !== 'CASERO' &&
      subscription.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd.getTime() <= now.getTime()
    ) {
      return 'CASERO';
    }
    return subscription.planTier;
  },

  /** Días calendario que restan de la prueba Pro en Lima (US25 crit. 2 y 3); `null` si no aplica. */
  trialDaysRemaining(subscription: Subscription, now: Date): number | null {
    if (subscription.status !== 'TRIALING' || !subscription.trialEndsAt) return null;
    if (subscription.trialEndsAt.getTime() <= now.getTime()) return null;
    const today = BusinessDate.fromInstant(now);
    const endDay = BusinessDate.fromInstant(subscription.trialEndsAt);
    return Math.max(1, BusinessDate.daysBetween(today, endDay));
  },

  /** Días calendario restantes dentro del período de gracia en Lima (US23 crit. 4); `null` si no aplica. */
  graceDaysRemaining(subscription: Subscription, now: Date): number | null {
    if (subscription.status !== 'PAST_DUE' || !subscription.gracePeriodEndsAt) return null;
    if (subscription.gracePeriodEndsAt.getTime() <= now.getTime()) return null;
    const today = BusinessDate.fromInstant(now);
    const endDay = BusinessDate.fromInstant(subscription.gracePeriodEndsAt);
    return Math.max(1, BusinessDate.daysBetween(today, endDay));
  },

  /** ¿Se puede agregar uno más cuando ya hay `current`? */
  canAdd(tier: PlanTier, resource: CountedResource, current: number): boolean {
    const max = LIMITS[tier][resource];
    return max === null || current < max;
  },

  /** ¿El uso actual supera el tope del plan vigente (US26 crit. 7)? */
  isOverLimit(tier: PlanTier, resource: CountedResource, current: number): boolean {
    const max = LIMITS[tier][resource];
    return max !== null && current > max;
  },

  /** Recursos en los que la tienda supera el tope de su plan vigente. */
  overLimitResources(tier: PlanTier, usage: Record<CountedResource, number>): CountedResource[] {
    return COUNTED_RESOURCES.filter((resource) =>
      PlanLimits.isOverLimit(tier, resource, usage[resource]),
    );
  },

  /**
   * D1 (US25 crit. 5, US26 crit. 7): si al vencer la prueba o la gracia la tienda
   * supera algún límite de su plan actual, entra en modo solo lectura hasta que
   * pague un plan superior o desactive los excedentes.
   */
  isReadOnly(tier: PlanTier, usage: Record<CountedResource, number>): boolean {
    return PlanLimits.overLimitResources(tier, usage).length > 0;
  },

  /** Plan más barato que admite uno más cuando ya hay `current`. */
  upgradeFor(resource: CountedResource, current: number): PlanTier | null {
    return PLAN_TIERS.find((tier) => PlanLimits.canAdd(tier, resource, current)) ?? null;
  },

  /** Plan más barato que cubre todo el uso actual (para salir de solo lectura). */
  upgradeForUsage(usage: Record<CountedResource, number>): PaidPlanTier {
    const fitsBodegaPro = COUNTED_RESOURCES.every(
      (r) => !PlanLimits.isOverLimit('BODEGA_PRO', r, usage[r]),
    );
    return fitsBodegaPro ? 'BODEGA_PRO' : 'NEGOCIO_PLUS';
  },

  /** Plan más barato que incluye una función (US26 crit. 5). */
  featureTier(feature: Feature): PlanTier {
    return PLAN_TIERS.find((tier) => LIMITS[tier].features[feature]) ?? 'NEGOCIO_PLUS';
  },

  /** Fin del 5.° día hábil en Lima tras un fallo de pago (US23 crit. 4). */
  gracePeriodEnd(failedAt: Date): Date {
    const failedDay = BusinessDate.fromInstant(failedAt);
    const fifthBusinessDay = BusinessDate.addBusinessDays(failedDay, GRACE_BUSINESS_DAYS);
    return BusinessDate.endInstant(fifthBusinessDay);
  },

  /**
   * Fecha de fin del período pagado en Lima (D3):
   * - Si contrata `BODEGA_PRO` estando en prueba vigente, suma desde `trialEndsAt`
   *   para no quitarle sus días gratuitos restantes.
   * - Si renueva el mismo plan activo, suma desde `currentPeriodEnd`.
   * - En cualquier otro caso (p. ej. subida directa a `NEGOCIO_PLUS`), suma desde `now`.
   */
  nextPeriodEnd(input: {
    subscription: Subscription;
    targetTier: PaidPlanTier;
    interval: BillingInterval;
    now: Date;
  }): Date {
    const { subscription, targetTier, interval, now } = input;
    let baseInstant = now;
    if (
      subscription.status === 'TRIALING' &&
      targetTier === 'BODEGA_PRO' &&
      subscription.trialEndsAt &&
      subscription.trialEndsAt.getTime() > now.getTime()
    ) {
      baseInstant = subscription.trialEndsAt;
    } else if (
      subscription.status === 'ACTIVE' &&
      subscription.planTier === targetTier &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd.getTime() > now.getTime()
    ) {
      baseInstant = subscription.currentPeriodEnd;
    }
    const baseDate = BusinessDate.fromInstant(baseInstant);
    const months = interval === 'YEARLY' ? 12 : 1;
    return BusinessDate.endInstant(BusinessDate.addCalendarMonths(baseDate, months));
  },

  planPriceFor(tier: PaidPlanTier, interval: BillingInterval): string {
    return planPriceFor(tier, interval);
  },
};

/** Precios en soles de docs/pricing-strategy.md; el anual trae 20 % de descuento. */
export const PLAN_PRICES: Record<PlanTier, { monthly: string; annual: string | null }> = {
  CASERO: { monthly: '0.00', annual: null },
  BODEGA_PRO: { monthly: '29.00', annual: '279.00' },
  NEGOCIO_PLUS: { monthly: '69.00', annual: '660.00' },
};

export function planPriceFor(tier: PaidPlanTier, interval: BillingInterval): string {
  return interval === 'YEARLY' ? PLAN_PRICES[tier].annual! : PLAN_PRICES[tier].monthly;
}
