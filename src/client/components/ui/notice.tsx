import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils.js';

export type NoticeKind = 'error' | 'note' | 'info';

const styles: Record<NoticeKind, string> = {
  error: 'rounded-control bg-[#fdeae5] px-3 py-2 text-sm font-semibold text-destructive',
  note: 'rounded-control border border-note-border bg-note px-3 py-2 text-sm',
  info: 'text-sm text-muted-foreground',
};
const roles: Record<NoticeKind, string | undefined> = { error: 'alert', note: 'note', info: undefined };

export type NoticeProps = ComponentPropsWithoutRef<'p'> & { kind?: NoticeKind };

export function Notice({ kind = 'info', className, ...props }: NoticeProps) {
  return <p role={roles[kind]} className={cn('m-0', styles[kind], className)} {...props} />;
}
