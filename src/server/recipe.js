export const TEXTURES = ['puree', 'mashed', 'soft-pieces', 'finger-food'];

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const HAS_AMOUNT = /\d\s*(?:ml|l|oz|cups?|tbsp|tsp|tablespoons?|teaspoons?|kg|g|grams?)\b/i;

export function validateRecipe(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('recipe must be an object');
  if (!isText(raw.title)) throw new Error('title must be a non-empty string');
  if (!Number.isInteger(raw.basePortions) || raw.basePortions < 1 || raw.basePortions > 12) {
    throw new Error('basePortions must be an integer from 1 to 12');
  }
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length === 0) {
    throw new Error('ingredients must be a non-empty array');
  }
  const ingredients = raw.ingredients.map((i, n) => {
    if (!i || !isText(i.name)) throw new Error(`ingredients[${n}].name must be a non-empty string`);
    if (typeof i.grams !== 'number' || !Number.isFinite(i.grams) || i.grams <= 0) {
      throw new Error(`ingredients[${n}].grams must be a number above 0`);
    }
    return { name: i.name.trim(), grams: i.grams };
  });
  if (!Array.isArray(raw.steps) || raw.steps.length === 0 || !raw.steps.every(isText)) {
    throw new Error('steps must be a non-empty array of non-empty strings');
  }
  if (raw.steps.some((s) => HAS_AMOUNT.test(s))) throw new Error('steps must not contain amounts or units');
  if (!TEXTURES.includes(raw.texture)) throw new Error(`texture must be one of ${TEXTURES.join(', ')}`);
  if (!Array.isArray(raw.allergens) || !raw.allergens.every((a) => typeof a === 'string')) {
    throw new Error('allergens must be an array of strings');
  }
  return {
    title: raw.title.trim(),
    basePortions: raw.basePortions,
    ingredients,
    steps: raw.steps.map((s) => s.trim()),
    texture: raw.texture,
    aiAllergens: raw.allergens,
  };
}
