'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  EyeOffIcon,
  GripVerticalIcon,
  LayoutGridIcon,
  PlusIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { saveDashboardLayoutAction } from '@/presentation/actions/dashboard';
import { Button } from '@/presentation/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/presentation/components/ui/sheet';
import { cn } from '@/presentation/lib/utils';
import { WIDGETS, type LayoutEntry, type WidgetId } from './widgets';

type Drag = {
  id: WidgetId;
  pointerId: number;
  x0: number;
  y0: number;
  left0: number;
  top0: number;
  x: number;
  y: number;
  lastTarget: WidgetId | null;
  startOrder: string;
};

const EASE = 'var(--ease-out-expo)';

const desktopQuery = '(min-width: 1024px)';
const subscribeDesktop = (onChange: () => void) => {
  const query = matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

export function WidgetSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-full min-h-40 animate-pulse rounded-card border border-line bg-surface"
    />
  );
}

/**
 * Grilla de Inicio. En "Personalizar" cada widget se arrastra por su asa (1:1 con
 * el dedo, sin librerías), se mueve con flechas o botones y se oculta; los
 * vecinos se acomodan con FLIP y cada cambio se guarda al instante.
 */
export function DashboardGrid({
  heading,
  layout: initial,
  defaultLayout,
  nodes,
}: {
  heading: React.ReactNode;
  layout: LayoutEntry[];
  defaultLayout: LayoutEntry[];
  nodes: Partial<Record<WidgetId, React.ReactNode>>;
}) {
  const t = useTranslations('Dashboard.customize');
  const tw = useTranslations('Dashboard.widgets');
  const router = useRouter();
  const [layout, setLayout] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [, start] = useTransition();
  const changed = useRef(false);
  const layoutRef = useRef(layout);
  const gridRef = useRef<HTMLUListElement>(null);
  const items = useRef(new Map<WidgetId, HTMLLIElement>());
  const before = useRef<Map<WidgetId, DOMRect> | null>(null);
  const drag = useRef<Drag | null>(null);
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => matchMedia(desktopQuery).matches,
    () => false,
  );

  // Tras router.refresh() el servidor manda el diseño guardado
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setLayout(initial);
  }
  useLayoutEffect(() => {
    layoutRef.current = layout;
  });

  const visible = layout.filter((e) => e.visible).map((e) => e.id);
  const hidden = layout.filter((e) => !e.visible).map((e) => e.id);

  const capture = () => {
    const rects = new Map<WidgetId, DOMRect>();
    items.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()));
    before.current = rects;
  };

  const placeDragged = () => {
    const d = drag.current;
    const el = d && items.current.get(d.id);
    if (!d || !el) return;
    // Sigue al dedo respetando dónde se tomó, aunque su lugar en la grilla cambie
    const dx = d.x - d.x0 - (el.offsetLeft - d.left0);
    const dy = d.y - d.y0 - (el.offsetTop - d.top0);
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  // FLIP: cada widget parte de donde se ve ahora y se desliza a su nuevo lugar
  useLayoutEffect(() => {
    const rects = before.current;
    if (!rects) return;
    before.current = null;
    items.current.forEach((el, id) => {
      if (id === drag.current?.id) return;
      const from = rects.get(id);
      if (!from) return;
      el.style.transition = 'none';
      el.style.transform = '';
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) return;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = `transform 200ms ${EASE}`;
      el.style.transform = '';
    });
    placeDragged();
  }, [layout]);

  const withVisible = (ids: WidgetId[], current = layoutRef.current): LayoutEntry[] => [
    ...ids.map((id) => ({ id, visible: true })),
    ...current.filter((e) => !ids.includes(e.id)).map((e) => ({ id: e.id, visible: false })),
  ];

  const persist = (next: LayoutEntry[] | null, refresh = false) => {
    const previous = layoutRef.current;
    capture();
    setLayout(next ?? defaultLayout);
    changed.current = true;
    start(async () => {
      const result = await saveDashboardLayoutAction(next).catch(() => ({ ok: false }));
      if (!result.ok) {
        capture();
        setLayout(previous);
        sileo.error({ title: t('saveError') });
        return;
      }
      if (refresh) router.refresh();
    });
  };

  const announceMove = (id: WidgetId, ids: WidgetId[]) =>
    setAnnouncement(
      t('moved', { name: tw(`${id}.title`), position: ids.indexOf(id) + 1, total: ids.length }),
    );

  const move = (id: WidgetId, delta: number) => {
    const ids = [...visible];
    const from = ids.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    persist(withVisible(ids));
    announceMove(id, ids);
  };

  const hide = (id: WidgetId) => {
    persist(withVisible(visible.filter((v) => v !== id)));
    setAnnouncement(t('hidden', { name: tw(`${id}.title`) }));
  };

  const add = (id: WidgetId) => {
    // Un widget que no estaba a la vista necesita sus datos del servidor
    persist(withVisible([...visible, id]), !nodes[id]);
    setAnnouncement(t('added', { name: tw(`${id}.title`) }));
  };

  const finish = () => {
    setEditing(false);
    if (changed.current) sileo.success({ title: t('saved') });
    changed.current = false;
  };

  const onPointerDown = (id: WidgetId) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const el = items.current.get(id);
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      left0: el.offsetLeft,
      top0: el.offsetTop,
      x: e.clientX,
      y: e.clientY,
      lastTarget: null,
      startOrder: visible.join(),
    };
    setDragging(id);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const grid = gridRef.current;
    if (!d || !grid || d.pointerId !== e.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    placeDragged();
    // Se compara con el lugar de cada widget en la grilla, no con su animación
    const box = grid.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const ids = layoutRef.current.filter((x) => x.visible).map((x) => x.id);
    const target = ids.find((id) => {
      const el = items.current.get(id);
      return (
        id !== d.id &&
        el &&
        px >= el.offsetLeft &&
        px <= el.offsetLeft + el.offsetWidth &&
        py >= el.offsetTop &&
        py <= el.offsetTop + el.offsetHeight
      );
    });
    // Sin repetir el mismo cambio hasta salir del widget: evita el vaivén entre tamaños distintos
    if (!target) {
      d.lastTarget = null;
      return;
    }
    if (target === d.lastTarget) return;
    d.lastTarget = target;
    const next = [...ids];
    next.splice(ids.indexOf(target), 0, ...next.splice(ids.indexOf(d.id), 1));
    capture();
    setLayout(withVisible(next));
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
    const el = items.current.get(d.id);
    if (el) {
      el.style.transition = `transform 250ms ${EASE}`;
      el.style.transform = '';
    }
    const ids = layoutRef.current.filter((x) => x.visible).map((x) => x.id);
    if (ids.join() !== d.startOrder) {
      persist(layoutRef.current);
      announceMove(d.id, ids);
    }
  };

  const onHandleKey = (id: WidgetId) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      move(id, -1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      move(id, 1);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {heading}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <PlusIcon aria-hidden="true" />
                {t('add')}
              </Button>
              <Button onClick={finish}>
                <CheckIcon aria-hidden="true" />
                {t('done')}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <SlidersHorizontalIcon aria-hidden="true" />
              {t('customize')}
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <p className="rounded-card bg-soft px-4 py-3 text-sm text-soft-ink">{t('hint')}</p>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6">
          <LayoutGridIcon aria-hidden="true" className="size-6 text-ink-soft" />
          <p className="text-base text-ink">{t('empty')}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(true);
              setAdding(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('add')}
          </Button>
        </div>
      ) : (
        <ul
          ref={gridRef}
          aria-label={t('gridLabel')}
          className={cn(
            'relative grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6 xl:grid-cols-3',
            // Espacio para la barra de cada tarjeta, que se apoya en su borde superior
            editing && 'gap-y-10 pt-5 lg:gap-y-10',
          )}
        >
          {visible.map((id, index) => {
            const name = tw(`${id}.title`);
            return (
              <li
                key={id}
                ref={(el) => {
                  if (el) items.current.set(id, el);
                  else items.current.delete(id);
                }}
                className={cn(
                  'relative',
                  WIDGETS[id].wide && 'md:col-span-2 xl:col-span-3',
                  editing && 'rounded-card outline-2 outline-offset-2 outline-line outline-dashed',
                  dragging === id && 'z-20 rounded-card shadow-float',
                )}
              >
                {editing ? (
                  <div className="absolute -top-5 right-3 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 shadow-float">
                    <button
                      type="button"
                      aria-label={t('drag', { name })}
                      aria-describedby="dashboard-drag-help"
                      onPointerDown={onPointerDown(id)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerEnd}
                      onPointerCancel={onPointerEnd}
                      onKeyDown={onHandleKey(id)}
                      className="flex size-11 cursor-grab touch-none items-center justify-center rounded-full text-ink-soft select-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:cursor-grabbing"
                    >
                      <GripVerticalIcon aria-hidden="true" className="size-5" />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('moveUp', { name })}
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUpIcon aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('moveDown', { name })}
                      disabled={index === visible.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDownIcon aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('hide', { name })}
                      onClick={() => hide(id)}
                    >
                      <EyeOffIcon aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
                {/* Mientras se ordena, el contenido no responde a toques */}
                <div
                  inert={editing}
                  className={cn('h-full', editing && 'pointer-events-none opacity-70 select-none')}
                >
                  {nodes[id] ?? <WidgetSkeleton />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p id="dashboard-drag-help" className="sr-only">
        {t('dragHelp')}
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          aria-describedby={undefined}
          className={cn(
            'gap-0 border-line bg-surface data-[state=closed]:duration-200 data-[state=open]:duration-250',
            isDesktop
              ? 'w-full sm:max-w-md'
              : 'max-h-[85dvh] rounded-t-sheet pb-[max(1rem,env(safe-area-inset-bottom))]',
          )}
        >
          <div className="flex flex-col gap-1 px-5 pt-5 pb-3">
            <SheetTitle className="text-lg font-semibold text-ink">{t('addTitle')}</SheetTitle>
            <p className="text-sm text-ink-soft">{t('addSubtitle')}</p>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto overscroll-contain px-5 pb-4">
            {hidden.length === 0 ? (
              <p className="rounded-field bg-paper-deep px-4 py-5 text-sm text-ink-soft">
                {t('allAdded')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {hidden.map((id) => (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-card border border-line p-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-semibold text-ink">{tw(`${id}.title`)}</span>
                      <span className="text-[13px] text-ink-soft">{tw(`${id}.description`)}</span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={t('addOne', { name: tw(`${id}.title`) })}
                      onClick={() => add(id)}
                    >
                      <PlusIcon aria-hidden="true" />
                      {t('addShort')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="ghost"
              className="mt-2 self-start"
              onClick={() => {
                persist(null, true);
                setAdding(false);
              }}
            >
              <RotateCcwIcon aria-hidden="true" />
              {t('reset')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
