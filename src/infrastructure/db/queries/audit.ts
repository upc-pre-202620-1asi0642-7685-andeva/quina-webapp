import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { auditLogs, users } from '../schema';
import { withTenant } from '../with-tenant';

export const AUDIT_CATEGORIES = [
  'sales_credit',
  'inventory',
  'team_store',
  'security',
  'billing',
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_ACTIONS: Record<AuditCategory, readonly string[]> = {
  sales_credit: [
    'CREATE_CASH_SALE',
    'CREATE_CREDIT_SALE',
    'REGISTER_PAYMENT',
    'OBJECT_CHARGE',
    'CHARGE_CONFIRMED',
    'CHARGE_VOIDED',
    'VOID_CREDIT_CHARGE',
    'OPEN_CREDIT_ACCOUNT',
    'UPDATE_CREDIT_TERMS',
    'SET_CREDIT_ACCOUNT_STATUS',
    'CREATE_CUSTOMER',
    'UPDATE_CUSTOMER',
    'REACTIVATE_CUSTOMER',
    'DEACTIVATE_CUSTOMER',
  ],
  inventory: [
    'CREATE_PRODUCT',
    'UPDATE_PRODUCT',
    'UPDATE_PRICE',
    'ADJUST_STOCK',
    'RECORD_WASTE',
    'ACTIVATE_PRODUCT',
    'REACTIVATE_PRODUCT',
    'DEACTIVATE_PRODUCT',
    'REGISTER_PURCHASE',
    'CREATE_SUPPLIER',
    'GENERATE_REPLENISHMENT_ORDERS',
    'DISCARD_PURCHASE_ORDER',
  ],
  team_store: [
    'CREATE_STORE',
    'REACTIVATE_STORE',
    'SUSPEND_STORE',
    'UPDATE_PAYMENT_DETAILS',
    'UPDATE_TAX_SETTINGS',
    'INVITE_EMPLOYEE',
    'CANCEL_INVITE',
    'REACTIVATE_EMPLOYEE',
    'DEACTIVATE_EMPLOYEE',
  ],
  security: ['LOGIN_FAILED', 'LOGIN_BLOCKED', 'LOCK_ACCOUNT', 'SET_PASSWORD', 'ACCEPT_TERMS'],
  billing: [
    'START_SUBSCRIPTION_CHECKOUT',
    'SUBSCRIPTION_PAYMENT_APPROVED',
    'SUBSCRIPTION_PAYMENT_REJECTED',
    'SUBSCRIPTION_PAYMENT_REFUNDED',
    'CANCEL_SUBSCRIPTION_RENEWAL',
    'EXPIRE_TRIAL',
    'EXPIRE_GRACE_PERIOD',
    'COMPLETE_CANCELED_SUBSCRIPTION',
    'SUBSCRIBE_PLAN',
    'RENEW_SUBSCRIPTION',
    'MARK_SUBSCRIPTION_PAST_DUE',
  ],
};

const SECURITY_ALERT_ACTIONS = new Set(['LOGIN_FAILED', 'LOGIN_BLOCKED', 'LOCK_ACCOUNT']);

export type AuditLogFilters = {
  from?: string;
  to?: string;
  userId?: string;
  entityName?: string;
  action?: string;
  category?: AuditCategory;
  q?: string;
};

export type AuditLogEntry = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityName: string;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent?: string | null;
  createdAt: Date;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AuditSummary = {
  fromDate: string;
  toDate: string;
  total7d: number;
  salesCredit7d: number;
  inventory7d: number;
  security7d: number;
  securityAlerts7d: number;
  teamStore7d: number;
  billing7d: number;
};

export type AuditActorOption = {
  id: string;
  name: string;
};

export const AUDIT_ENTITY_NAMES = [
  'sales',
  'debt_payments',
  'credit_accounts',
  'credit_charges',
  'customers',
  'products',
  'purchases',
  'purchase_orders',
  'suppliers',
  'users',
  'stores',
  'store_subscriptions',
] as const;

const auditSelectColumns = {
  id: auditLogs.id,
  userId: auditLogs.userId,
  userName: users.name,
  action: auditLogs.action,
  entityName: auditLogs.entityName,
  entityId: auditLogs.entityId,
  oldData: auditLogs.oldData,
  newData: auditLogs.newData,
  ipAddress: auditLogs.ipAddress,
  userAgent: auditLogs.userAgent,
  createdAt: auditLogs.createdAt,
};

function mapAuditRow(row: {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityName: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}): AuditLogEntry {
  return {
    ...row,
    oldData: (row.oldData as Record<string, unknown> | null) ?? null,
    newData: (row.newData as Record<string, unknown> | null) ?? null,
  };
}

function parseLimaDateStart(yyyyMmDd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const d = new Date(`${yyyyMmDd}T00:00:00.000-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLimaDateEnd(yyyyMmDd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const d = new Date(`${yyyyMmDd}T23:59:59.999-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildAuditConditions(storeId: string, filters: AuditLogFilters): SQL[] {
  const conditions: SQL[] = [eq(auditLogs.storeId, storeId)];

  if (filters.from) {
    const start = parseLimaDateStart(filters.from);
    if (start) conditions.push(gte(auditLogs.createdAt, start));
  }
  if (filters.to) {
    const end = parseLimaDateEnd(filters.to);
    if (end) conditions.push(lte(auditLogs.createdAt, end));
  }
  if (filters.userId && /^[0-9a-f-]{36}$/i.test(filters.userId)) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (
    filters.entityName &&
    (AUDIT_ENTITY_NAMES as readonly string[]).includes(filters.entityName)
  ) {
    conditions.push(eq(auditLogs.entityName, filters.entityName));
  }
  if (filters.action) {
    const cleanAction = filters.action.trim();
    if (/^[A-Z0-9_]{1,50}$/.test(cleanAction)) {
      conditions.push(eq(auditLogs.action, cleanAction));
    }
  }
  if (filters.category && (AUDIT_CATEGORIES as readonly string[]).includes(filters.category)) {
    conditions.push(inArray(auditLogs.action, [...AUDIT_CATEGORY_ACTIONS[filters.category]]));
  }
  if (filters.q) {
    const term = filters.q
      .trim()
      .slice(0, 80)
      .replace(/[%_\\]/g, '');
    if (term) {
      const pattern = `%${term}%`;
      const searchCond = or(
        ilike(auditLogs.action, pattern),
        ilike(auditLogs.entityName, pattern),
        ilike(sql`COALESCE(${users.name}, '')`, pattern),
        ilike(sql`COALESCE(${auditLogs.entityId}::text, '')`, pattern),
        ilike(sql`COALESCE(${auditLogs.ipAddress}, '')`, pattern),
        ilike(sql`COALESCE(${auditLogs.oldData}::text, '')`, pattern),
        ilike(sql`COALESCE(${auditLogs.newData}::text, '')`, pattern),
      );
      if (searchCond) conditions.push(searchCond);
    }
  }

  return conditions;
}

export function listAuditLogs(
  storeId: string,
  filters: AuditLogFilters = {},
  limit = 200,
): Promise<AuditLogEntry[]> {
  return withTenant(storeId, async (tx) => {
    const conditions = buildAuditConditions(storeId, filters);
    const rows = await tx
      .select(auditSelectColumns)
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);

    return rows.map(mapAuditRow);
  });
}

export function listAuditLogsPage(
  storeId: string,
  filters: AuditLogFilters = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 },
): Promise<AuditLogPage> {
  const pageSize = Math.min(100, Math.max(1, Math.floor(pagination.pageSize) || 50));
  const requestedPage = Math.max(1, Math.floor(pagination.page) || 1);

  return withTenant(storeId, async (tx) => {
    const whereClause = and(...buildAuditConditions(storeId, filters));

    const [countRow] = await tx
      .select({ total: count() })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(whereClause);

    const totalCount = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = totalCount > 0 ? Math.min(requestedPage, totalPages) : 1;

    if (totalCount === 0) {
      return { entries: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };
    }

    const rows = await tx
      .select(auditSelectColumns)
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      entries: rows.map(mapAuditRow),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  });
}

export function getAuditSummary(storeId: string, now: Date = new Date()): Promise<AuditSummary> {
  const today = BusinessDate.fromInstant(now);
  const sevenDaysAgo = BusinessDate.addDays(today, -6);
  const since = BusinessDate.startInstant(sevenDaysAgo);

  const actionToCategory = new Map<string, AuditCategory>();
  for (const cat of AUDIT_CATEGORIES) {
    for (const act of AUDIT_CATEGORY_ACTIONS[cat]) {
      actionToCategory.set(act, cat);
    }
  }

  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        action: auditLogs.action,
        total: count(),
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.storeId, storeId), gte(auditLogs.createdAt, since)))
      .groupBy(auditLogs.action);

    let total7d = 0;
    let salesCredit7d = 0;
    let inventory7d = 0;
    let security7d = 0;
    let securityAlerts7d = 0;
    let teamStore7d = 0;
    let billing7d = 0;

    for (const row of rows) {
      const n = Number(row.total ?? 0);
      total7d += n;
      if (SECURITY_ALERT_ACTIONS.has(row.action)) {
        securityAlerts7d += n;
      }
      const cat = actionToCategory.get(row.action);
      if (cat === 'sales_credit') salesCredit7d += n;
      else if (cat === 'inventory') inventory7d += n;
      else if (cat === 'security') security7d += n;
      else if (cat === 'team_store') teamStore7d += n;
      else if (cat === 'billing') billing7d += n;
    }

    return {
      fromDate: BusinessDate.toISO(sevenDaysAgo),
      toDate: BusinessDate.toISO(today),
      total7d,
      salesCredit7d,
      inventory7d,
      security7d,
      securityAlerts7d,
      teamStore7d,
      billing7d,
    };
  });
}

export function listAccountTermsHistory(
  storeId: string,
  accountId: string,
): Promise<AuditLogEntry[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select(auditSelectColumns)
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(
        and(
          eq(auditLogs.storeId, storeId),
          eq(auditLogs.entityName, 'credit_accounts'),
          eq(auditLogs.entityId, accountId),
          inArray(auditLogs.action, ['OPEN_CREDIT_ACCOUNT', 'UPDATE_CREDIT_TERMS']),
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(50);

    return rows.map(mapAuditRow);
  });
}

export function listAuditActors(storeId: string): Promise<AuditActorOption[]> {
  return withTenant(storeId, (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
      })
      .from(users)
      .where(eq(users.storeId, storeId))
      .orderBy(asc(users.name)),
  );
}

/**
 * Escapa una celda según RFC 4180 y neutraliza fórmulas de hojas de cálculo
 * (`=`, `+`, `-`, `@`, `\t`, `\r`) anteponiendo un apóstrofo.
 */
export function escapeCsvCell(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let value = String(raw);
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Genera el CSV con BOM UTF-8 (`\uFEFF`) para que Excel abra tildes directamente. */
export function formatAuditCsv(rows: AuditLogEntry[]): string {
  const header = [
    'fecha_utc',
    'usuario',
    'accion',
    'entidad',
    'id_entidad',
    'datos_anteriores',
    'datos_nuevos',
    'ip',
  ].join(',');

  const lines = rows.map((r) =>
    [
      escapeCsvCell(r.createdAt.toISOString()),
      escapeCsvCell(r.userName ?? r.userId ?? ''),
      escapeCsvCell(r.action),
      escapeCsvCell(r.entityName),
      escapeCsvCell(r.entityId ?? ''),
      escapeCsvCell(r.oldData ? JSON.stringify(r.oldData) : ''),
      escapeCsvCell(r.newData ? JSON.stringify(r.newData) : ''),
      escapeCsvCell(r.ipAddress ?? ''),
    ].join(','),
  );

  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}
