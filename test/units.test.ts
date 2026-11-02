import { test, expect } from 'vitest';
import { formatAmount, scaleRecipe } from '../src/shared/units.js';
import type { Ingredient, Recipe } from '../src/shared/types.js';

// scaleRecipe takes a whole Recipe (here one as shown, with inList flags) but reads only basePortions and ingredients,
// which is all these give it.
type Shown = Recipe & { ingredients: (Ingredient & { inList: boolean })[] };

test('formatAmount', () => {
  expect(formatAmount(250)).toBe('250 g');
  expect(formatAmount(999)).toBe('999 g');
  expect(formatAmount(1000)).toBe('1 kg');
  expect(formatAmount(1500)).toBe('1.5 kg');
});

test('formatAmount uses the decimal mark of the language', () => {
  expect(formatAmount(1500, 'en')).toBe('1.5 kg');
  expect(formatAmount(1500, 'de')).toBe('1,5 kg');
  expect(formatAmount(1234, 'de')).toBe('1,23 kg');
  expect(formatAmount(250, 'pt')).toBe('250 g');
  expect(formatAmount(1000, 'es')).toBe('1 kg');
});

test('scaleRecipe doubles amounts', () => {
  const r = { basePortions: 2, ingredients: [{ name: 'oats', grams: 30, inList: true }] } as Shown;
  expect(scaleRecipe(r, 4).ingredients[0].grams).toBe(60);
  expect(scaleRecipe(r, 4).basePortions).toBe(4);
});

test('scaleRecipe from the base is lossless', () => {
  const r = { basePortions: 2, ingredients: [{ name: 'banana', grams: 100, inList: true }] } as Shown;
  expect(scaleRecipe(r, 3).ingredients[0].grams).toBe(150);
  expect(scaleRecipe(r, 2).ingredients[0].grams).toBe(100);
});

test.each([0, 13, 1.5])('scaleRecipe rejects %s portions', (n) =>
  expect(() => scaleRecipe({ basePortions: 2, ingredients: [] } as Pick<Recipe, 'basePortions' | 'ingredients'> as Recipe, n)).toThrow(RangeError));

test('scaleRecipe never shows a tiny amount as 0 g', () => {
  const r = { basePortions: 4, ingredients: [{ name: 'cinnamon', grams: 1, inList: false }] } as Shown;
  expect(scaleRecipe(r, 1).ingredients[0].grams).toBe(1);
});
