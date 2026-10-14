import { test, expect } from 'vitest';
import { validateRecipe } from '../src/server/recipe.js';

const valid = () => ({
  title: 'Banana oat mash',
  basePortions: 2,
  ingredients: [{ name: 'banana', grams: 100 }, { name: 'oats', grams: 30 }],
  steps: ['Mash the banana.', 'Stir in the oats.'],
  texture: 'mashed',
  allergens: [],
});

test('accepts a valid recipe and renames allergens to aiAllergens', () => {
  const r = validateRecipe({ ...valid(), allergens: ['wheat'] });
  expect(r.title).toBe('Banana oat mash');
  expect(r.aiAllergens).toEqual(['wheat']);
  expect(r.ingredients).toEqual([{ name: 'banana', grams: 100 }, { name: 'oats', grams: 30 }]);
});

test('rejects a non-numeric grams value', () => {
  const raw = valid();
  raw.ingredients[0].grams = '100 ml';
  expect(() => validateRecipe(raw)).toThrow(/grams/);
});

test('rejects an unknown texture', () => expect(() => validateRecipe({ ...valid(), texture: 'chunky' })).toThrow(/texture/));
test('rejects empty steps', () => expect(() => validateRecipe({ ...valid(), steps: [] })).toThrow(/steps/));
test('rejects 0 base portions', () => expect(() => validateRecipe({ ...valid(), basePortions: 0 })).toThrow(/basePortions/));
test('rejects non-objects', () => expect(() => validateRecipe(null)).toThrow(/recipe/));
