import { test, expect } from 'vitest';
import { normalizeIngredient, parseIngredientList, isListed } from '../src/shared/ingredients.js';

test('normalizeIngredient singularises and trims', () => {
  expect(normalizeIngredient('  Tomatoes ')).toBe('tomato');
  expect(normalizeIngredient('Berries')).toBe('berry');
  expect(normalizeIngredient('Sweet  Potatoes')).toBe('sweet potato');
  expect(normalizeIngredient('hummus')).toBe('hummus');
  expect(normalizeIngredient('grass')).toBe('grass');
});

test('parseIngredientList normalises, drops empties and duplicates', () => {
  expect(parseIngredientList([' Tomatoes ', 'tomato', '', 'Sweet  Potatoes'])).toEqual(['tomato', 'sweet potato']);
});

test('isListed matches whole words after normalising', () => {
  expect(isListed('ripe tomatoes', ['tomato'])).toBe(true);
  expect(isListed('olive oil', ['tomato'])).toBe(false);
  expect(isListed('potatoes', ['sweet potato'])).toBe(false);
});
