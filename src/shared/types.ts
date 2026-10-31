import type { LANGUAGES } from './languages.js';
import type { GROUPS } from './recipeGroup.js';

export type Language = (typeof LANGUAGES)[number];

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
