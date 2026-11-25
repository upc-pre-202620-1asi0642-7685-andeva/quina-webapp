'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
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
  SparklesIcon,
} from 'lucide-react';
import type { PlanTier } from '@/core/domain/billing/plan-limits';
import type { Role } from '@/core/domain/identity/roles';
import { saveDashboardLayoutAction } from '@/presentation/actions/dashboard';
import { Button } from '@/presentation/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/presentation/components/ui/sheet';
import { cn } from '@/presentation/lib/utils';
import { WidgetSizeProvider } from './widget-size';
import {
  BENTO_ROW_CLASS,
  BENTO_SPAN_CLASS,
  buildPresetLayout,
  COLS_TO_SIZE,
  isWidgetResizable,
  normalizeWidgetDimensions,
  WIDGET_CATEGORIES,
  WIDGETS,
  type LayoutEntry,
  type PresetId,
  type WidgetCols,
  type WidgetId,
  type WidgetRows,
  type WidgetSize,
} from './widgets';

type Drag = {
  id: WidgetId;
  pointerId: number;
  grabOffsetX: number;
  grabOffsetY: number;
  x: number;
  y: number;
  lastTarget: WidgetId | null;
  startOrder: string;
};

type CornerResize = {
  id: WidgetId;
  pointerId: number;
  startX: number;
  startY: number;
  cardLeft: number;
  cardTop: number;
  moved: boolean;
  startCols: WidgetCols;
  startRows: WidgetRows;
};

const EASE = 'var(--ease-out-expo)';
const PRESET_IDS: readonly PresetId[] = ['daily', 'financial', 'complete'];
const EDGE_SCROLL_ZONE = 76;
const EDGE_MAX_SPEED = 14;

const desktopQuery = '(min-width: 1024px)';
const subscribeDesktop = (onChange: () => void) => {
  const query = matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Escoge el valor permitido más cercano a un objetivo numérico. */
function snapAllowed<T extends number>(allowed: readonly T[], target: number, fallback: T): T {
  let best = allowed[0] ?? fallback;
  let bestDiff = Math.abs(best - target);
  for (const candidate of allowed) {
    const diff = Math.abs(candidate - target);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

export function WidgetSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-full min-h-40 animate-pulse rounded-card border border-line bg-surface"
    />
  );
}

/**
 * Grilla Bento 2D del Dashboard. En "Personalizar" cada tarjeta conserva la píldora
 * superior limpia de producción (`[ ⋮⋮ ↑ ↓ 👁 ]`) con seguimiento global en `window`
 * (sin perder nunca el puntero al mover rápido) y un tirador en la esquina inferior
 * derecha para agrandar o achicar en ancho y alto en tiempo real.
 */
export function DashboardGrid({
  heading,
  layout: initial,
  defaultLayout,
  nodes,
  role,
  tier,
}: {
  heading: React.ReactNode;
  layout: LayoutEntry[];
  defaultLayout: LayoutEntry[];
  nodes: Partial<Record<WidgetId, React.ReactNode>>;
  role: Role;
  tier: PlanTier;
}) {
  const t = useTranslations('Dashboard.customize');
  const tw = useTranslations('Dashboard.widgets');
  const router = useRouter();
  const [layout, setLayout] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [resizing, setResizing] = useState<WidgetId | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [, start] = useTransition();
  const changed = useRef(false);
  const layoutRef = useRef(layout);
  const gridRef = useRef<HTMLUListElement>(null);
  const items = useRef(new Map<WidgetId, HTMLLIElement>());
  const before = useRef<Map<WidgetId, DOMRect> | null>(null);
  const drag = useRef<Drag | null>(null);
  const cornerResize = useRef<CornerResize | null>(null);
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => matchMedia(desktopQuery).matches,
    () => false,
  );

  // Solo sincroniza desde props del servidor cuando no se está editando activamente
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    if (!editing && !dragging && !resizing) {
      setLayout(initial);
    }
  }
  useLayoutEffect(() => {
    layoutRef.current = layout;
  });

  const visibleEntries = layout.filter((e) => e.visible);
  const visible = visibleEntries.map((e) => e.id);
  const hidden = layout.filter((e) => !e.visible).map((e) => e.id);

  const clearAllTransforms = () => {
    items.current.forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
    });
  };

  const capture = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      before.current = null;
      return;
    }
    const rects = new Map<WidgetId, DOMRect>();
    items.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()));
    before.current = rects;
  };

  /**
   * Posiciona la tarjeta arrastrada 1:1 bajo el puntero usando la posición actual de la
   * grilla en el viewport (`grid.getBoundingClientRect()`), evitando cualquier desfase al hacer scroll.
   */
  const placeDragged = () => {
    const d = drag.current;
    const grid = gridRef.current;
    const el = d && items.current.get(d.id);
    if (!d || !grid || !el) return;
    const gridRect = grid.getBoundingClientRect();
    const naturalLeft = gridRect.left + el.offsetLeft;
    const naturalTop = gridRect.top + el.offsetTop;
    const dx = d.x - d.grabOffsetX - naturalLeft;
    const dy = d.y - d.grabOffsetY - naturalTop;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  };

  // FLIP: cada widget parte de donde se veía antes y se desliza a su nueva celda Bento
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
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      void el.offsetWidth;
      el.style.transition = `transform 200ms ${EASE}`;
      el.style.transform = '';
    });
    placeDragged();
  }, [layout]);

  const dimsOf = (id: WidgetId, current = layoutRef.current) =>
    normalizeWidgetDimensions(
      id,
      current.find((e) => e.id === id),
    );

  const withVisible = (ids: WidgetId[], current = layoutRef.current): LayoutEntry[] => [
    ...ids.map((id) => ({ id, visible: true, ...dimsOf(id, current) })),
    ...current
      .filter((e) => !ids.includes(e.id))
      .map((e) => ({ id: e.id, visible: false, ...dimsOf(e.id, current) })),
  ];

  const persist = (next: LayoutEntry[] | null, refresh = false) => {
    const targetLayout = next ?? defaultLayout;
    capture();
    setLayout(targetLayout);
    changed.current = true;
    start(async () => {
      const result = await saveDashboardLayoutAction(next).catch(() => ({ ok: false }));
      if (!result.ok) {
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

  const announceSize = (id: WidgetId, size: WidgetSize, rows: WidgetRows) =>
    setAnnouncement(
      t('resized', {
        name: tw(`${id}.title`),
        size: t('dimensions', { size: t(`sizes.${size}`), rows }),
      }),
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

  const updateDimensions = (
    id: WidgetId,
    input: { size?: WidgetSize; cols?: WidgetCols; rows?: WidgetRows },
    saveImmediately = true,
  ) => {
    const current = layoutRef.current.find((e) => e.id === id);
    const nextDims = normalizeWidgetDimensions(id, {
      size: input.size ?? current?.size,
      cols: input.cols ?? current?.cols,
      rows: input.rows ?? current?.rows,
    });
    if (
      current &&
      current.size === nextDims.size &&
      current.cols === nextDims.cols &&
      current.rows === nextDims.rows
    ) {
      return false;
    }
    const next = layoutRef.current.map((entry) =>
      entry.id === id ? { ...entry, ...nextDims } : entry,
    );
    if (saveImmediately) {
      persist(next);
      announceSize(id, nextDims.size, nextDims.rows);
    } else {
      capture();
      setLayout(next);
      changed.current = true;
    }
    return true;
  };

  /** Cicla al siguiente tamaño permitido cuando se hace clic simple en el tirador de esquina. */
  const cycleDimensions = (id: WidgetId) => {
    const def = WIDGETS[id];
    const current = dimsOf(id);
    const combos: { cols: WidgetCols; rows: WidgetRows }[] = [];
    for (const c of def.cols) {
      for (const r of def.rows) {
        combos.push({ cols: c, rows: r });
      }
    }
    if (combos.length <= 1) return;
    const idx = combos.findIndex((c) => c.cols === current.cols && c.rows === current.rows);
    const next = combos[(idx + 1) % combos.length];
    if (!next) return;
    updateDimensions(id, { cols: next.cols, size: COLS_TO_SIZE[next.cols], rows: next.rows }, true);
  };

  const hide = (id: WidgetId) => {
    persist(withVisible(visible.filter((v) => v !== id)));
    setAnnouncement(t('hidden', { name: tw(`${id}.title`) }));
  };

  const add = (id: WidgetId) => {
    persist(withVisible([...visible, id]), !nodes[id]);
    setAnnouncement(t('added', { name: tw(`${id}.title`) }));
  };

  const applyPreset = (presetId: PresetId) => {
    const next = buildPresetLayout(presetId, role, tier);
    const needsRefresh = next.some((e) => e.visible && !nodes[e.id]);
    persist(next, needsRefresh);
    setAdding(false);
    setAnnouncement(t('presetApplied', { name: t(`presets.${presetId}.title`) }));
  };

  const resetToDefault = () => {
    const needsRefresh = defaultLayout.some((e) => e.visible && !nodes[e.id]);
    persist(null, needsRefresh);
    setAdding(false);
  };

  /**
   * Hit-test directo como en producción: detecta la tarjeta sobre la que está el puntero
   * para permitir colocar widgets en la izquierda, el medio o la derecha con total fluidez.
   * Solo cuando se arrastra un bloque de 6 columnas sobre el hueco vacío de una fila parcial
   * usa como respaldo esa fila.
   */
  const evaluateDropTarget = (d: Drag) => {
    const grid = gridRef.current;
    if (!grid) return;
    const box = grid.getBoundingClientRect();
    const px = d.x - box.left;
    const py = d.y - box.top;
    const entries = layoutRef.current.filter((x) => x.visible);
    const ids = entries.map((x) => x.id);
    const fromIndex = ids.indexOf(d.id);
    if (fromIndex === -1) return;
    const draggedEntry = entries[fromIndex];
    if (!draggedEntry) return;

    let target = ids.find((id) => {
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

    if (!target && draggedEntry.cols === 3) {
      const rowMembers = ids.filter((id) => {
        if (id === d.id) return false;
        const el = items.current.get(id);
        return el && py >= el.offsetTop && py <= el.offsetTop + el.offsetHeight;
      });
      const firstInRow = rowMembers[0];
      const lastInRow = rowMembers[rowMembers.length - 1];
      if (firstInRow && lastInRow) {
        target = fromIndex > ids.indexOf(firstInRow) ? firstInRow : lastInRow;
      }
    }

    if (!target) {
      d.lastTarget = null;
      return;
    }
    if (target === d.lastTarget) return;
    d.lastTarget = target;
    const next = [...ids];
    next.splice(ids.indexOf(target), 0, ...next.splice(fromIndex, 1));
    capture();
    setLayout(withVisible(next));
  };

  const endActiveDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(null);
    const el = items.current.get(d.id);
    if (el) {
      el.style.transition = `transform 200ms ${EASE}`;
      el.style.transform = '';
    }
    const ids = layoutRef.current.filter((x) => x.visible).map((x) => x.id);
    if (ids.join() !== d.startOrder) {
      persist(layoutRef.current);
      announceMove(d.id, ids);
    }
  };

  const finish = () => {
    if (drag.current) {
      drag.current = null;
      setDragging(null);
    }
    if (cornerResize.current) {
      cornerResize.current = null;
      setResizing(null);
    }
    before.current = null;
    clearAllTransforms();
    setEditing(false);
    if (changed.current) {
      const currentLayout = layoutRef.current;
      start(async () => {
        const result = await saveDashboardLayoutAction(currentLayout).catch(() => ({ ok: false }));
        if (!result.ok) {
          sileo.error({ title: t('saveError') });
          return;
        }
        sileo.success({ title: t('saved') });
      });
    }
    changed.current = false;
  };

  const dragCallbacksRef = useRef<{
    onMove: (e: PointerEvent) => void;
    onEnd: (e: PointerEvent) => void;
    onTick: () => void;
  }>({
    onMove: () => {},
    onEnd: () => {},
    onTick: () => {},
  });

  useLayoutEffect(() => {
    dragCallbacksRef.current = {
      onMove: (e: PointerEvent) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        d.x = e.clientX;
        d.y = e.clientY;
        placeDragged();
        evaluateDropTarget(d);
      },
      onEnd: (e: PointerEvent) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        endActiveDrag();
      },
      onTick: () => {
        const d = drag.current;
        if (!d) return;
        placeDragged();
        evaluateDropTarget(d);
      },
    };
  });

  // Seguimiento global en window durante el arrastre: imposible perder el puntero al mover rápido
  useEffect(() => {
    if (!dragging) return;
    let frameId = 0;

    const onPointerMoveWindow = (e: PointerEvent) => dragCallbacksRef.current.onMove(e);
    const onPointerUpWindow = (e: PointerEvent) => dragCallbacksRef.current.onEnd(e);
    const onScrollWindow = () => dragCallbacksRef.current.onTick();

    const tick = () => {
      const d = drag.current;
      if (!d) return;
      const vh = window.innerHeight;
      let deltaY = 0;
      if (d.y < EDGE_SCROLL_ZONE) {
        const ratio = Math.min(1, (EDGE_SCROLL_ZONE - d.y) / EDGE_SCROLL_ZONE);
        deltaY = -Math.ceil(ratio * EDGE_MAX_SPEED);
      } else if (d.y > vh - EDGE_SCROLL_ZONE) {
        const ratio = Math.min(1, (d.y - (vh - EDGE_SCROLL_ZONE)) / EDGE_SCROLL_ZONE);
        deltaY = Math.ceil(ratio * EDGE_MAX_SPEED);
      }
      if (deltaY !== 0) {
        window.scrollBy(0, deltaY);
        dragCallbacksRef.current.onTick();
      }
      frameId = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onPointerMoveWindow, { passive: true });
    window.addEventListener('pointerup', onPointerUpWindow);
    window.addEventListener('pointercancel', onPointerUpWindow);
    window.addEventListener('scroll', onScrollWindow, { passive: true });
    frameId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onPointerMoveWindow);
      window.removeEventListener('pointerup', onPointerUpWindow);
      window.removeEventListener('pointercancel', onPointerUpWindow);
      window.removeEventListener('scroll', onScrollWindow);
      cancelAnimationFrame(frameId);
    };
  }, [dragging]);

  const onPointerDown = (id: WidgetId) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = items.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = {
      id,
      pointerId: e.pointerId,
      grabOffsetX: e.clientX - rect.left,
      grabOffsetY: e.clientY - rect.top,
      x: e.clientX,
      y: e.clientY,
      lastTarget: null,
      startOrder: visible.join(),
    };
    setDragging(id);
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

  /* ---------------- Tirador de esquina inferior derecha (Bento 2D) ---------------- */

  const resizeCallbacksRef = useRef<{
    onMove: (e: PointerEvent) => void;
    onEnd: (e: PointerEvent) => void;
  }>({
    onMove: () => {},
    onEnd: () => {},
  });

  useLayoutEffect(() => {
    resizeCallbacksRef.current = {
      onMove: (e: PointerEvent) => {
        const r = cornerResize.current;
        const grid = gridRef.current;
        if (!r || !grid || r.pointerId !== e.pointerId) return;
        if (Math.hypot(e.clientX - r.startX, e.clientY - r.startY) > 6) {
          r.moved = true;
        }
        if (!r.moved) return;

        const gridRect = grid.getBoundingClientRect();
        const colWidth = gridRect.width / 3;
        const desiredWidth = Math.max(colWidth, e.clientX - r.cardLeft);
        const desiredHeight = Math.max(140, e.clientY - r.cardTop);

        const rawCols = desiredWidth / colWidth;
        const targetColNum = rawCols < 1.45 ? 1 : rawCols < 2.45 ? 2 : 3;
        const targetRowNum = desiredHeight > 315 ? 2 : 1;

        const def = WIDGETS[r.id];
        const nextCols = snapAllowed(def.cols, targetColNum, def.defaultCols);
        const nextRows = snapAllowed(def.rows, targetRowNum, def.defaultRows);

        updateDimensions(
          r.id,
          { cols: nextCols, size: COLS_TO_SIZE[nextCols], rows: nextRows },
          false,
        );
      },
      onEnd: (e: PointerEvent) => {
        const r = cornerResize.current;
        if (!r || r.pointerId !== e.pointerId) return;
        cornerResize.current = null;
        setResizing(null);

        if (!r.moved) {
          cycleDimensions(r.id);
          return;
        }

        const finalDims = dimsOf(r.id);
        if (finalDims.cols !== r.startCols || finalDims.rows !== r.startRows) {
          persist(layoutRef.current);
          announceSize(r.id, finalDims.size, finalDims.rows);
        }
      },
    };
  });

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => resizeCallbacksRef.current.onMove(e);
    const onEnd = (e: PointerEvent) => resizeCallbacksRef.current.onEnd(e);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [resizing]);

  const onCornerPointerDown = (id: WidgetId) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = items.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const current = dimsOf(id);
    cornerResize.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      cardLeft: rect.left,
      cardTop: rect.top,
      moved: false,
      startCols: current.cols,
      startRows: current.rows,
    };
    setResizing(id);
  };

  const onCornerKeyDown = (id: WidgetId) => (e: React.KeyboardEvent) => {
    const def = WIDGETS[id];
    const current = dimsOf(id);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const idx = def.cols.indexOf(current.cols);
      const nextIdx =
        e.key === 'ArrowRight' ? Math.min(def.cols.length - 1, idx + 1) : Math.max(0, idx - 1);
      const nextCols = def.cols[nextIdx];
      if (nextCols) updateDimensions(id, { cols: nextCols, size: COLS_TO_SIZE[nextCols] }, true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = def.rows.indexOf(current.rows);
      const nextIdx =
        e.key === 'ArrowDown' ? Math.min(def.rows.length - 1, idx + 1) : Math.max(0, idx - 1);
      const nextRows = def.rows[nextIdx];
      if (nextRows) updateDimensions(id, { rows: nextRows }, true);
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
              <Button variant="ghost" onClick={resetToDefault}>
                <RotateCcwIcon aria-hidden="true" />
                {t('resetShort')}
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
        <p className="rounded-card bg-soft px-4 py-3 text-sm text-soft-ink">
          {isDesktop ? t('hintDesktop') : t('hint')}
        </p>
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
            'relative grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6 xl:grid-flow-row-dense xl:grid-cols-3',
            editing && 'gap-y-10 pt-5 lg:gap-y-10',
          )}
        >
          {visibleEntries.map((entry, index) => {
            const { id, size, cols, rows } = entry;
            const name = tw(`${id}.title`);
            const resizable = isWidgetResizable(id);
            const dimLabel = t('dimensions', { size: t(`sizes.${size}`), rows });

            return (
              <li
                key={id}
                ref={(el) => {
                  if (el) items.current.set(id, el);
                  else items.current.delete(id);
                }}
                className={cn(
                  'relative min-w-0',
                  BENTO_SPAN_CLASS[size],
                  BENTO_ROW_CLASS[rows],
                  rows === 2 && 'xl:min-h-[28.5rem]',
                  editing && 'rounded-card outline-2 outline-offset-2 outline-line outline-dashed',
                  (dragging === id || resizing === id) &&
                    'z-20 rounded-card shadow-float outline-link-active',
                )}
              >
                {editing ? (
                  <>
                    {/* Píldora superior de producción: [ ⋮⋮ ↑ ↓ 👁 ] limpia y con botón de arrastre size-11 */}
                    <div
                      className={cn(
                        'absolute -top-5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 shadow-float',
                        cols === 3 ? 'left-1/2 -translate-x-1/2' : 'right-3',
                      )}
                    >
                      <button
                        type="button"
                        aria-label={t('drag', { name })}
                        aria-describedby="dashboard-drag-help"
                        onPointerDown={onPointerDown(id)}
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

                    {/* Tirador 2D en la esquina inferior derecha (estilo widgets de celular) */}
                    {resizable ? (
                      <div className="absolute -right-2 -bottom-2 z-20 hidden items-center gap-1.5 lg:inline-flex">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'pointer-events-none rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-ink-soft tabular-nums shadow-float transition-opacity',
                            resizing === id &&
                              'border-link-active bg-soft font-semibold text-soft-ink',
                          )}
                        >
                          {dimLabel}
                        </span>
                        <button
                          type="button"
                          data-testid={`resize-corner-${id}`}
                          aria-label={t('resizeCorner', { name, dimensions: dimLabel })}
                          onPointerDown={onCornerPointerDown(id)}
                          onKeyDown={onCornerKeyDown(id)}
                          className={cn(
                            'flex size-10 cursor-nwse-resize touch-none items-center justify-center rounded-full border border-line bg-surface text-ink shadow-float transition-transform select-none',
                            'hover:scale-110 hover:border-link-active hover:bg-soft hover:text-soft-ink',
                            'focus-visible:outline-2 focus-visible:outline-link-active active:scale-95',
                            resizing === id && 'scale-110 border-link-active bg-soft text-soft-ink',
                          )}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            className="size-4 shrink-0 text-link-active"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.25"
                            strokeLinecap="round"
                          >
                            <path d="M13 4v9H4" />
                            <path d="M9 8v1H8" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {/* Mientras se ordena o redimensiona, el contenido queda inerte y alineado al borde punteado */}
                <div
                  inert={editing}
                  className={cn('h-full', editing && 'pointer-events-none opacity-70 select-none')}
                >
                  <WidgetSizeProvider size={size} cols={cols} rows={rows}>
                    {nodes[id] ?? <WidgetSkeleton />}
                  </WidgetSizeProvider>
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
              : 'max-h-[85dvh] rounded-t-sheet pb-[max(1.25rem,env(safe-area-inset-bottom))]',
          )}
        >
          <div className="flex shrink-0 flex-col gap-1 px-5 pt-5 pb-3">
            <SheetTitle className="text-lg font-semibold text-ink">{t('addTitle')}</SheetTitle>
            <p className="text-sm text-ink-soft">{t('addSubtitle')}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-4">
            <section className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-ink-soft uppercase">
                <SparklesIcon aria-hidden="true" className="size-3.5" />
                {t('presetsTitle')}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_IDS.map((presetId) => (
                  <button
                    key={presetId}
                    type="button"
                    onClick={() => applyPreset(presetId)}
                    className="flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-field border border-line bg-paper px-3 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
                  >
                    <span className="text-xs font-semibold text-ink">
                      {t(`presets.${presetId}.title`)}
                    </span>
                    <span className="text-[11px] leading-tight text-ink-soft">
                      {t(`presets.${presetId}.subtitle`)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {hidden.length === 0 ? (
              <p className="rounded-field bg-paper-deep px-4 py-5 text-sm text-ink-soft">
                {t('allAdded')}
              </p>
            ) : (
              WIDGET_CATEGORIES.map((category) => {
                const categoryIds = hidden.filter((id) => WIDGETS[id].category === category);
                if (categoryIds.length === 0) return null;
                return (
                  <section key={category} className="flex flex-col gap-2">
                    <h3 className="text-[0.6875rem] font-semibold tracking-wider text-ink-soft uppercase">
                      {t(`categories.${category}`)}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {categoryIds.map((id) => (
                        <li
                          key={id}
                          className="flex items-center gap-3 rounded-card border border-line p-3"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink">
                                {tw(`${id}.title`)}
                              </span>
                              <span className="hidden rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-medium text-ink-soft lg:inline-block">
                                {t('dimensions', {
                                  size: t(`sizes.${WIDGETS[id].defaultSize}`),
                                  rows: WIDGETS[id].defaultRows,
                                })}
                              </span>
                            </div>
                            <span className="text-[13px] text-ink-soft">
                              {tw(`${id}.description`)}
                            </span>
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
                  </section>
                );
              })
            )}
            <Button variant="ghost" className="self-start" onClick={resetToDefault}>
              <RotateCcwIcon aria-hidden="true" />
              {t('reset')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
