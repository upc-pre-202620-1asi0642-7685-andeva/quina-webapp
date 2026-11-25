import { AppToaster } from '@/presentation/components/feedback/app-toaster';
import { RouteBones } from '@/presentation/components/feedback/page-skeleton';
import { OfflineBanner } from '@/presentation/components/pwa/pwa';
import type { AppNotification } from '@/presentation/queries/notifications';
import {
  PortalMobileHeader,
  PortalMobileNav,
  PortalSidebar,
  type PortalShellStore,
} from './portal-nav';

/**
 * Marco del portal del vecino (US14, DESIGN.md §6.2): misma arquitectura visual
 * que Bodega (barra lateral en escritorio/laptop, cabecera limpia y píldora
 * inferior en celular/tablet), conservando la escala legible del vecino.
 */
export function PortalShell({
  initialCollapsed = false,
  user,
  stores,
  notifications,
  children,
}: {
  initialCollapsed?: boolean;
  user: { name: string; email: string };
  stores: PortalShellStore[];
  notifications: AppNotification[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[auto_1fr] print:block print:bg-white">
      <PortalSidebar
        initialCollapsed={initialCollapsed}
        stores={stores}
        notifications={notifications}
        user={user}
      />

      <div className="flex min-w-0 flex-col">
        <PortalMobileHeader stores={stores} user={user} notifications={notifications} />
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] text-lg leading-relaxed lg:px-8 lg:pt-8 lg:pb-12 print:max-w-none print:p-0">
          <OfflineBanner />
          <RouteBones>
            <div className="flex flex-col gap-6">{children}</div>
          </RouteBones>
        </main>
      </div>

      <PortalMobileNav stores={stores} />
      <AppToaster />
    </div>
  );
}
