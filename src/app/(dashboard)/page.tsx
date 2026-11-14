import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { loadDashboardLayout } from '@/infrastructure/db/queries/dashboard';
import { requireStoreUser } from '@/presentation/auth/guards';
import { DashboardGrid, WidgetSkeleton } from '@/presentation/components/dashboard/dashboard-grid';
import { WIDGET_COMPONENTS } from '@/presentation/components/dashboard/dashboard-widgets';
import { resolveLayout, type WidgetId } from '@/presentation/components/dashboard/widgets';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function DashboardHomePage() {
  const user = await requireStoreUser('/');
  const t = await getTranslations('Dashboard');
  const [store, saved] = await Promise.all([
    loadStoreContext(user.storeId),
    loadDashboardLayout(user.id),
  ]);
  const now = new Date();
  const layout = resolveLayout(saved, user.role, store.tier);
  const defaultLayout = resolveLayout(null, user.role, store.tier);
  // Solo se consultan los widgets a la vista; cada uno llega por su cuenta (streaming)
  const nodes: Partial<Record<WidgetId, React.ReactNode>> = {};
  for (const { id, visible } of layout) {
    if (!visible) continue;
    const Widget = WIDGET_COMPONENTS[id];
    nodes[id] = (
      <Suspense fallback={<WidgetSkeleton />}>
        <Widget storeId={user.storeId} role={user.role} now={now} />
      </Suspense>
    );
  }
  // US24: la prueba Pro se ve desde el primer día
  const trialDays = store.tier !== 'CASERO' ? store.trialDaysRemaining : null;

  return (
    <DashboardGrid
      layout={layout}
      defaultLayout={defaultLayout}
      nodes={nodes}
      heading={
        <header className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t('greeting', { name: user.name.split(' ')[0] ?? user.name })}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span className="tabular-nums">
              {t('today', { date: formatDate(now), store: store.name })}
            </span>
            {trialDays !== null ? (
              <span className="rounded-full bg-soft px-2.5 py-0.5 text-[13px] font-medium text-soft-ink tabular-nums">
                {t('trialBadge', { days: trialDays })}
              </span>
            ) : null}
          </p>
        </header>
      }
    />
  );
}
