import type { ApiRecipe, RecipeTranslation } from './apiTypes.js';

// The browser keeps the English recipe and lays a translation over it for display only.
export const titleKey = (language: string, title: string): string => `${language}\n${title}`;
export const titleIn = (cache: Record<string, string>, language: string, title: string): string => cache[titleKey(language, title)] ?? title;

// Ingredients keep their English name as `original`: the emoji and the checks read English.
export function localizeRecipe(recipe: ApiRecipe, translation: RecipeTranslation | null | undefined): ApiRecipe {
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
