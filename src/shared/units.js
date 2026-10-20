// Whole grams below a kilo, otherwise kilos with up to two decimals, using the decimal mark of `language`.
export function formatAmount(grams, language = 'en') {
  if (grams < 1000) return `${Math.round(grams)} g`;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(Math.round(grams / 10) / 100)} kg`;
}

export function scaleRecipe(recipe, portions) {
  if (!Number.isInteger(portions) || portions < 1 || portions > 12) {
    throw new RangeError('Portions must be a whole number from 1 to 12');
  }
  const factor = portions / recipe.basePortions;
  return {
    ...recipe,
    basePortions: portions,
    ingredients: recipe.ingredients.map((i) => ({ ...i, grams: Math.max(1, Math.round(i.grams * factor)) })),
  };
}
