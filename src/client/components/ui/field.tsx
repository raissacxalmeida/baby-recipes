import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils.js';
import { Input, type InputProps } from '@/components/ui/input.jsx';

// The label wraps the input, so the label text is the input's accessible name.
export type FieldProps = InputProps & { label: ReactNode };

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, className, ...inputProps }, ref) {
  return (
    <label className={cn('m-0 grid gap-2 text-sm font-semibold wrap-anywhere', className)}>
      {label}
      <Input ref={ref} {...inputProps} />
    </label>
  );
});
