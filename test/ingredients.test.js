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

test('normalizeIngredient treats commas, brackets and slashes as word breaks', () => {
  expect(normalizeIngredient('Carrots, grated')).toBe('carrot grated');
  expect(normalizeIngredient('Rice (cooked)')).toBe('rice cooked');
  expect(normalizeIngredient('rice/quinoa')).toBe('rice quinoa');
  expect(normalizeIngredient('rice-based')).toBe('rice-based');
});

test('isListed matches names followed by punctuation', () => {
  const list = ['rice', 'carrot', 'potato'];
  expect(isListed('Carrot, peeled and chopped', list)).toBe(true);
  expect(isListed('Potato, peeled and chopped', list)).toBe(true);
  expect(isListed('Rice, uncooked', list)).toBe(true);
  expect(isListed('Carrots, grated', list)).toBe(true);
  expect(isListed('Water', list)).toBe(false);
});
