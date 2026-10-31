import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/presentation/lib/utils';

type Tone = 'success' | 'warning' | 'error';

const TONES: Record<Tone, string> = {
  success: 'border-success/40 bg-primary-soft text-success-ink dark:bg-success/12',
  warning: 'border-amber/50 bg-amber/12 text-amber-ink',
  error: 'border-error/50 bg-error/12 text-error-ink',
};

const ICONS = { success: CircleCheckIcon, warning: TriangleAlertIcon, error: CircleAlertIcon };

/** Aviso dentro de la página: confirmaciones y errores que piden una acción (DESIGN.md §7.3). */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'success' ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-3 rounded-card border px-4 py-3 text-sm font-medium',
        TONES[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
