import { type NextRequest } from 'next/server';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { escapeCsvCell } from '@/infrastructure/db/queries/audit';
import {
  filterAndSortPortfolioRows,
  loadPortfolio,
  parsePortfolioQuery,
} from '@/infrastructure/db/queries/portfolio';
import { getSessionUser } from '@/presentation/auth/session';
import { loadStoreContext } from '@/presentation/queries/store-context';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.storeId || !user.emailVerified) {
    return new Response('No autenticado', { status: 401 });
  }
  if (!can(user.role, 'reports.view')) {
    return new Response('Sin permisos', { status: 403 });
  }

  const store = await loadStoreContext(user.storeId);
  if (!PlanLimits.of(store.tier).features.reportsExport) {
    return new Response('Disponible desde el plan Bodega Pro', { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const query = parsePortfolioQuery({
    q: sp.get('q') ?? undefined,
    filter: sp.get('filter') ?? undefined,
    band: sp.get('band') ?? undefined,
    aging: sp.get('aging') ?? undefined,
    sort: sp.get('sort') ?? undefined,
  });

  const portfolio = await loadPortfolio(user.storeId, new Date());
  const rows = filterAndSortPortfolioRows(portfolio.rows, query);

  const header = [
    'cliente',
    'documento',
    'estado_cliente',
    'estado_cuenta',
    'deuda_actual_pen',
    'limite_credito_pen',
    'uso_pct',
    'saldo_vencido_pen',
    'por_vencer_pen',
    'dias_mora_max',
    'tramo_antiguedad',
    'puntaje',
    'categoria_puntaje',
    'sugerir_bajar_limite',
  ].join(',');

  const lines = rows.map((row) =>
    [
      escapeCsvCell(row.name),
      escapeCsvCell(`${row.documentType} ${row.documentNumber}`),
      escapeCsvCell(row.isActiveCustomer ? 'ACTIVE' : 'INACTIVE'),
      escapeCsvCell(row.accountStatus),
      escapeCsvCell(row.currentBalance),
      escapeCsvCell(row.creditLimit),
      escapeCsvCell(row.utilizationPct.toFixed(1)),
      escapeCsvCell(row.overdueBalance),
      escapeCsvCell(row.dueSoonBalance),
      escapeCsvCell(String(row.maxDaysOverdue)),
      escapeCsvCell(row.agingBucket),
      escapeCsvCell(row.hasHistory ? String(row.score) : ''),
      escapeCsvCell(row.hasHistory ? row.band : 'NO_HISTORY'),
      escapeCsvCell(row.suggestLowerLimit ? 'SI' : 'NO'),
    ].join(','),
  );

  const csv = `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="quina-cartera.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
