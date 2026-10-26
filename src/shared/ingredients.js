function singular(word) {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

// The plural rule is English; words typed in another language are only lower-cased and split.
export function normalizeIngredient(s, { plurals = true } = {}) {
  return s.toLowerCase().split(/[\s,;:()/]+/).filter(Boolean).map((word) => (plurals ? singular(word) : word)).join(' ');
}

export function parseIngredientList(raw, options) {
  return [...new Set(raw.map((s) => normalizeIngredient(s, options)).filter(Boolean))];
}

export function isListed(recipeIngredientName, list) {
  const padded = ` ${normalizeIngredient(recipeIngredientName)} `;
  return list.some((item) => padded.includes(` ${normalizeIngredient(item)} `));
}
