import { test, expect } from 'vitest';
import { mainIngredients, matchRecipe } from '../src/shared/recipeMatch.js';
import { parseIngredientList } from '../src/shared/ingredients.js';

const r = (...pairs) => ({ ingredients: pairs.map(([name, grams]) => ({ name, grams })) });

test('pantry items are never main', () => {
  expect(mainIngredients(r(['carrot', 150], ['rapeseed oil', 14], ['water', 100], ['apple juice', 45]))).toEqual(['carrot']);
});

test('meat, fish and egg are main however little there is', () => {
  expect(mainIngredients(r(['potato', 500], ['salmon', 20], ['egg', 5]))).toEqual(['potato', 'salmon', 'egg']);
});

test('other ingredients need 10% of the non-pantry grams', () => {
  expect(mainIngredients(r(['carrot', 100], ['onion', 9], ['oil', 50]))).toEqual(['carrot']);
  expect(mainIngredients(r(['carrot', 100], ['onion', 12]))).toEqual(['carrot', 'onion']);
});

test('every main must be listed; non-main may be missing', () => {
  const rec = r(['carrot', 150], ['potato', 100], ['onion', 12], ['rapeseed oil', 14]);
  expect(matchRecipe(rec, ['carrot', 'potato'])).toEqual({ suitable: true, used: 2, missing: 1 });
  expect(matchRecipe(rec, ['carrot']).suitable).toBe(false);
});

test('plain potato does not stand in for sweet potato', () => {
  const rec = r(['sweet potato', 250], ['water', 100]);
  expect(matchRecipe(rec, ['carrot', 'potato']).suitable).toBe(false);
  expect(matchRecipe(rec, ['sweet potato']).suitable).toBe(true);
});

test('a recipe with no main ingredient is never suitable', () => {
  expect(matchRecipe(r(['water', 100], ['rapeseed oil', 14]), ['water', 'oil', 'banana']).suitable).toBe(false);
});

test('capitals, plurals and punctuation still match', () => {
  const list = parseIngredientList(['Carrots,', ' POTATOES ']);
  expect(matchRecipe(r(['carrot', 150], ['potato', 100]), list).suitable).toBe(true);
});
