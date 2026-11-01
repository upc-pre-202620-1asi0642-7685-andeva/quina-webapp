import * as React from 'react';
import { cn } from '@/presentation/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Mismos tokens que Input (DESIGN.md §7.2); 16 px para que el celular no haga zoom
        'flex field-sizing-content min-h-20 w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-base text-ink transition-colors outline-none placeholder:text-ink-soft disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
        'aria-invalid:border-error-ink',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
