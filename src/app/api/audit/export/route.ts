import { type NextRequest } from 'next/server';
import { can } from '@/core/domain/identity/permissions';
import { formatAuditCsv, listAuditLogs } from '@/infrastructure/db/queries/audit';
import { getSessionUser } from '@/presentation/auth/session';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.storeId) {
    return new Response('No autenticado', { status: 401 });
  }
  if (!can(user.role, 'settings.billing')) {
    return new Response('Sin permisos', { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const from = sp.get('from') ?? undefined;
  const to = sp.get('to') ?? undefined;
  const userId = sp.get('userId') ?? undefined;
  const entityName = sp.get('entityName') ?? undefined;

  const rows = await listAuditLogs(user.storeId, { from, to, userId, entityName }, 5000);
  const csv = formatAuditCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="quina-auditoria.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
