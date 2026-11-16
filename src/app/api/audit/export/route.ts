import { type NextRequest } from 'next/server';
import { can } from '@/core/domain/identity/permissions';
import {
  AUDIT_CATEGORIES,
  formatAuditCsv,
  listAuditLogs,
  type AuditCategory,
} from '@/infrastructure/db/queries/audit';
import { getSessionUser } from '@/presentation/auth/session';

const MAX_EXPORT_ROWS = 5000;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.storeId || !user.emailVerified) {
    return new Response('No autenticado', { status: 401 });
  }
  if (!can(user.role, 'audit.view')) {
    return new Response('Sin permisos', { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const from = sp.get('from') ?? undefined;
  const to = sp.get('to') ?? undefined;
  const userId = sp.get('userId') ?? undefined;
  const entityName = sp.get('entityName') ?? undefined;
  const action = sp.get('action') ?? undefined;
  const rawCategory = sp.get('category') ?? undefined;
  const category =
    rawCategory && (AUDIT_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as AuditCategory)
      : undefined;
  const q = sp.get('q') ?? undefined;

  const rows = await listAuditLogs(
    user.storeId,
    { from, to, userId, entityName, action, category, q },
    MAX_EXPORT_ROWS + 1,
  );
  const truncated = rows.length > MAX_EXPORT_ROWS;
  const exportRows = truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows;
  const csv = formatAuditCsv(exportRows);

  const headers: Record<string, string> = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="quina-auditoria.csv"',
    'Cache-Control': 'no-store',
    'X-Audit-Count': String(exportRows.length),
  };
  if (truncated) {
    headers['X-Audit-Truncated'] = 'true';
  }

  return new Response(csv, {
    status: 200,
    headers,
  });
}
