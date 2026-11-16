'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  BellRingIcon,
  CalendarClockIcon,
  ChartPieIcon,
  ChevronDownIcon,
  CircleUserRoundIcon,
  FileChartColumnIcon,
  GemIcon,
  HandCoinsIcon,
  HouseIcon,
  LayoutDashboard,
  LandmarkIcon,
  LayoutGridIcon,
  ListIcon,
  PackageIcon,
  PackageXIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingBasketIcon,
  ShoppingCartIcon,
  StoreIcon,
  TriangleAlertIcon,
  TruckIcon,
  UserCogIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/presentation/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/presentation/components/ui/tooltip';
import { cn } from '@/presentation/lib/utils';
import type { AppNotification } from '@/presentation/queries/notifications';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';
import {
  activeHref,
  allHrefs,
  type NavGroup,
  type NavItem,
  type NavKey,
  type QuickAction,
  SIDEBAR_COOKIE,
} from './nav-items';
import { CreateMenu, NotificationsMenu, ProfileMenu } from './shell-menus';

const ICONS: Record<NavKey, LucideIcon> = {
  home: LayoutDashboard,
  sell: ShoppingBasketIcon,
  customers: UsersIcon,
  customersAll: ListIcon,
  customersNew: UserPlusIcon,
  collections: HandCoinsIcon,
  collectionsDue: CalendarClockIcon,
  collectionsOverdue: TriangleAlertIcon,
  collectionsPayments: ReceiptTextIcon,
  collectionsNotices: BellRingIcon,
  inventory: PackageIcon,
  products: PackageIcon,
  lowStock: PackageXIcon,
  purchases: ShoppingCartIcon,
  suppliers: TruckIcon,
  portfolio: ChartPieIcon,
  reports: FileChartColumnIcon,
  team: UserCogIcon,
  audit: ShieldCheckIcon,
  settings: SettingsIcon,
  subscription: GemIcon,
  profile: CircleUserRoundIcon,
  modules: LayoutGridIcon,
  stores: StoreIcon,
  rateCaps: LandmarkIcon,
  rusCaps: ReceiptTextIcon,
};

const focusRing = 'outline-none focus-visible:outline-2 focus-visible:outline-link-active';
// Respuesta al toque (apple-design: el dedo siente la pieza antes de soltar)
const press =
  'transition-[transform,color,background-color] duration-150 ease-(--ease-out-expo) active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100';
// Sin barra de desplazamiento visible: la lista sigue desplazándose con rueda, toque y teclado
const noScrollbar = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const badgeTone = (key: NavKey): 'amber' | 'error' =>
  key === 'collections' || key === 'collectionsOverdue' ? 'error' : 'amber';

function Badge({ value, tone }: { value?: number; tone: 'amber' | 'error' }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        tone === 'error' ? 'bg-error/12 text-error-ink' : 'bg-amber/12 text-amber-ink',
      )}
    >
      {value}
    </span>
  );
}

function useActive(groups: NavGroup[], secondary: NavItem[]) {
  const pathname = usePathname();
  const search = useSearchParams();
  return activeHref(pathname, allHrefs(groups, secondary), search.toString());
}

/** El módulo contiene el destino activo (él mismo o uno de sus accesos directos). */
const contains = (item: NavItem, active: string | null) =>
  item.href === active || (item.children?.some((child) => child.href === active) ?? false);

/**
 * Indicador del ítem activo: una sola píldora que se desliza (transform) hasta el
 * enlace con aria-current. Se recalcula al navegar, al plegar la barra y al abrir
 * o cerrar un submenú.
 */
function useSlidingIndicator(active: string | null, collapsed: boolean) {
  const navRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // Medido contra la barra (no contra el submenú) y sumando su scroll
    const measure = () => {
      let el = nav.querySelector<HTMLElement>('[aria-current="page"]');
      // Con el submenú cerrado, el destino sigue midiendo su alto dentro del panel oculto:
      // la píldora pasa al botón del módulo que lo contiene
      const closedPanel = el?.closest<HTMLElement>('[inert]');
      if (closedPanel) el = closedPanel.previousElementSibling as HTMLElement | null;
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
    // Al abrir o cerrar un submenú cambian las posiciones (y el atributo inert)
    const mutations = new MutationObserver(measure);
    mutations.observe(nav, { subtree: true, attributeFilter: ['inert'] });
    nav.addEventListener('transitionend', measure);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      nav.removeEventListener('transitionend', measure);
    };
  }, [active, collapsed]);

  return { navRef, box };
}

/** En la barra plegada el nombre aparece al pasar el cursor o al enfocar. */
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

function SidebarLink({
  item,
  active,
  nested,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const t = useTranslations('Shell.nav');
  const Icon = ICONS[item.key];
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? t(item.key) : undefined}
      className={cn(
        'relative z-10 flex shrink-0 items-center gap-3 rounded-full text-sm font-medium',
        collapsed ? 'size-11 justify-center self-center' : nested ? 'h-8 px-3' : 'h-10 px-4',
        active ? 'text-soft-ink' : 'text-ink-soft hover:bg-surface-hover hover:text-ink',
        focusRing,
        press,
      )}
    >
      <Icon
        aria-hidden="true"
        className={nested && !collapsed ? 'size-4 shrink-0 opacity-70' : 'size-5 shrink-0'}
      />
      {collapsed ? (
        item.badge ? (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-2 right-2 size-2 rounded-full ring-2 ring-surface',
              badgeTone(item.key) === 'error' ? 'bg-error' : 'bg-amber',
            )}
          />
        ) : null
      ) : (
        <>
          <span className="truncate">{t(item.key)}</span>
          <Badge value={item.badge} tone={badgeTone(item.key)} />
        </>
      )}
    </Link>
  );
  return collapsed ? <RailTip label={t(item.key)}>{link}</RailTip> : link;
}

function SidebarGroupItem({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: string | null;
  collapsed: boolean;
}) {
  const t = useTranslations('Shell.nav');
  const inside = contains(item, active);
  const [open, setOpen] = useState(inside);
  // Al entrar a una ruta del submenú desde otro lado, se abre solo
  const [wasInside, setWasInside] = useState(inside);
  if (inside !== wasInside) {
    setWasInside(inside);
    if (inside) setOpen(true);
  }

  // Plegada: el módulo es un solo ícono que lleva a su pantalla principal
  if (!item.children || collapsed) {
    return (
      <SidebarLink
        item={item}
        active={collapsed ? inside : item.href === active}
        collapsed={collapsed}
      />
    );
  }

  const Icon = ICONS[item.key];
  const panelId = `nav-${item.key}`;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative z-10 flex h-10 items-center gap-3 rounded-full px-4 text-sm font-medium',
          inside && !open ? 'text-soft-ink' : 'hover:bg-surface-hover',
          inside ? 'text-ink' : 'text-ink-soft hover:text-ink',
          focusRing,
          press,
        )}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="truncate">{t(item.key)}</span>
        {open ? null : <Badge value={item.badge} tone={badgeTone(item.key)} />}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            '--ease-out-expo size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
            item.badge && !open ? '' : 'ml-auto',
            open ? 'rotate-180' : '',
          )}
        />
      </button>
      {/* La altura se abre con grid-template-rows: sin medir ni animar height */}
      <div
        id={panelId}
        className={cn(
          '--ease-out-expo grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="ml-6.5 flex flex-col gap-0.5 border-l border-line py-1 pl-2">
            {item.children.map((child) => (
              <SidebarLink key={child.key} item={child} active={child.href === active} nested />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  groups,
  secondary,
  collapsed,
}: {
  groups: NavGroup[];
  secondary: NavItem[];
  collapsed: boolean;
}) {
  const t = useTranslations('Shell.nav');
  const active = useActive(groups, secondary);
  const { navRef, box } = useSlidingIndicator(active, collapsed);

  return (
    <nav
      ref={navRef}
      aria-label={t('label')}
      className={cn(
        'relative -mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1',
        collapsed ? 'gap-2' : 'gap-3',
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
      {groups.map((group, index) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          {collapsed ? (
            index > 0 ? (
              <span aria-hidden="true" className="mx-auto mb-2 h-px w-6 bg-line" />
            ) : null
          ) : (
            <p className="px-4 pb-1 text-[0.6875rem] font-semibold tracking-wider text-ink-soft uppercase">
              {t(`groups.${group.key}`)}
            </p>
          )}
          {group.items.map((item) => (
            <SidebarGroupItem key={item.key} item={item} active={active} collapsed={collapsed} />
          ))}
        </div>
      ))}
      {secondary.length > 0 ? (
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
          {secondary.map((item) => (
            <SidebarLink
              key={item.key}
              item={item}
              active={item.href === active}
              collapsed={collapsed}
            />
          ))}
        </div>
      ) : null}
    </nav>
  );
}

export type SidebarStore = {
  name: string;
  status: string | null;
  statusTone: 'trial' | 'grace' | null;
  isPlatform: boolean;
};

export type SidebarUser = {
  name: string;
  email: string;
  canManageStore: boolean;
  homeHref: string;
};

/**
 * Barra lateral de escritorio: se pliega a un riel de íconos (como Canva) y recuerda
 * la elección en una cookie, para que el servidor la pinte igual y no salte.
 */
export function Sidebar({
  initialCollapsed,
  groups,
  secondary,
  quick,
  notifications,
  user,
  store,
}: {
  initialCollapsed: boolean;
  groups: NavGroup[];
  secondary: NavItem[];
  quick: QuickAction[];
  notifications: AppNotification[];
  user: SidebarUser;
  store: SidebarStore;
}) {
  const t = useTranslations('Shell.nav');
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  };
  const toggleLabel = collapsed ? t('expand') : t('collapse');

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
            <Link href={user.homeHref} className={cn('rounded-field', focusRing)}>
              <Image src={isologo} alt={t('logoAlt')} priority className="h-8 w-auto" />
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

        {store.isPlatform ? null : collapsed ? (
          <RailTip label={store.status ? `${store.name} · ${store.status}` : store.name}>
            <Link
              href="/settings/subscription"
              aria-label={store.name}
              className={cn(
                'relative mx-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-dark',
                focusRing,
              )}
            >
              {store.name.trim().charAt(0).toUpperCase()}
              {store.statusTone === 'grace' ? (
                <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-amber ring-2 ring-surface" />
              ) : null}
            </Link>
          </RailTip>
        ) : (
          // La prueba o la gracia van dentro de la tarjeta de la tienda: la barra cabe sin scroll
          <Link
            href="/settings/subscription"
            className={cn(
              'flex items-center gap-3 rounded-card border border-line bg-paper px-3 py-2 transition-colors hover:bg-surface-hover',
              focusRing,
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-dark"
            >
              {store.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-ink">{store.name}</span>
              {store.status ? (
                <span
                  className={cn(
                    'truncate text-xs',
                    store.statusTone === 'grace'
                      ? 'font-medium text-amber-ink'
                      : 'text-link-active',
                  )}
                >
                  {store.status}
                </span>
              ) : null}
            </span>
          </Link>
        )}

        {quick.length > 0 ? (
          <div className={collapsed ? 'flex justify-center' : ''}>
            <CreateMenu actions={quick} collapsed={collapsed} />
          </div>
        ) : null}

        <SidebarNav groups={groups} secondary={secondary} collapsed={collapsed} />

        {/* Avisos arriba y cuenta abajo, en un mismo bloque al pie */}
        <div
          className={cn(
            'flex flex-col gap-0.5 border-t border-line pt-3',
            collapsed ? 'items-center' : '',
          )}
        >
          <NotificationsMenu items={notifications} collapsed={collapsed} />
          <ProfileMenu
            user={user}
            storeName={store.name}
            canManageStore={user.canManageStore}
            collapsed={collapsed}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Hoja de Módulos: arrastrar hacia abajo la cierra (sigue al dedo y respeta su velocidad). */
function useDragToClose(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);

  return {
    dy,
    handlers: {
      onPointerDown: (event: React.PointerEvent) => {
        start.current = { y: event.clientY, t: event.timeStamp };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: React.PointerEvent) => {
        if (start.current) setDy(Math.max(0, event.clientY - start.current.y));
      },
      onPointerUp: (event: React.PointerEvent) => {
        if (!start.current) return;
        const distance = event.clientY - start.current.y;
        const velocity = distance / Math.max(1, event.timeStamp - start.current.t);
        start.current = null;
        setDy(0);
        // Un gesto rápido cierra aunque sea corto (proyección del momento)
        if (distance > 96 || velocity > 0.5) onClose();
      },
      onPointerCancel: () => {
        start.current = null;
        setDy(0);
      },
    },
  };
}

function ModuleTile({
  item,
  active,
  onPick,
}: {
  item: NavItem;
  active: boolean;
  onPick: () => void;
}) {
  const t = useTranslations('Shell.nav');
  const Icon = item.key === 'home' ? HouseIcon : ICONS[item.key];
  const label = item.key === 'home' ? t('homeMobile') : t(item.key);
  return (
    <Link
      href={item.href}
      onClick={onPick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-card px-1 text-center text-xs font-medium',
        active ? 'bg-soft text-soft-ink' : 'bg-paper text-ink',
        focusRing,
        press,
      )}
    >
      <Icon aria-hidden="true" className="size-6" />
      <span className="line-clamp-2">{label}</span>
      {item.badge ? (
        <span className="absolute top-1.5 right-1.5 rounded-full bg-amber/12 px-1.5 text-[0.6875rem] font-semibold text-amber-ink tabular-nums">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function MobileNav({
  groups,
  secondary,
  tabs,
  sell,
  user,
}: {
  groups: NavGroup[];
  secondary: NavItem[];
  tabs: NavItem[];
  sell: NavItem | null;
  user: { name: string; storeName: string };
}) {
  const t = useTranslations('Shell.nav');
  const active = useActive(groups, secondary);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { dy, handlers } = useDragToClose(close);

  // Los submenús se aplanan: en la hoja cada destino es una baldosa
  const flat = (items: NavItem[]) =>
    items.flatMap((item) => [
      item,
      ...(item.children ?? []).filter((child) => child.href !== item.href),
    ]);
  const tabIndex = tabs.findIndex((tab) => contains(tab, active));
  const modulesActive = tabIndex === -1 && active !== sell?.href;
  const slots = tabs.length + 1;
  const indicatorIndex = modulesActive ? tabs.length : tabIndex;

  return (
    <>
      <nav
        aria-label={t('label')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden print:hidden"
      >
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
          {tabs.map((item) => {
            const Icon = item.key === 'home' ? HouseIcon : ICONS[item.key];
            const label = item.key === 'home' ? t('homeMobile') : t(item.key);
            const isActive = contains(item, active);
            return (
              <li key={item.key} className="relative flex flex-1">
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-medium select-none',
                    isActive ? 'text-ink' : 'text-ink-soft',
                    focusRing,
                    press,
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.25 : 2} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="relative flex flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-medium select-none',
                modulesActive ? 'text-ink' : 'text-ink-soft',
                focusRing,
                press,
              )}
            >
              <LayoutGridIcon aria-hidden="true" className="size-5" />
              {t('modules')}
            </button>
          </li>
        </ul>
        {sell ? (
          // DESIGN.md §5: "Vender" en verde, flotando a la derecha como acción principal
          <Link
            href={sell.href}
            aria-current={active === sell.href ? 'page' : undefined}
            aria-label={t('sell')}
            className={cn(
              'pointer-events-auto flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-primary text-[0.6875rem] font-semibold text-primary-dark shadow-float select-none',
              'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
              press,
            )}
          >
            <ShoppingBasketIcon aria-hidden="true" className="size-6" />
            <span aria-hidden="true">{t('sell')}</span>
          </Link>
        ) : null}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          className="max-h-[85dvh] gap-0 rounded-t-sheet border-line bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=closed]:duration-200 data-[state=open]:duration-250 lg:hidden"
          style={{
            transform: dy ? `translateY(${dy}px)` : undefined,
            transition: dy ? 'none' : undefined,
          }}
        >
          <div
            {...handlers}
            className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-3 px-4 pt-3 pb-2"
          >
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line" />
            <SheetTitle className="self-start text-lg font-semibold text-ink">
              {t('modulesTitle')}
            </SheetTitle>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-1 pb-2">
            {groups.map((group) => (
              <section key={group.key} className="flex shrink-0 flex-col gap-2">
                <h3 className="text-[0.6875rem] font-semibold tracking-wider text-ink-soft uppercase">
                  {t(`groups.${group.key}`)}
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {flat(group.items).map((item) => (
                    <ModuleTile
                      key={item.key}
                      item={item}
                      active={item.href === active}
                      onPick={close}
                    />
                  ))}
                </div>
              </section>
            ))}
            <section className="flex shrink-0 flex-col overflow-hidden rounded-card border border-line bg-paper">
              {secondary.map((item) => {
                const Icon = ICONS[item.key];
                const isActive = item.href === active;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={close}
                    className={cn(
                      'flex min-h-12 shrink-0 items-center gap-3 border-b border-line px-4 text-sm font-medium transition-colors',
                      isActive ? 'bg-soft text-soft-ink' : 'text-ink hover:bg-surface-hover',
                      focusRing,
                      press,
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn('size-5', isActive ? 'text-soft-ink' : 'text-ink-soft')}
                    />
                    {t(item.key)}
                  </Link>
                );
              })}
              <Link
                href="/profile"
                aria-current={active === '/profile' ? 'page' : undefined}
                onClick={close}
                className={cn(
                  'flex min-h-14 shrink-0 items-center gap-3 px-4 py-2 text-sm transition-colors',
                  active === '/profile' ? 'bg-soft text-soft-ink' : 'hover:bg-surface-hover',
                  focusRing,
                  press,
                )}
              >
                <CircleUserRoundIcon
                  aria-hidden="true"
                  className={cn(
                    'size-6 shrink-0',
                    active === '/profile' ? 'text-soft-ink' : 'text-ink-soft',
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-ink">{user.name}</span>
                  <span className="truncate text-xs text-ink-soft">{user.storeName}</span>
                </span>
                <span className="sr-only">{t('profile')}</span>
              </Link>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
