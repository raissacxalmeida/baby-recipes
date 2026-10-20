import { ageInMonths } from '../shared/age.js';
import { isListed, parseIngredientList } from '../shared/ingredients.js';
import { AppError } from './errors.js';
import { checkSafety, detectAllergens } from './safety.js';
import { validateRecipe } from './recipe.js';

export { AppError };

const MAX_ATTEMPTS = 3;
const MIN_MONTHS = 6;
const MAX_INGREDIENTS = 30;
const MAX_INGREDIENT_LENGTH = 50;

export const normalizeTitle = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

export function validateRequest({ birthdate, ingredients, exclude }, now) {
  const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (!isStrings(ingredients ?? []) || !isStrings(exclude ?? [])) {
    throw new AppError('invalid-input', 'Ingredients and excluded titles must be lists of text');
  }
  if ((ingredients ?? []).length > MAX_INGREDIENTS || (ingredients ?? []).some((s) => s.length > MAX_INGREDIENT_LENGTH)) {
    throw new AppError('invalid-input', `Use at most ${MAX_INGREDIENTS} ingredients of ${MAX_INGREDIENT_LENGTH} characters each`, {
      key: 'err.ingredientsLimit', params: { maxItems: MAX_INGREDIENTS, maxLength: MAX_INGREDIENT_LENGTH },
    });
  }
  let ageMonths;
  try {
    ageMonths = ageInMonths(birthdate, now());
  } catch (err) {
    throw new AppError('invalid-input', err.message, { key: err.key });
  }
  const list = parseIngredientList(ingredients ?? []);
  if (list.length === 0) throw new AppError('invalid-input', 'Add at least one ingredient', { key: 'err.ingredientsNeeded' });
  if (ageMonths < MIN_MONTHS) {
    throw new AppError('too-young', 'Solid foods usually start around 6 months, so no recipe is suggested yet', { key: 'err.tooYoung' });
  }
  return { ageMonths, list };
}

// The recipe as the browser receives it: an id made from the title and which ingredients the parent listed.
export function presentRecipe(recipe, list) {
  return {
    id: recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: recipe.title,
    basePortions: recipe.basePortions,
    ingredients: recipe.ingredients.map((i) => ({ ...i, inList: isListed(i.name, list) })),
    steps: recipe.steps,
    texture: recipe.texture,
    allergens: recipe.allergens,
  };
}

export async function generateRecipe({ birthdate, ingredients, exclude }, { callModel, now }) {
  const { ageMonths, list } = validateRequest({ birthdate, ingredients, exclude }, now);

  const excluded = new Set((exclude ?? []).map(normalizeTitle));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const recipe = validateRecipe(await callModel({ ageMonths, ingredients: list, exclude: [...excluded] }));
      if (excluded.has(normalizeTitle(recipe.title))) continue;
      if (checkSafety(recipe, ageMonths).length > 0) continue;
      return presentRecipe({ ...recipe, allergens: detectAllergens(recipe) }, list);
    } catch (err) {
      if (err instanceof AppError && ['missing-key', 'upstream-error', 'limit-reached'].includes(err.code)) throw err;
    }
  }
  throw new AppError('generation-failed', 'Could not make a safe recipe. Please try again', { key: 'err.generationFailed' });
}
