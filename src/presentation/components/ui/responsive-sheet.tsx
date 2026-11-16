'use client';

import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/presentation/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { useDragToClose } from '@/presentation/lib/use-drag-to-close';
import { cn } from '@/presentation/lib/utils';

/**
 * Hoja inferior arrastrable en celular (< 1024 px) y diálogo centrado en escritorio (DESIGN.md §7.3).
 * Respeta prefers-reduced-motion, env(safe-area-inset-bottom) y overscroll-contain.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel = 'Cerrar',
  maxWidthClass = 'lg:max-w-lg',
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  maxWidthClass?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const close = () => onOpenChange(false);
  const { dy, handlers } = useDragToClose(close);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          'max-h-[90dvh] gap-0 overflow-hidden rounded-t-sheet border-line bg-surface p-0 pb-[max(1rem,env(safe-area-inset-bottom))] ease-(--ease-out-expo) data-[state=closed]:duration-150 data-[state=open]:duration-250 lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-h-[85dvh] lg:w-full lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:border lg:pb-0 lg:shadow-float',
          maxWidthClass,
        )}
        style={{
          transform: dy ? `translateY(${dy}px)` : undefined,
          transition: dy ? 'none' : undefined,
        }}
      >
        <div
          {...handlers}
          className="flex shrink-0 cursor-grab touch-none flex-col gap-1.5 border-b border-line px-4 pt-3 pb-3 lg:cursor-default lg:px-6 lg:pt-5 lg:pb-4"
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-line lg:hidden"
          />
          <div className="flex w-full items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <SheetTitle className="text-lg leading-snug font-semibold text-ink">
                {title}
              </SheetTitle>
              {description ? (
                <SheetDescription className="text-sm text-ink-soft">{description}</SheetDescription>
              ) : (
                <SheetDescription className="sr-only">{title}</SheetDescription>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              className="-mr-2 shrink-0"
            >
              <XIcon aria-hidden="true" />
              <span className="sr-only">{closeLabel}</span>
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 lg:p-6">
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-4 pt-3 pb-1 sm:flex-row sm:justify-end lg:px-6 lg:py-4">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
