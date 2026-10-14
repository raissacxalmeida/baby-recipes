import { ageInMonths } from '../shared/age.js';
import { isListed, parseIngredientList } from '../shared/ingredients.js';
import { AppError } from './errors.js';
import { checkSafety, detectAllergens } from './safety.js';
import { validateRecipe } from './recipe.js';

export { AppError };

const MAX_ATTEMPTS = 3;
const MIN_MONTHS = 6;

const normalizeTitle = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

export async function generateRecipe({ birthdate, ingredients, exclude }, { callModel, now }) {
  const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (!isStrings(ingredients ?? []) || !isStrings(exclude ?? [])) {
    throw new AppError('invalid-input', 'Ingredients and excluded titles must be lists of text');
  }
  let ageMonths;
  try {
    ageMonths = ageInMonths(birthdate, now());
  } catch (err) {
    throw new AppError('invalid-input', err.message);
  }
  const list = parseIngredientList(ingredients ?? []);
  if (list.length === 0) throw new AppError('invalid-input', 'Add at least one ingredient');
  if (ageMonths < MIN_MONTHS) {
    throw new AppError('too-young', 'Solid foods usually start around 6 months, so no recipe is suggested yet');
  }

  const excluded = new Set((exclude ?? []).map(normalizeTitle));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const recipe = validateRecipe(await callModel({ ageMonths, ingredients: list, exclude: [...excluded] }));
      if (excluded.has(normalizeTitle(recipe.title))) continue;
      if (checkSafety(recipe, ageMonths).length > 0) continue;
      return {
        id: recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title: recipe.title,
        basePortions: recipe.basePortions,
        ingredients: recipe.ingredients.map((i) => ({ ...i, inList: isListed(i.name, list) })),
        steps: recipe.steps,
        texture: recipe.texture,
        allergens: detectAllergens(recipe),
      };
    } catch (err) {
      if (err instanceof AppError && ['missing-key', 'upstream-error'].includes(err.code)) throw err;
    }
  }
  throw new AppError('generation-failed', 'Could not make a safe recipe. Please try again');
}
