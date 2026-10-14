export function formatAmount(grams) {
  if (grams < 1000) return `${Math.round(grams)} g`;
  return `${Math.round(grams / 10) / 100} kg`;
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

export function ageLabel(months) {
  return months === 1 ? '1 month' : `${months} months`;
}
