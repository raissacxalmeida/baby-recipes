import { cn } from '@/lib/utils.js';

const styles = {
  error: 'rounded-control bg-[#fdeae5] px-3 py-2 text-sm font-semibold text-destructive',
  note: 'rounded-control border border-note-border bg-note px-3 py-2 text-sm',
  info: 'text-sm text-muted-foreground',
};
const roles = { error: 'alert', note: 'note', info: undefined };

export function Notice({ kind = 'info', className, ...props }) {
  return <p role={roles[kind]} className={cn('m-0', styles[kind], className)} {...props} />;
}
