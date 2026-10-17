import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';
import { Input } from '@/components/ui/input.jsx';

// The label wraps the input, so the label text is the input's accessible name.
export const Field = forwardRef(function Field({ label, className, ...inputProps }, ref) {
  return (
    <label className={cn('m-0 grid gap-2 text-sm font-semibold', className)}>
      {label}
      <Input ref={ref} {...inputProps} />
    </label>
  );
});
