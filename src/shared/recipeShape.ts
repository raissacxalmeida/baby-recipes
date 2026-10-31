import type { Recipe } from './types.js';

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

// Same shape check the browser used for stored recipes; the server now applies it to client input.
export const isRecipe = (r: unknown): r is Recipe =>
  isObject(r) &&
  typeof r.id === 'string' && typeof r.title === 'string' &&
  typeof r.basePortions === 'number' && Number.isInteger(r.basePortions) && r.basePortions >= 1 && r.basePortions <= 12 &&
  Array.isArray(r.ingredients) && r.ingredients.every((i: unknown) => isObject(i) && typeof i.name === 'string' && typeof i.grams === 'number') &&
  Array.isArray(r.steps) && r.steps.every((s: unknown) => typeof s === 'string') &&
  Array.isArray(r.allergens);
