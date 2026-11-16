'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangleIcon,
  BellIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  GemIcon,
  LanguagesIcon,
  LogOutIcon,
  PackageIcon,
  PackagePlusIcon,
  PlusIcon,
  SettingsIcon,
  ShoppingBasketIcon,
  ShoppingCartIcon,
  SunMoonIcon,
  TruckIcon,
  UserPlusIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { authClient } from '@/infrastructure/auth/auth-client';
import { clearOfflinePages } from '@/presentation/components/pwa/pwa';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/presentation/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/presentation/components/ui/popover';
import { cn } from '@/presentation/lib/utils';
import type { AppNotification } from '@/presentation/queries/notifications';
import type { QuickAction, QuickKey } from './nav-items';

const press =
  'transition-[transform,color,background-color] duration-150 ease-(--ease-out-expo) active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100';
const focusRing = 'outline-none focus-visible:outline-2 focus-visible:outline-link-active';
// Capas flotantes de Quina (DESIGN.md §6): tarjeta, borde de línea y sombra de flotante
const layer = 'rounded-card border-line bg-surface p-1.5 text-ink shadow-float';
const itemClass = 'h-10 gap-3 rounded-field px-3 text-sm [&_svg]:size-[18px] [&_svg]:text-ink-soft';

const QUICK_ICONS: Record<QuickKey, LucideIcon> = {
  newSale: ShoppingBasketIcon,
  newCustomer: UserPlusIcon,
  newProduct: PackagePlusIcon,
  newPurchase: ShoppingCartIcon,
  newSupplier: TruckIcon,
  inviteEmployee: UsersRoundIcon,
};

/** Botón "Crear" (como el de Canva): lo de todos los días, a un toque desde cualquier pantalla. */
export function CreateMenu({
  actions,
  collapsed = false,
}: {
  actions: QuickAction[];
  collapsed?: boolean;
}) {
  const t = useTranslations('Shell.create');
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={collapsed ? t('label') : undefined}
        className={cn(
          'flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-dark shadow-sm',
          collapsed ? 'size-11' : 'h-11 w-full text-sm',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
          press,
        )}
      >
        <PlusIcon aria-hidden="true" className="size-5" strokeWidth={2.5} />
        {collapsed ? null : t('label')}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? 'right' : 'bottom'}
        align="start"
        sideOffset={8}
        className={cn(layer, 'w-64')}
      >
        <DropdownMenuLabel className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wider text-ink-soft uppercase">
          {t('title')}
        </DropdownMenuLabel>
        {actions.map((action) => {
          const Icon = QUICK_ICONS[action.key];
          return (
            <DropdownMenuItem key={action.key} asChild className={itemClass}>
              <Link href={action.href}>
                <Icon aria-hidden="true" />
                {t(action.key)}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------- Tema ---------------------------------- */

type ThemeChoice = 'light' | 'dark' | 'system';

function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Mismo contrato que el script del <head>: `localStorage.theme` y `data-theme` en <html>. */
function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', choice);
  } catch {
    // Sin almacenamiento (modo privado): el cambio vale solo para esta visita
  }
  const resolved =
    choice === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : choice;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-soft font-semibold text-soft-ink',
        className,
      )}
    >
      {initials || <CircleUserRoundIcon className="size-5" />}
    </span>
  );
}

/** Menú de cuenta al estilo Canva: quién eres, tu tienda, tema, plan y salir. */
export function ProfileMenu({
  user,
  storeName,
  canManageStore,
  collapsed = false,
  compact = false,
}: {
  user: { name: string; email: string };
  storeName: string;
  canManageStore: boolean;
  collapsed?: boolean;
  /** Encabezado del celular: solo el avatar. */
  compact?: boolean;
}) {
  const t = useTranslations('Shell.account');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      // US22: lo guardado para leer sin señal no se queda en un celular compartido
      await clearOfflinePages();
      window.location.replace('/app/login');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => (open ? setTheme(readThemeChoice()) : null)}>
      <DropdownMenuTrigger
        className={cn(
          'flex min-w-0 items-center gap-3 rounded-card text-left text-sm hover:bg-surface-hover',
          compact || collapsed ? 'size-11 justify-center rounded-full' : 'w-full px-2 py-1.5',
          focusRing,
          press,
        )}
      >
        {/* Con solo el avatar, el nombre accesible es "Abrir menú": las iniciales no se leen */}
        <span aria-hidden={compact || collapsed ? true : undefined} className="contents">
          <Avatar name={user.name} className={compact ? 'size-8 text-xs' : 'size-9 text-sm'} />
        </span>
        {compact || collapsed ? <span className="sr-only">{t('open')}</span> : null}
        {compact || collapsed ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-ink">{user.name}</span>
              <span className="truncate text-xs text-ink-soft">{storeName}</span>
            </span>
            {/* El chevron vive dentro del botón: todo el bloque abre el menú */}
            <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        // Con la barra abierta sube sobre la tarjeta; plegada sale al costado, como Canva
        side={compact ? 'bottom' : collapsed ? 'right' : 'top'}
        align={compact ? 'end' : 'start'}
        sideOffset={compact ? 8 : 12}
        className={cn(layer, 'w-72')}
      >
        <div className="flex items-center gap-3 px-3 pt-2 pb-3">
          <Avatar name={user.name} className="size-11 text-base" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ink">{user.name}</span>
            <span className="truncate text-xs text-ink-soft">{user.email}</span>
            <span className="truncate text-xs text-ink-soft">{storeName}</span>
          </div>
        </div>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem asChild className={itemClass}>
          <Link href="/profile">
            <CircleUserRoundIcon aria-hidden="true" />
            {t('profile')}
          </Link>
        </DropdownMenuItem>
        {canManageStore ? (
          <DropdownMenuItem asChild className={itemClass}>
            <Link href="/settings">
              <SettingsIcon aria-hidden="true" />
              {t('settings')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={itemClass}>
            <SunMoonIcon aria-hidden="true" />
            {t('theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn(layer, 'w-44')}>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => {
                const choice = value as ThemeChoice;
                setTheme(choice);
                applyTheme(choice);
              }}
            >
              {(['light', 'dark', 'system'] as const).map((choice) => (
                <DropdownMenuRadioItem
                  key={choice}
                  value={choice}
                  className="h-10 rounded-field text-sm"
                >
                  {t(`themes.${choice}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild className={itemClass}>
          <Link href="/profile#locale">
            <LanguagesIcon aria-hidden="true" />
            {t('language')}
          </Link>
        </DropdownMenuItem>
        {canManageStore ? (
          <DropdownMenuItem asChild className={itemClass}>
            <Link href="/settings/subscription">
              <GemIcon aria-hidden="true" />
              {t('plans')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem
          className={itemClass}
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOutIcon aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ----------------------------- Notificaciones ----------------------------- */

const READ_KEY = 'quina-notifications-read';
const readListeners = new Set<() => void>();

function readIds(): string {
  try {
    return localStorage.getItem(READ_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function saveIds(ids: string[]) {
  try {
    // Solo los avisos vigentes: la lista no crece sin fin
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    // Sin almacenamiento: se vuelven a ver como nuevos en la próxima visita
  }
  readListeners.forEach((listener) => listener());
}

/** Lo leído es una comodidad de este navegador (no hace falta compartirlo entre equipos). */
function useReadIds(): Set<string> {
  const raw = useSyncExternalStore(
    (onChange) => {
      readListeners.add(onChange);
      return () => readListeners.delete(onChange);
    },
    readIds,
    () => '[]',
  );
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/* Avisos en vivo: un solo sondeo compartido por las dos campanas (barra y celular) */
const POLL_MS = 30_000;
let liveItems: AppNotification[] | null = null;
const liveListeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | undefined;

function emitLive() {
  liveListeners.forEach((listener) => listener());
}

async function pollNotifications() {
  // Pestaña oculta: no consulta; al volver a ella se pide de inmediato
  if (document.visibilityState !== 'visible') return;
  try {
    const res = await fetch('/app/api/notifications', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { items: AppNotification[] };
    liveItems = data.items;
    emitLive();
  } catch {
    // Sin conexión: se queda con lo último que llegó
  }
}

function subscribeLive(onChange: () => void) {
  liveListeners.add(onChange);
  if (liveListeners.size === 1) {
    pollTimer = setInterval(pollNotifications, POLL_MS);
    document.addEventListener('visibilitychange', pollNotifications);
  }
  return () => {
    liveListeners.delete(onChange);
    if (liveListeners.size === 0) {
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', pollNotifications);
    }
  };
}

/** Lo del servidor al navegar y, entre navegaciones, lo que trae el sondeo. */
function useLiveNotifications(initial: AppNotification[]): AppNotification[] {
  const live = useSyncExternalStore(
    subscribeLive,
    () => liveItems,
    () => null,
  );
  // El layout trae datos frescos en cada navegación: mandan sobre el último sondeo
  useEffect(() => {
    liveItems = null;
    emitLive();
  }, [initial]);
  return live ?? initial;
}

const KIND_ICON: Record<AppNotification['kind'], LucideIcon> = {
  overdue: AlertTriangleIcon,
  dueSoon: CalendarClockIcon,
  lowStock: PackageIcon,
  plan: GemIcon,
};

const TONE: Record<AppNotification['tone'], string> = {
  error: 'bg-error/12 text-error-ink',
  warning: 'bg-amber/12 text-amber-ink',
  info: 'bg-soft text-soft-ink',
};

/** Campana de avisos al estilo Canva: panel con "Marcar todo como leído" y estado vacío ilustrado. */
export function NotificationsMenu({
  items: initialItems,
  collapsed = false,
  compact = false,
}: {
  items: AppNotification[];
  collapsed?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations('Shell.notifications');
  const row = !compact && !collapsed;
  const items = useLiveNotifications(initialItems);
  const read = useReadIds();
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !read.has(item.id)).length;

  // Si un aviso deja de existir, se olvida su marca de leído
  useEffect(() => {
    const live = new Set(items.map((item) => item.id));
    const kept = [...read].filter((id) => live.has(id));
    if (kept.length !== read.size) saveIds(kept);
  }, [items, read]);

  const markAll = () => saveIds(items.map((item) => item.id));
  const markOne = (id: string) => saveIds([...new Set([...read, id])]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        // Con texto a la vista, el nombre sale del contenido (WCAG 2.5.3); solo la campana lleva etiqueta
        aria-label={row ? undefined : unread > 0 ? t('openUnread', { count: unread }) : t('open')}
        className={cn(
          'relative flex shrink-0 items-center text-ink-soft hover:bg-surface-hover hover:text-ink',
          // Barra abierta: fila completa con texto, como un ítem más del menú
          row
            ? 'h-10 w-full gap-3 rounded-full px-4 text-sm font-medium'
            : 'size-11 justify-center rounded-full',
          open ? 'bg-paper-deep text-ink' : '',
          focusRing,
          press,
        )}
      >
        <BellIcon aria-hidden="true" className={compact ? 'size-6' : 'size-5'} />
        {row ? <span className="truncate">{t('title')}</span> : null}
        {unread > 0 ? (
          <span
            className={cn(
              'flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-error px-1 text-[0.625rem] font-bold text-white tabular-nums',
              row ? 'ml-auto' : 'absolute top-1.5 right-1.5 ring-2 ring-surface',
            )}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
        {row && unread > 0 ? <span className="sr-only">{t('unread')}</span> : null}
      </PopoverTrigger>
      <PopoverContent
        // Con la barra abierta sube sobre el botón (donde ya está el cursor); plegada sale al costado
        side={compact ? 'bottom' : collapsed ? 'right' : 'top'}
        align={compact ? 'end' : collapsed ? 'end' : 'start'}
        sideOffset={8}
        collisionPadding={16}
        className={cn(
          'flex max-h-[min(32rem,calc(100dvh-2rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden p-0',
          '--ease-out-expo duration-120 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:duration-75',
          layer,
          'p-0',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold text-ink">{t('title')}</h2>
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            className={cn(
              'rounded-full px-2 py-1 text-xs font-medium text-link-active hover:bg-surface-hover disabled:text-ink-soft disabled:hover:bg-transparent',
              focusRing,
            )}
          >
            {t('markAll')}
          </button>
        </header>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            {/* Ilustración mínima con tokens (DESIGN.md §7.3): campana con punto verde */}
            <span className="relative flex size-20 items-center justify-center rounded-full bg-soft">
              <BellIcon aria-hidden="true" className="size-9 text-soft-ink" />
              <span className="absolute top-3.5 right-3.5 size-4 rounded-full bg-primary ring-4 ring-surface" />
            </span>
            <p className="max-w-56 text-sm text-ink-soft">{t('empty')}</p>
          </div>
        ) : (
          <ul className="flex flex-col overflow-y-auto overscroll-contain p-1.5">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const isUnread = !read.has(item.id);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      markOne(item.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-start gap-3 rounded-field px-3 py-2.5 hover:bg-surface-hover',
                      focusRing,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                        TONE[item.tone],
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={cn(
                          'text-sm text-ink',
                          isUnread ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="text-xs text-ink-soft tabular-nums">{item.body}</span>
                    </span>
                    {isUnread ? (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-link-active">
                        <span className="sr-only">{t('unread')}</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
