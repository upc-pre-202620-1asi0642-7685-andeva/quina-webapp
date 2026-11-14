import { z } from 'zod';
import { PlanLimits, type Feature, type PlanTier } from '@/core/domain/billing/plan-limits';
import { can, type Permission } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';

/** Widgets de Inicio, en el orden en que se ofrecen al agregarlos. */
export const WIDGET_IDS = [
  'quickActions',
  'collect',
  'cashToday',
  'salesWeek',
  'moneyOut',
  'lowStock',
  'riskCustomers',
  'rus',
  'plan',
  'monthSummary',
  'purchaseDrafts',
  'notices',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

type WidgetDefinition = {
  /** Sin permiso, el widget no existe para ese rol (US05). */
  permission?: Permission;
  /** Función del plan que exige (mismo candado que la pantalla de origen). */
  feature?: Feature;
  /** Ocupa todo el ancho de la grilla en escritorio. */
  wide?: boolean;
};

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  quickActions: { wide: true },
  collect: { permission: 'payments.create' },
  cashToday: { permission: 'reports.view' },
  salesWeek: { permission: 'reports.view' },
  moneyOut: { permission: 'reports.view' },
  lowStock: { permission: 'stock.read' },
  riskCustomers: { permission: 'reports.view' },
  rus: { permission: 'rus.view' },
  plan: { permission: 'settings.billing' },
  monthSummary: { permission: 'reports.view', feature: 'reportsExport' },
  purchaseDrafts: { permission: 'purchases.manage' },
  notices: { permission: 'notifications.send' },
};

/** Lo que cada rol ve el primer día; el resto queda para "Agregar widget". */
const DEFAULT_VISIBLE: Record<'owner' | 'employee', WidgetId[]> = {
  owner: [
    'quickActions',
    'collect',
    'cashToday',
    'salesWeek',
    'moneyOut',
    'lowStock',
    'riskCustomers',
    'rus',
    'plan',
  ],
  employee: ['quickActions', 'collect', 'lowStock'],
};

export type LayoutEntry = { id: WidgetId; visible: boolean };

export const layoutSchema = z
  .array(z.object({ id: z.enum(WIDGET_IDS), visible: z.boolean() }))
  .max(WIDGET_IDS.length)
  .refine((entries) => new Set(entries.map((e) => e.id)).size === entries.length);

export function availableWidgets(role: Role, tier: PlanTier): WidgetId[] {
  const features = PlanLimits.of(tier).features;
  return WIDGET_IDS.filter((id) => {
    const { permission, feature } = WIDGETS[id];
    return (!permission || can(role, permission)) && (!feature || features[feature]);
  });
}

/**
 * Diseño efectivo de Inicio: el guardado (o el del rol), sin widgets que el rol
 * o el plan ya no permiten, y con los widgets nuevos al final como ocultos.
 */
export function resolveLayout(saved: unknown, role: Role, tier: PlanTier): LayoutEntry[] {
  const allowed = availableWidgets(role, tier);
  const parsed = layoutSchema.safeParse(saved);
  const base: LayoutEntry[] = parsed.success
    ? parsed.data
    : DEFAULT_VISIBLE[role === 'STORE_OWNER' ? 'owner' : 'employee'].map((id) => ({
        id,
        visible: true,
      }));
  const kept = base.filter((entry) => allowed.includes(entry.id));
  const missing = allowed
    .filter((id) => !kept.some((entry) => entry.id === id))
    .map((id) => ({ id, visible: false }));
  return [...kept, ...missing];
}
