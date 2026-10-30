import * as React from 'react';
import { cn } from '@/presentation/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-field border border-line bg-surface px-3.5 py-2 text-base text-ink transition-colors outline-none placeholder:text-ink-soft disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
        'aria-invalid:border-error-ink',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
