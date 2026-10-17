import { cn } from '@/lib/utils.js';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-card border border-border bg-card p-4 shadow-card', className)} {...props} />;
}
