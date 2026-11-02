import { test, expect } from 'vitest';
import { localizeRecipe, titleIn, titleKey } from '../src/client/localize.js';

const recipe = {
  id: 'banana-mash', title: 'Banana mash', basePortions: 2, texture: 'mashed', allergens: [],
  ingredients: [{ name: 'banana', grams: 100, inList: true }, { name: 'water', grams: 20, inList: false }],
  steps: ['Mash the banana.', 'Add water.'],
};
const translation = { title: 'Papa de banana', ingredients: ['banana', 'água'], steps: ['Amasse a banana.', 'Adicione água.'] };

test('the translated text is put in place and the English ingredient names are kept', () => {
  const result = localizeRecipe(recipe, translation);
  expect(result.title).toBe('Papa de banana');
  expect(result.steps).toEqual(translation.steps);
  expect(result.ingredients).toEqual([
    { name: 'banana', grams: 100, inList: true, original: 'banana' },
    { name: 'água', grams: 20, inList: false, original: 'water' },
  ]);
  expect(result).toMatchObject({ id: 'banana-mash', basePortions: 2, texture: 'mashed' });
  expect(recipe.title).toBe('Banana mash');
});

test('a translation with other counts, or none, leaves the recipe as it is', () => {
  expect(localizeRecipe(recipe, { ...translation, steps: ['one'] })).toBe(recipe);
  expect(localizeRecipe(recipe, { ...translation, ingredients: ['banana'] })).toBe(recipe);
  expect(localizeRecipe(recipe, undefined)).toBe(recipe);
});

test('titleIn gives the cached translation or falls back to the English title', () => {
  const cache = { [titleKey('pt', 'Banana mash')]: 'Papa de banana' };
  expect(titleIn(cache, 'pt', 'Banana mash')).toBe('Papa de banana');
  expect(titleIn(cache, 'de', 'Banana mash')).toBe('Banana mash');
  expect(titleIn(cache, 'pt', 'Soup')).toBe('Soup');
});
