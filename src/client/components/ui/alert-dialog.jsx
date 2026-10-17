import { forwardRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils.js';
import { buttonVariants } from '@/components/ui/button.jsx';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export const AlertDialogContent = forwardRef(function AlertDialogContent({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(59,42,26,0.45)]" />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[22px] bg-card p-6 text-foreground shadow-2xl',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
});

export function AlertDialogHeader({ className, ...props }) {
  return <div className={cn('grid gap-2', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-wrap justify-end gap-2', className)} {...props} />;
}

export const AlertDialogTitle = forwardRef(function AlertDialogTitle({ className, ...props }, ref) {
  return <AlertDialogPrimitive.Title ref={ref} className={cn('m-0 text-lg font-bold', className)} {...props} />;
});

export const AlertDialogDescription = forwardRef(function AlertDialogDescription({ className, ...props }, ref) {
  return <AlertDialogPrimitive.Description ref={ref} className={cn('m-0 text-sm text-muted-foreground wrap-anywhere', className)} {...props} />;
});

export const AlertDialogAction = forwardRef(function AlertDialogAction({ className, ...props }, ref) {
  return <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants({ variant: 'destructive' }), className)} {...props} />;
});

export const AlertDialogCancel = forwardRef(function AlertDialogCancel({ className, ...props }, ref) {
  return <AlertDialogPrimitive.Cancel ref={ref} className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />;
});
