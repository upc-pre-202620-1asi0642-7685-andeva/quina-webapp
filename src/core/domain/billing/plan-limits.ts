export const PLAN_TIERS = ['CASERO', 'BODEGA_PRO', 'NEGOCIO_PLUS'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

/** Lo que importa de `store_subscriptions` para saber qué plan rige. */
export type Subscription = {
  planTier: PlanTier;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
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

export type CountedResource = 'activeCreditCustomers' | 'users' | 'products';

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
   * Plan que rige hoy. La prueba vencida y la suscripción cancelada valen como
   * Casero aunque el proceso diario aún no haya actualizado la fila (US25 crit. 4).
   */
  effectiveTier(subscription: Subscription, now: Date): PlanTier {
    if (subscription.status === 'CANCELED') return 'CASERO';
    if (subscription.status === 'TRIALING') {
      const endsAt = subscription.trialEndsAt;
      return endsAt && endsAt.getTime() > now.getTime() ? subscription.planTier : 'CASERO';
    }
    return subscription.planTier;
  },

  /** ¿Se puede agregar uno más cuando ya hay `current`? */
  canAdd(tier: PlanTier, resource: CountedResource, current: number): boolean {
    const max = LIMITS[tier][resource];
    return max === null || current < max;
  },

  /** Plan más barato que admite uno más cuando ya hay `current`. */
  upgradeFor(resource: CountedResource, current: number): PlanTier | null {
    return PLAN_TIERS.find((tier) => PlanLimits.canAdd(tier, resource, current)) ?? null;
  },

  /** Plan más barato que incluye una función (US26 crit. 5). */
  featureTier(feature: Feature): PlanTier {
    return PLAN_TIERS.find((tier) => LIMITS[tier].features[feature]) ?? 'NEGOCIO_PLUS';
  },
};

/** Precios en soles de docs/pricing-strategy.md; el anual trae 20 % de descuento. */
export const PLAN_PRICES: Record<PlanTier, { monthly: string; annual: string | null }> = {
  CASERO: { monthly: '0.00', annual: null },
  BODEGA_PRO: { monthly: '29.00', annual: '279.00' },
  NEGOCIO_PLUS: { monthly: '69.00', annual: '660.00' },
};
