import { test, expect } from 'vitest';
import { checkSafety, detectAllergens } from '../src/server/safety.js';

const recipe = (over = {}) => ({
  title: 'Banana oat mash',
  ingredients: [{ name: 'banana', grams: 100 }, { name: 'oats', grams: 30 }],
  steps: ['Mash the banana.', 'Stir in the oats.'],
  texture: 'mashed',
  ...over,
});
const withIngredient = (name) => recipe({ ingredients: [{ name, grams: 10 }] });

test('honey at 7 months is a problem, at 13 months it is fine', () => {
  expect(checkSafety(withIngredient('honey'), 7).join(' ')).toMatch(/honey/);
  expect(checkSafety(withIngredient('honey'), 13)).toEqual([]);
});

test('salt in a step at 10 months', () => {
  expect(checkSafety(recipe({ steps: ['Add a pinch of salt.'] }), 10).join(' ')).toMatch(/salt/);
});

test('salted butter at 10 months', () => {
  expect(checkSafety(withIngredient('salted butter'), 10).join(' ')).toMatch(/salt/);
});

test('sugar and syrup under 12 months', () => {
  expect(checkSafety(withIngredient('maple syrup'), 8)).not.toEqual([]);
  expect(checkSafety(withIngredient('brown sugar'), 8)).not.toEqual([]);
});

test('milk rules', () => {
  expect(checkSafety(withIngredient('breast milk'), 7)).toEqual([]);
  expect(checkSafety(withIngredient('formula milk'), 7)).toEqual([]);
  expect(checkSafety(withIngredient('milk'), 7).join(' ')).toMatch(/milk/);
  expect(checkSafety(withIngredient('milk'), 13)).toEqual([]);
});

test('choking hazards under 36 months', () => {
  expect(checkSafety(withIngredient('popcorn'), 30).join(' ')).toMatch(/popcorn/);
  expect(checkSafety(withIngredient('whole nuts'), 30)).not.toEqual([]);
  expect(checkSafety(withIngredient('whole grapes'), 20)).not.toEqual([]);
  expect(checkSafety(withIngredient('popcorn'), 40)).toEqual([]);
});

test('texture by age', () => {
  expect(checkSafety(recipe({ texture: 'finger-food' }), 7).join(' ')).toMatch(/texture/);
  expect(checkSafety(recipe({ texture: 'soft-pieces' }), 10)).toEqual([]);
  expect(checkSafety(recipe({ texture: 'puree' }), 10).join(' ')).toMatch(/texture/);
  expect(checkSafety(recipe({ texture: 'finger-food' }), 14)).toEqual([]);
});

test('a plain safe recipe has no problems', () => expect(checkSafety(recipe(), 8)).toEqual([]));

test('detectAllergens finds keywords and keeps AI-reported ones', () => {
  expect(detectAllergens(withIngredient('eggs'))).toEqual(['egg']);
  expect(detectAllergens({ ...withIngredient('banana'), aiAllergens: ['Sesame'] })).toEqual(['sesame']);
  expect(detectAllergens(withIngredient('peanut butter'))).toEqual(['peanut']);
});

test.each([
  ['sugars', 7], ['salty broth', 7], ['sugary cereal', 7], ['salting water', 7], ['sugar-free jam', 7],
  ["cow's milk", 7], ['honeyed carrots', 7], ['soy sauce', 7], ['stock cube', 7], ['bacon', 7], ['agave nectar', 7],
  ['whole almonds', 20], ['whole-grape', 20], ['whole\u00a0grapes', 20], ['grapes', 20], ['mixed nuts', 20], ['pop corn', 20],
  ['raw carrot sticks', 20],
])('%s is rejected at %i months', (name, age) => {
  expect(checkSafety(withIngredient(name), age)).not.toEqual([]);
});

test.each([
  ['unsalted butter', 7], ['quartered grapes', 20], ['peanut butter', 20], ['mashed banana', 7],
])('%s is accepted at %i months', (name, age) => {
  expect(checkSafety(withIngredient(name), age)).toEqual([]);
});

test('a step that says do not add salt is still rejected (the prompt forbids mentioning it)', () => {
  expect(checkSafety(recipe({ steps: ['Do not add salt.'] }), 7)).not.toEqual([]);
});
