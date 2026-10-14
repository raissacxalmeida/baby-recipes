function singular(word) {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

export function normalizeIngredient(s) {
  return s.trim().toLowerCase().split(/\s+/).filter(Boolean).map(singular).join(' ');
}

export function parseIngredientList(raw) {
  return [...new Set(raw.map(normalizeIngredient).filter(Boolean))];
}

export function isListed(recipeIngredientName, list) {
  const padded = ` ${normalizeIngredient(recipeIngredientName)} `;
  return list.some((item) => padded.includes(` ${normalizeIngredient(item)} `));
}
