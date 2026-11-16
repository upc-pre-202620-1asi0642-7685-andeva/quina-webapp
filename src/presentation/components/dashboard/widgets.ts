import { z } from 'zod';
import { PlanLimits, type Feature, type PlanTier } from '@/core/domain/billing/plan-limits';
import { can, type Permission } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';

/** Tamaños Bento en escritorio (sobre una grilla densa de 3 columnas). */
export const WIDGET_SIZES = ['sm', 'md', 'lg'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

/** Columnas permitidas en la grilla Bento de 3 columnas (1 = Chico, 2 = Mediano, 3 = Grande). */
export const WIDGET_COLS = [1, 2, 3] as const;
export type WidgetCols = (typeof WIDGET_COLS)[number];

/** Filas verticales permitidas en la grilla Bento 2D (1 = compacta, 2 = extendida). */
export const WIDGET_ROWS = [1, 2] as const;
export type WidgetRows = (typeof WIDGET_ROWS)[number];

export const SIZE_TO_COLS: Record<WidgetSize, WidgetCols> = {
  sm: 1,
  md: 2,
  lg: 3,
};

export const COLS_TO_SIZE: Record<WidgetCols, WidgetSize> = {
  1: 'sm',
  2: 'md',
  3: 'lg',
};

/** Categorías visibles al explorar y agregar widgets al Dashboard. */
export const WIDGET_CATEGORIES = ['counter', 'charts', 'portfolio', 'operations'] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

/** Widgets del Dashboard, en el orden en que se ofrecen al agregarlos. */
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
  'cashFlow',
  'salesByMethod',
  'portfolioTrend',
  'marginTrend',
  'topProducts',
  'recentSales',
  'collectionsHealth',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export type WidgetDefinition = {
  /** Sin permiso, el widget no existe para ese rol (US05). */
  permission?: Permission;
  /** Función del plan que exige (mismo candado que la pantalla de origen, US26). */
  feature?: Feature;
  /** Categoría para agrupar dentro de "Agregar widget". */
  category: WidgetCategory;
  /** Tamaños de ancho permitidos en la grilla Bento de escritorio. */
  sizes: readonly WidgetSize[];
  /** Tamaño de ancho inicial. */
  defaultSize: WidgetSize;
  /** Columnas permitidas en escritorio (2 = 1/3, 3 = 1/2, 6 = completo). */
  cols: readonly WidgetCols[];
  /** Columnas iniciales en escritorio. */
  defaultCols: WidgetCols;
  /** Filas de alto permitidas en escritorio (1 = compacta, 2 = extendida). */
  rows: readonly WidgetRows[];
  /** Filas de alto iniciales en escritorio. */
  defaultRows: WidgetRows;
};

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  quickActions: {
    category: 'counter',
    sizes: ['md', 'lg'],
    defaultSize: 'lg',
    cols: [2, 3],
    defaultCols: 3,
    rows: [1],
    defaultRows: 1,
  },
  collect: {
    permission: 'payments.create',
    category: 'portfolio',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  cashToday: {
    permission: 'reports.view',
    category: 'counter',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1],
    defaultRows: 1,
  },
  salesWeek: {
    permission: 'reports.view',
    category: 'charts',
    sizes: ['sm', 'md', 'lg'],
    defaultSize: 'sm',
    cols: [1, 2, 3],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  moneyOut: {
    permission: 'reports.view',
    category: 'portfolio',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1],
    defaultRows: 1,
  },
  lowStock: {
    permission: 'stock.read',
    category: 'operations',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  riskCustomers: {
    permission: 'reports.view',
    category: 'portfolio',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  rus: {
    permission: 'rus.view',
    category: 'operations',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1],
    defaultRows: 1,
  },
  plan: {
    permission: 'settings.billing',
    category: 'operations',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1],
    defaultRows: 1,
  },
  monthSummary: {
    permission: 'reports.view',
    feature: 'reportsExport',
    category: 'charts',
    sizes: ['sm'],
    defaultSize: 'sm',
    cols: [1],
    defaultCols: 1,
    rows: [1],
    defaultRows: 1,
  },
  purchaseDrafts: {
    permission: 'purchases.manage',
    category: 'operations',
    sizes: ['sm'],
    defaultSize: 'sm',
    cols: [1],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  notices: {
    permission: 'notifications.send',
    category: 'counter',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  cashFlow: {
    permission: 'reports.view',
    category: 'charts',
    sizes: ['md', 'lg'],
    defaultSize: 'md',
    cols: [2, 3],
    defaultCols: 2,
    rows: [1, 2],
    defaultRows: 2,
  },
  salesByMethod: {
    permission: 'reports.view',
    category: 'charts',
    sizes: ['sm', 'md', 'lg'],
    defaultSize: 'md',
    cols: [1, 2, 3],
    defaultCols: 2,
    rows: [1, 2],
    defaultRows: 1,
  },
  portfolioTrend: {
    permission: 'reports.view',
    category: 'charts',
    sizes: ['md', 'lg'],
    defaultSize: 'md',
    cols: [2, 3],
    defaultCols: 2,
    rows: [1, 2],
    defaultRows: 2,
  },
  marginTrend: {
    permission: 'reports.view',
    feature: 'reportsExport',
    category: 'charts',
    sizes: ['md', 'lg'],
    defaultSize: 'lg',
    cols: [2, 3],
    defaultCols: 3,
    rows: [1, 2],
    defaultRows: 2,
  },
  topProducts: {
    permission: 'reports.view',
    category: 'operations',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  recentSales: {
    permission: 'reports.view',
    category: 'counter',
    sizes: ['sm'],
    defaultSize: 'sm',
    cols: [1],
    defaultCols: 1,
    rows: [1, 2],
    defaultRows: 1,
  },
  collectionsHealth: {
    permission: 'reports.view',
    category: 'portfolio',
    sizes: ['sm', 'md'],
    defaultSize: 'sm',
    cols: [1, 2],
    defaultCols: 1,
    rows: [1],
    defaultRows: 1,
  },
};

/** Clases de expansión en escritorio para la grilla de 3 columnas (1 = Chico, 2 = Mediano, 3 = Grande). */
export const BENTO_SPAN_CLASS: Record<WidgetSize, string> = {
  sm: 'md:col-span-1 xl:col-span-1',
  md: 'md:col-span-2 xl:col-span-2',
  lg: 'md:col-span-2 xl:col-span-3',
};

/** Clases de expansión vertical en escritorio para el Bento 2D. */
export const BENTO_ROW_CLASS: Record<WidgetRows, string> = {
  1: 'xl:row-span-1',
  2: 'xl:row-span-2',
};

/** Lo que cada rol ve el primer día; los widgets nuevos quedan listos en "Agregar widget". */
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

export type PresetId = 'daily' | 'financial' | 'complete';

export type PresetItem = { id: WidgetId; size: WidgetSize; rows?: WidgetRows };

/** Plantillas listas para reconfigurar el Bento en un toque, filtradas luego por rol y plan. */
export const LAYOUT_PRESETS: Record<PresetId, readonly PresetItem[]> = {
  daily: [
    { id: 'quickActions', size: 'lg', rows: 1 },
    { id: 'collect', size: 'sm', rows: 2 },
    { id: 'cashToday', size: 'sm', rows: 1 },
    { id: 'recentSales', size: 'sm', rows: 1 },
    { id: 'lowStock', size: 'md', rows: 1 },
    { id: 'notices', size: 'md', rows: 1 },
  ],
  financial: [
    { id: 'cashFlow', size: 'lg', rows: 2 },
    { id: 'salesWeek', size: 'md', rows: 2 },
    { id: 'salesByMethod', size: 'md', rows: 2 },
    { id: 'marginTrend', size: 'lg', rows: 2 },
    { id: 'moneyOut', size: 'sm', rows: 1 },
    { id: 'collectionsHealth', size: 'sm', rows: 1 },
    { id: 'rus', size: 'sm', rows: 1 },
  ],
  complete: [
    { id: 'quickActions', size: 'lg', rows: 1 },
    { id: 'cashFlow', size: 'md', rows: 2 },
    { id: 'salesByMethod', size: 'md', rows: 2 },
    { id: 'collect', size: 'sm', rows: 1 },
    { id: 'cashToday', size: 'sm', rows: 1 },
    { id: 'topProducts', size: 'sm', rows: 1 },
    { id: 'portfolioTrend', size: 'md', rows: 2 },
    { id: 'salesWeek', size: 'md', rows: 2 },
    { id: 'lowStock', size: 'sm', rows: 1 },
    { id: 'riskCustomers', size: 'sm', rows: 1 },
    { id: 'rus', size: 'sm', rows: 1 },
  ],
};

export type LayoutEntry = {
  id: WidgetId;
  visible: boolean;
  size: WidgetSize;
  cols: WidgetCols;
  rows: WidgetRows;
};

export const layoutSchema = z
  .array(
    z.object({
      id: z.enum(WIDGET_IDS),
      visible: z.boolean(),
      size: z.enum(WIDGET_SIZES).optional(),
      cols: z.number().int().min(1).max(6).optional(),
      rows: z.union([z.literal(1), z.literal(2)]).optional(),
    }),
  )
  .max(WIDGET_IDS.length)
  .refine((entries) => new Set(entries.map((e) => e.id)).size === entries.length);

/** Ajusta un tamaño al permitido por ese widget (o devuelve su tamaño por defecto). */
export function normalizeWidgetSize(id: WidgetId, size?: WidgetSize): WidgetSize {
  const def = WIDGETS[id];
  if (size && def.sizes.includes(size)) return size;
  return def.defaultSize;
}

/** Ajusta las filas verticales al rango permitido por ese widget. */
export function normalizeWidgetRows(id: WidgetId, rows?: WidgetRows): WidgetRows {
  const def = WIDGETS[id];
  if (rows && def.rows.includes(rows)) return rows;
  return def.defaultRows;
}

/** Normaliza las dimensiones 2D (`size`, `cols`, `rows`) de un widget según su auditoría. */
export function normalizeWidgetDimensions(
  id: WidgetId,
  input?: { size?: WidgetSize; cols?: number; rows?: WidgetRows },
): { size: WidgetSize; cols: WidgetCols; rows: WidgetRows } {
  const def = WIDGETS[id];
  const mappedColSize =
    input?.cols === 1 || input?.cols === 2 || input?.cols === 3
      ? COLS_TO_SIZE[input.cols]
      : undefined;
  const candidateSize =
    input?.size && def.sizes.includes(input.size)
      ? input.size
      : mappedColSize && def.sizes.includes(mappedColSize)
        ? mappedColSize
        : input?.size;
  const size = normalizeWidgetSize(id, candidateSize);
  const cols = SIZE_TO_COLS[size];
  const rows = normalizeWidgetRows(id, input?.rows);
  return { size, cols, rows };
}

/** Indica si el widget admite cambiar de ancho o de alto en la grilla Bento. */
export function isWidgetResizable(id: WidgetId): boolean {
  const def = WIDGETS[id];
  return def.cols.length > 1 || def.rows.length > 1;
}

export function availableWidgets(role: Role, tier: PlanTier): WidgetId[] {
  const features = PlanLimits.of(tier).features;
  return WIDGET_IDS.filter((id) => {
    const { permission, feature } = WIDGETS[id];
    return (!permission || can(role, permission)) && (!feature || features[feature]);
  });
}

/**
 * Diseño efectivo del Dashboard: el guardado (o el del rol), sin widgets que el rol
 * o el plan ya no permiten, normalizando dimensiones 2D y dejando los nuevos ocultos al final.
 */
export function resolveLayout(saved: unknown, role: Role, tier: PlanTier): LayoutEntry[] {
  const allowed = availableWidgets(role, tier);
  const parsed = layoutSchema.safeParse(saved);
  const base = parsed.success
    ? parsed.data
    : DEFAULT_VISIBLE[role === 'STORE_OWNER' ? 'owner' : 'employee'].map((id) => ({
        id,
        visible: true,
        size: WIDGETS[id].defaultSize,
        cols: WIDGETS[id].defaultCols,
        rows: WIDGETS[id].defaultRows,
      }));
  const kept: LayoutEntry[] = base
    .filter((entry) => allowed.includes(entry.id))
    .map((entry) => {
      const dims = normalizeWidgetDimensions(entry.id, entry);
      return {
        id: entry.id,
        visible: entry.visible,
        ...dims,
      };
    });
  const missing: LayoutEntry[] = allowed
    .filter((id) => !kept.some((entry) => entry.id === id))
    .map((id) => ({
      id,
      visible: false,
      ...normalizeWidgetDimensions(id),
    }));
  return [...kept, ...missing];
}

/** Construye un diseño completo a partir de una plantilla, respetando rol y plan. */
export function buildPresetLayout(presetId: PresetId, role: Role, tier: PlanTier): LayoutEntry[] {
  const preset = LAYOUT_PRESETS[presetId].map((item) => ({
    id: item.id,
    visible: true,
    size: item.size,
    rows: item.rows,
  }));
  return resolveLayout(preset, role, tier);
}
