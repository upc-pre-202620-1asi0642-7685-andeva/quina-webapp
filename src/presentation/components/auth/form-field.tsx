import * as React from 'react';
import { Label } from '@/presentation/components/ui/label';

export type FormFieldControlProps = {
  id: string;
  'aria-describedby': string;
  'aria-invalid': boolean;
};

export type FormFieldProps = {
  id: string;
  label: string;
  hint: string;
  error?: string | undefined;
  children: (props: FormFieldControlProps) => React.ReactNode;
};

export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error),
      })}
      <p id={hintId} className="text-[13px] leading-snug text-ink-soft">
        {hint}
      </p>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[13px] leading-snug font-medium text-error-ink"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
