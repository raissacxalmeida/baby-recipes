import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold', {
  variants: {
    variant: {
      default: 'bg-chip text-foreground',
      warm: 'bg-warm px-2 py-0.5 text-xs text-warm-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
