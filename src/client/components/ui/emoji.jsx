// Decorative: hidden from screen readers so it never changes an accessible name.
export function Emoji({ children }) {
  return <span aria-hidden="true">{children}</span>;
}
