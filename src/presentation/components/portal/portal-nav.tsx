'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleUserRoundIcon,
  HouseIcon,
  LayoutDashboard,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  QrCodeIcon,
  ReceiptTextIcon,
  StoreIcon,
  type LucideIcon,
} from 'lucide-react';
import { SIDEBAR_COOKIE } from '@/presentation/components/shell/nav-items';
import { NotificationsMenu, ProfileMenu } from '@/presentation/components/shell/shell-menus';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/presentation/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/presentation/components/ui/tooltip';
import { cn } from '@/presentation/lib/utils';
import type { AppNotification } from '@/presentation/queries/notifications';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';

export type PortalShellStore = {
  storeId: string;
  storeName: string;
  customerName: string;
};

type PortalNavItem = {
  key: 'home' | 'cycles' | 'pay' | 'store' | 'stores' | 'profile';
  href: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
  mobileIcon?: LucideIcon;
  active: boolean;
};

const focusRing = 'outline-none focus-visible:outline-2 focus-visible:outline-link-active';
const press =
  'transition-[transform,color,background-color] duration-150 ease-(--ease-out-expo) active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100';
const noScrollbar = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

function resolveActiveStore(pathname: string, stores: PortalShellStore[]): PortalShellStore | null {
  const match = pathname.match(/^\/portal\/([^/]+)/);
  if (match && match[1]) {
    const found = stores.find((s) => s.storeId === match[1]);
    if (found) return found;
  }
  return stores.length === 1 ? (stores[0] ?? null) : null;
}

function usePortalNavItems(stores: PortalShellStore[]) {
  const pathname = usePathname();
  const t = useTranslations('Portal.shell.nav');
  const activeStore = resolveActiveStore(pathname, stores);

  if (!activeStore) {
    const items: PortalNavItem[] = [
      {
        key: 'stores',
        href: '/portal',
        label: t('stores'),
        icon: StoreIcon,
        active: pathname === '/portal',
      },
      {
        key: 'profile',
        href: '/portal/profile',
        label: t('profile'),
        icon: CircleUserRoundIcon,
        active: pathname.startsWith('/portal/profile'),
      },
    ];
    return { activeStore: null, items, secondary: [] as PortalNavItem[] };
  }

  const base = `/portal/${activeStore.storeId}`;
  const items: PortalNavItem[] = [
    {
      key: 'home',
      href: base,
      label: t('home'),
      icon: LayoutDashboard,
      mobileIcon: HouseIcon,
      active: pathname === base,
    },
    {
      key: 'cycles',
      href: `${base}/cycles`,
      label: t('cycles'),
      icon: ReceiptTextIcon,
      active: pathname.startsWith(`${base}/cycles`) || pathname.startsWith(`${base}/payments`),
    },
    {
      key: 'pay',
      href: `${base}/pay`,
      label: t('pay'),
      mobileLabel: t('payMobile'),
      icon: QrCodeIcon,
      active: pathname.startsWith(`${base}/pay`),
    },
    {
      key: 'store',
      href: `${base}/store`,
      label: t('store'),
      icon: StoreIcon,
      active: pathname.startsWith(`${base}/store`),
    },
  ];

  const secondary: PortalNavItem[] =
    stores.length > 1
      ? [
          {
            key: 'stores',
            href: '/portal',
            label: t('stores'),
            icon: StoreIcon,
            active: pathname === '/portal',
          },
        ]
      : [];

  return { activeStore, items, secondary };
}

function useSlidingIndicator(activeKey: string | null, collapsed: boolean) {
  const navRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>('[aria-current="page"]');
      const r = el?.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      setBox(
        r && r.height > 1
          ? { x: r.left - n.left, y: r.top - n.top + nav.scrollTop, w: r.width, h: r.height }
          : null,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const child of nav.children) observer.observe(child);
    nav.addEventListener('transitionend', measure);
    return () => {
      observer.disconnect();
      nav.removeEventListener('transitionend', measure);
    };
  }, [activeKey, collapsed]);

  return { navRef, box };
}

function RailTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function PortalStoreSwitcher({
  stores,
  activeStore,
  collapsed,
}: {
  stores: PortalShellStore[];
  activeStore: PortalShellStore | null;
  collapsed: boolean;
}) {
  const tShell = useTranslations('Portal.shell');
  if (stores.length === 0) return null;

  const displayName = activeStore?.storeName ?? tShell('home');
  const initial = displayName.trim().charAt(0).toUpperCase() || 'Q';

  if (stores.length === 1 && activeStore) {
    const href = `/portal/${activeStore.storeId}`;
    if (collapsed) {
      return (
        <RailTip label={displayName}>
          <Link
            href={href}
            aria-label={displayName}
            className={cn(
              'mx-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-dark',
              focusRing,
              press,
            )}
          >
            {initial}
          </Link>
        </RailTip>
      );
    }
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 rounded-card border border-line bg-paper px-3 py-2.5 transition-colors hover:bg-surface-hover',
          focusRing,
          press,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-dark"
        >
          {initial}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-ink">{displayName}</span>
          <span className="truncate text-xs text-ink-soft">{activeStore.customerName}</span>
        </span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={collapsed ? displayName : undefined}
        className={cn(
          'flex items-center gap-3 rounded-card border border-line bg-paper text-left transition-colors hover:bg-surface-hover',
          collapsed
            ? 'mx-auto size-10 justify-center rounded-full border-0 bg-primary text-primary-dark hover:bg-primary/90'
            : 'w-full px-3 py-2.5',
          focusRing,
          press,
        )}
      >
        {collapsed ? (
          <span className="text-sm font-semibold">{initial}</span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-dark"
            >
              {initial}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-ink">{displayName}</span>
              <span className="truncate text-xs text-ink-soft">
                {tShell('storesCount', { count: stores.length })}
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? 'right' : 'bottom'}
        align="start"
        sideOffset={8}
        className="w-64 rounded-card border-line bg-surface p-1.5 text-ink shadow-float"
      >
        <DropdownMenuLabel className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wider text-ink-soft uppercase">
          {tShell('switchStore')}
        </DropdownMenuLabel>
        {stores.map((s) => {
          const current = activeStore?.storeId === s.storeId;
          return (
            <DropdownMenuItem
              key={s.storeId}
              asChild
              className="h-10 gap-2.5 rounded-field px-3 text-sm"
            >
              <Link href={`/portal/${s.storeId}`}>
                <StoreIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
                <span className="min-w-0 flex-1 truncate">{s.storeName}</span>
                {current ? (
                  <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-link-active" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem asChild className="h-10 gap-2.5 rounded-field px-3 text-sm">
          <Link href="/portal">{tShell('home')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Cabecera móvil y tablet (< 1024 px) del Portal del Vecino, espejo de Bodega. */
export function PortalMobileHeader({
  stores,
  user,
  notifications,
}: {
  stores: PortalShellStore[];
  user: { name: string; email: string };
  notifications: AppNotification[];
}) {
  const tShell = useTranslations('Portal.shell');
  const pathname = usePathname();
  const activeStore = resolveActiveStore(pathname, stores);
  const homeHref = activeStore ? `/portal/${activeStore.storeId}` : '/portal';
  const storeLabel = activeStore?.storeName ?? (stores.length > 1 ? tShell('home') : '');

  return (
    <header
      data-mobile-header=""
      className="chrome-translucent sticky top-0 z-30 flex h-[calc(3.75rem+env(safe-area-inset-top,0px))] items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/85 lg:hidden print:hidden"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={homeHref}
          aria-label={tShell('home')}
          className={cn('flex min-h-11 shrink-0 items-center rounded-full pr-1', focusRing, press)}
        >
          <Image src={isologo} alt={tShell('logoAlt')} priority className="h-7 w-auto" />
        </Link>
        {storeLabel ? (
          <>
            <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />
            <span className="hidden truncate text-sm font-medium text-ink-soft sm:block">
              {storeLabel}
            </span>
          </>
        ) : null}
      </div>
      <div className="-mr-2 flex shrink-0 items-center gap-1">
        <NotificationsMenu
          items={notifications}
          compact
          pollUrl="/app/api/portal/notifications"
          storageKey="quina-portal-notifications-read"
          footerHref={null}
          emptyText={tShell('notificationsEmpty')}
        />
        <ProfileMenu
          user={user}
          storeName={storeLabel}
          canManageStore={false}
          compact
          mode="portal"
          stores={stores}
        />
      </div>
    </header>
  );
}

/** Barra lateral de escritorio/laptop (>= 1024 px) del Portal del Vecino. */
export function PortalSidebar({
  initialCollapsed,
  stores,
  notifications,
  user,
}: {
  initialCollapsed: boolean;
  stores: PortalShellStore[];
  notifications: AppNotification[];
  user: { name: string; email: string };
}) {
  const tNav = useTranslations('Shell.nav');
  const tShell = useTranslations('Portal.shell');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { activeStore, items, secondary } = usePortalNavItems(stores);
  const activeKey = [...items, ...secondary].find((i) => i.active)?.key ?? null;
  const { navRef, box } = useSlidingIndicator(activeKey, collapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  };
  const toggleLabel = collapsed ? tNav('expand') : tNav('collapse');
  const homeHref = activeStore ? `/portal/${activeStore.storeId}` : '/portal';
  const storeContextName =
    activeStore?.storeName ??
    (stores.length > 0 ? tShell('storesCount', { count: stores.length }) : tShell('home'));

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-3 border-r border-line bg-surface py-4 lg:flex print:hidden',
          collapsed ? 'w-19 px-2' : 'w-64 px-4',
        )}
      >
        <div
          className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between pl-2')}
        >
          {collapsed ? null : (
            <Link href={homeHref} className={cn('rounded-field', focusRing)}>
              <Image src={isologo} alt={tShell('logoAlt')} priority className="h-8 w-auto" />
            </Link>
          )}
          <RailTip label={toggleLabel}>
            <button
              type="button"
              onClick={toggle}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              className={cn(
                'flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-hover hover:text-ink',
                focusRing,
                press,
              )}
            >
              {collapsed ? (
                <PanelLeftOpenIcon aria-hidden="true" className="size-5" />
              ) : (
                <PanelLeftCloseIcon aria-hidden="true" className="size-5" />
              )}
            </button>
          </RailTip>
        </div>

        <PortalStoreSwitcher stores={stores} activeStore={activeStore} collapsed={collapsed} />

        <nav
          ref={navRef}
          aria-label={tShell('navLabel')}
          className={cn(
            'relative -mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pt-1',
            collapsed ? 'gap-2' : 'gap-1',
            noScrollbar,
          )}
        >
          <span
            aria-hidden="true"
            className="--ease-out-expo pointer-events-none absolute top-0 left-0 rounded-full bg-soft transition-[transform,opacity] duration-250 motion-reduce:transition-none"
            style={{
              width: box?.w ?? 0,
              height: box?.h ?? 0,
              transform: `translate(${box?.x ?? 0}px, ${box?.y ?? 0}px)`,
              opacity: box ? 1 : 0,
            }}
          />
          {items.map((item) => {
            const Icon = item.icon;
            const link = (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  'relative z-10 flex shrink-0 items-center gap-3 rounded-full text-sm font-medium',
                  collapsed ? 'size-11 justify-center self-center' : 'h-11 px-4',
                  item.active
                    ? 'text-soft-ink'
                    : 'text-ink-soft hover:bg-surface-hover hover:text-ink',
                  focusRing,
                  press,
                )}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                {collapsed ? null : <span className="truncate">{item.label}</span>}
              </Link>
            );
            return collapsed ? (
              <RailTip key={item.key} label={item.label}>
                {link}
              </RailTip>
            ) : (
              link
            );
          })}

          {secondary.length > 0 ? (
            <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
              {secondary.map((item) => {
                const Icon = item.icon;
                const link = (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={cn(
                      'relative z-10 flex shrink-0 items-center gap-3 rounded-full text-sm font-medium',
                      collapsed ? 'size-11 justify-center self-center' : 'h-11 px-4',
                      item.active
                        ? 'text-soft-ink'
                        : 'text-ink-soft hover:bg-surface-hover hover:text-ink',
                      focusRing,
                      press,
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    {collapsed ? null : <span className="truncate">{item.label}</span>}
                  </Link>
                );
                return collapsed ? (
                  <RailTip key={item.key} label={item.label}>
                    {link}
                  </RailTip>
                ) : (
                  link
                );
              })}
            </div>
          ) : null}
        </nav>

        <div
          className={cn(
            'flex flex-col gap-0.5 border-t border-line pt-3',
            collapsed ? 'items-center' : '',
          )}
        >
          <NotificationsMenu
            items={notifications}
            collapsed={collapsed}
            pollUrl="/app/api/portal/notifications"
            storageKey="quina-portal-notifications-read"
            footerHref={null}
            emptyText={tShell('notificationsEmpty')}
          />
          <ProfileMenu
            user={user}
            storeName={storeContextName}
            canManageStore={false}
            collapsed={collapsed}
            mode="portal"
            stores={stores}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Barra inferior flotante del Portal (< 1024 px): 4 pestañas equilibradas sin FAB. */
export function PortalMobileNav({ stores }: { stores: PortalShellStore[] }) {
  const tShell = useTranslations('Portal.shell');
  const { items } = usePortalNavItems(stores);
  const indicatorIndex = items.findIndex((item) => item.active);
  const slots = items.length;

  return (
    <nav
      aria-label={tShell('navLabel')}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden print:hidden"
    >
      <div className="mx-auto flex w-full max-w-lg items-center">
        <ul className="pointer-events-auto relative flex h-16 flex-1 items-stretch rounded-full border border-line bg-surface p-1.5 shadow-float">
          <li
            aria-hidden="true"
            className="--ease-out-expo pointer-events-none absolute inset-y-1.5 left-1.5 rounded-full bg-paper-deep transition-transform duration-250 motion-reduce:transition-none"
            style={{
              width: `calc((100% - 0.75rem) / ${slots})`,
              transform: `translateX(${Math.max(0, indicatorIndex) * 100}%)`,
              opacity: indicatorIndex === -1 ? 0 : 1,
            }}
          />
          {items.map((item) => {
            const Icon = item.mobileIcon ?? item.icon;
            return (
              <li key={item.key} className="relative flex flex-1">
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[0.6875rem] font-medium select-none',
                    item.active ? 'text-ink' : 'text-ink-soft',
                    focusRing,
                    press,
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={item.active ? 2.25 : 2}
                  />
                  <span className="truncate">{item.mobileLabel ?? item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
