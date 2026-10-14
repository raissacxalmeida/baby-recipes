import { test, expect } from 'vitest';
import { formatAmount, scaleRecipe, ageLabel } from '../src/shared/units.js';

test('formatAmount', () => {
  expect(formatAmount(250)).toBe('250 g');
  expect(formatAmount(999)).toBe('999 g');
  expect(formatAmount(1000)).toBe('1 kg');
  expect(formatAmount(1500)).toBe('1.5 kg');
});

test('scaleRecipe doubles amounts', () => {
  const r = { basePortions: 2, ingredients: [{ name: 'oats', grams: 30, inList: true }] };
  expect(scaleRecipe(r, 4).ingredients[0].grams).toBe(60);
  expect(scaleRecipe(r, 4).basePortions).toBe(4);
});

test('scaleRecipe from the base is lossless', () => {
  const r = { basePortions: 2, ingredients: [{ name: 'banana', grams: 100, inList: true }] };
  expect(scaleRecipe(r, 3).ingredients[0].grams).toBe(150);
  expect(scaleRecipe(r, 2).ingredients[0].grams).toBe(100);
});

test.each([0, 13, 1.5])('scaleRecipe rejects %s portions', (n) =>
  expect(() => scaleRecipe({ basePortions: 2, ingredients: [] }, n)).toThrow(RangeError));

test('ageLabel', () => {
  expect(ageLabel(1)).toBe('1 month');
  expect(ageLabel(8)).toBe('8 months');
  expect(ageLabel(14)).toBe('14 months');
});
