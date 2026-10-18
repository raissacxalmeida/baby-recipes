import { isListed } from './ingredients.js';
import { PROTEIN_WORDS } from './recipeGroup.js';

// Ingredients that season or loosen a dish; they are never the point of it.
// No "pepper": it is also bell pepper.
export const PANTRY = [
  'oil', 'butter', 'water', 'juice', 'stock', 'broth', 'tea', 'tomato paste', 'cinnamon', 'vanilla', 'turmeric',
  'coriander', 'paprika', 'ginger', 'curry', 'thyme', 'rosemary', 'marjoram', 'parsley', 'basil', 'cocoa', 'carob',
  'yeast', 'fennel seeds', 'celery leaves', 'garlic', 'lemon', 'salt',
];

// Foods whose name ends in another food: "potato" must not stand in for "sweet potato".
const COMPOUND_FOODS = ['sweet potato'];

const MAIN_SHARE = 0.1;

const nonPantry = (recipe) => recipe.ingredients.filter((i) => !isListed(i.name, PANTRY));

function covers(name, list) {
  const compound = COMPOUND_FOODS.find((c) => isListed(name, [c]));
  if (compound) return list.some((item) => isListed(item, [compound]));
  return isListed(name, list);
}

export function mainIngredients(recipe) {
  const items = nonPantry(recipe);
  const total = items.reduce((sum, i) => sum + i.grams, 0);
  return items
    .filter((i) => isListed(i.name, PROTEIN_WORDS) || i.grams >= MAIN_SHARE * total)
    .map((i) => i.name);
}

// `list` is already normalised by parseIngredientList.
export function matchRecipe(recipe, list) {
  const mains = mainIngredients(recipe);
  const used = nonPantry(recipe).filter((i) => covers(i.name, list)).length;
  return {
    suitable: mains.length > 0 && mains.every((name) => covers(name, list)),
    used,
    missing: nonPantry(recipe).length - used,
  };
}
