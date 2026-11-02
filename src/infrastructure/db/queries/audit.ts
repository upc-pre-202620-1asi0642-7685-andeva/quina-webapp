import { and, asc, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { auditLogs, users } from '../schema';
import { withTenant } from '../with-tenant';

export type AuditLogFilters = {
  from?: string;
  to?: string;
  userId?: string;
  entityName?: string;
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
  createdAt: Date;
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
] as const;

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

export function listAuditLogs(
  storeId: string,
  filters: AuditLogFilters = {},
  limit = 200,
): Promise<AuditLogEntry[]> {
  return withTenant(storeId, async (tx) => {
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

    const rows = await tx
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userName: users.name,
        action: auditLogs.action,
        entityName: auditLogs.entityName,
        entityId: auditLogs.entityId,
        oldData: auditLogs.oldData,
        newData: auditLogs.newData,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      oldData: (r.oldData as Record<string, unknown> | null) ?? null,
      newData: (r.newData as Record<string, unknown> | null) ?? null,
    }));
  });
}

export function listAccountTermsHistory(
  storeId: string,
  accountId: string,
): Promise<AuditLogEntry[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userName: users.name,
        action: auditLogs.action,
        entityName: auditLogs.entityName,
        entityId: auditLogs.entityId,
        oldData: auditLogs.oldData,
        newData: auditLogs.newData,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
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
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    return rows.map((r) => ({
      ...r,
      oldData: (r.oldData as Record<string, unknown> | null) ?? null,
      newData: (r.newData as Record<string, unknown> | null) ?? null,
    }));
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
