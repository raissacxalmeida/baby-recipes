import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils.js';

export type CardProps = ComponentPropsWithoutRef<'div'>;

export function Card({ className, ...props }: CardProps) {
  return <div className={cn('rounded-card border border-border bg-card p-4 shadow-card', className)} {...props} />;
}
