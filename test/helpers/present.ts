// The value a lookup (closest, querySelector, Array.find, ...) found. Before types, a missing one failed the test with a
// TypeError on the next property read; this fails it at the lookup instead, and narrows away the null for TypeScript.
export function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error(`expected a value, got ${value}`);
  return value;
}
