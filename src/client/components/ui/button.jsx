import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

export const buttonVariants = cva(
  'm-0 inline-flex items-center justify-center gap-2 rounded-control text-center text-[15px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-primary-edge hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:active:translate-y-0',
        outline: 'border border-input bg-card text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground shadow-[0_3px_0_#8f2a14] hover:brightness-105 active:translate-y-0.5 active:shadow-none',
        ghost: 'text-foreground hover:bg-muted',
      },
      size: {
        default: 'min-h-11 px-5 py-2',
        sm: 'min-h-9 px-3 py-1 text-sm',
        icon: 'h-8 w-8 rounded-full p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export const Button = forwardRef(function Button({ className, variant, size, asChild = false, type = 'button', ...props }, ref) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
