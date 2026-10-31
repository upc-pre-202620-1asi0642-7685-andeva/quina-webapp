import * as React from 'react';
import { cn } from '@/presentation/lib/utils';

/** Select nativo con el estilo de los campos (DESIGN.md §6): en el celular abre el selector del sistema. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-field border border-line bg-surface px-3.5 py-2 text-base text-ink outline-none focus-visible:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active aria-invalid:border-error-ink',
        className,
      )}
      {...props}
    />
  );
}
