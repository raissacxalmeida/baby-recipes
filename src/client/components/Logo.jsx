import { cn } from '@/lib/utils.js';

export const NAME = 'Tiny Pantry';
export const TAGLINE = 'recipes for little eaters';

// An open jar with a sprout growing out of it and a heart on the front. Decorative: the name next to it says it all.
export function LogoMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path d="M60 40 V20" stroke="#6F9C80" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 28 C49 28 43 21 43 12 C54 12 60 19 60 28Z" fill="#A9CBB5" />
      <path d="M60 22 C60 12 66 6 77 6 C77 16 71 22 60 22Z" fill="#8DB59A" />
      <rect x="34" y="36" width="52" height="12" rx="6" fill="#8FAFD6" />
      <rect x="28" y="44" width="64" height="68" rx="24" fill="#CFE0F4" />
      <path d="M60 98 C44 87 49 71 60 78 C71 71 76 87 60 98Z" fill="#F6B9A6" />
    </svg>
  );
}

// 'sm' is one row for the app header; 'lg' stacks the mark over the name for the pages shown before logging in.
export default function Logo({ size = 'sm', tagline = false }) {
  const large = size === 'lg';
  return (
    <div className={cn('flex min-w-0 items-center gap-2', large && 'flex-col gap-1 text-center')}>
      <LogoMark className={cn('shrink-0', large ? 'h-20 w-20' : 'h-8 w-8')} />
      <span className={cn('truncate font-extrabold tracking-tight text-[#4A6A94]', large ? 'text-3xl' : 'text-lg')}>{NAME}</span>
      {tagline && <p className="m-0 text-sm font-semibold text-muted-foreground">{TAGLINE}</p>}
    </div>
  );
}
