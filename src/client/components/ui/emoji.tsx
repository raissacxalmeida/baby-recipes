import type { ReactNode } from 'react';

export type EmojiProps = { children?: ReactNode };

// Decorative: hidden from screen readers so it never changes an accessible name.
export function Emoji({ children }: EmojiProps) {
  return <span aria-hidden="true">{children}</span>;
}
