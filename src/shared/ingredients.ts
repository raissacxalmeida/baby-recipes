function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

// The plural rule is English; words typed in another language are only lower-cased and split.
export function normalizeIngredient(s: string, { plurals = true }: { plurals?: boolean } = {}): string {
  return s.toLowerCase().split(/[\s,;:()/]+/).filter(Boolean).map((word) => (plurals ? singular(word) : word)).join(' ');
}

export function parseIngredientList(raw: readonly string[], options?: { plurals?: boolean }): string[] {
  return [...new Set(raw.map((s) => normalizeIngredient(s, options)).filter(Boolean))];
}

export function isListed(recipeIngredientName: string, list: readonly string[]): boolean {
  const padded = ` ${normalizeIngredient(recipeIngredientName)} `;
  return list.some((item) => padded.includes(` ${normalizeIngredient(item)} `));
}
