import type { DEFAULT_LANGUAGE, LANGUAGES } from './languages.js';
import type { GROUPS } from './recipeGroup.js';

export type Language = (typeof LANGUAGES)[number];

// The languages recipe text is translated into (every language but the default, English).
export type TranslatedLanguage = Exclude<Language, typeof DEFAULT_LANGUAGE>;

export type GroupName = (typeof GROUPS)[number]['name'];

export interface Ingredient {
  name: string;
  grams: number;
}

export interface Recipe {
  id: string;
  title: string;
  basePortions: number;
  ingredients: Ingredient[];
  steps: string[];
  allergens: string[];
  // Present on recipes the server builds; isRecipe does not check it.
  texture?: string;
}
