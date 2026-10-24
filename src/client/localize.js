// The browser keeps the English recipe and lays a translation over it for display only.
export const titleKey = (language, title) => `${language}\n${title}`;
export const titleIn = (cache, language, title) => cache[titleKey(language, title)] ?? title;

// Ingredients keep their English name as `original`: the emoji and the checks read English.
export function localizeRecipe(recipe, translation) {
  if (
    !translation
    || translation.ingredients?.length !== recipe.ingredients.length
    || translation.steps?.length !== recipe.steps.length
  ) return recipe;
  return {
    ...recipe,
    title: translation.title,
    ingredients: recipe.ingredients.map((i, n) => ({ ...i, name: translation.ingredients[n], original: i.name })),
    steps: translation.steps,
  };
}
