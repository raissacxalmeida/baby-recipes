import { test, expect } from 'vitest';
import { GROUPS, groupFor } from '../src/shared/recipeGroup.js';

const recipe = (title, ...ingredients) => ({
  title, ingredients: ingredients.map(([name, grams]) => ({ name, grams })),
});

test('GROUPS lists the ten groups in chip order with an emoji each', () => {
  expect(GROUPS.map((g) => g.name)).toEqual([
    'Fish', 'Meat', 'Eggs', 'Vegetables', 'Fruit', 'Grains', 'Legumes', 'Cake', 'Soup', 'Other',
  ]);
  expect(GROUPS.every((g) => g.emoji.length > 0)).toBe(true);
});

test('a cake title is Cake whatever the ingredients are', () => {
  expect(groupFor(recipe('Banana oat cake', ['banana', 100], ['oats', 60]))).toBe('Cake');
});

test('a stew or soup title is Soup, even with chicken in it', () => {
  expect(groupFor(recipe('Lentil stew', ['lentils', 100]))).toBe('Soup');
  expect(groupFor(recipe('Chicken soup', ['chicken', 80], ['carrot', 100]))).toBe('Soup');
});

test('a title with both cake and soup words is Cake', () => {
  expect(groupFor(recipe('Carrot cake soup', ['carrot', 100]))).toBe('Cake');
});

test('fish wins however little of it there is', () => {
  expect(groupFor(recipe('Salmon with sweet potato mash', ['sweet potato', 200], ['salmon', 50]))).toBe('Fish');
});

test('meat wins however little of it there is', () => {
  expect(groupFor(recipe('Chicken and carrot bites', ['carrot', 150], ['chicken', 60]))).toBe('Meat');
});

test('otherwise the heaviest ingredient decides', () => {
  expect(groupFor(recipe('Banana porridge', ['banana', 100], ['oats', 40]))).toBe('Fruit');
  expect(groupFor(recipe('Rice with peas', ['rice', 50], ['peas', 120]))).toBe('Legumes');
  expect(groupFor(recipe('Omelette', ['egg', 100]))).toBe('Eggs');
  expect(groupFor(recipe('Pasta', ['pasta', 100]))).toBe('Grains');
});

test('upper case and plural ingredient names still match', () => {
  expect(groupFor(recipe('Carrots', ['CARROTS', 100]))).toBe('Vegetables');
});

test('water, oil, butter and salt never decide the group', () => {
  expect(groupFor(recipe('Water dish', ['water', 500], ['carrot', 20]))).toBe('Vegetables');
  expect(groupFor(recipe('Olive oil dish', ['olive oil', 300], ['butter', 100], ['salt', 5], ['carrot', 20]))).toBe('Vegetables');
});

test('anything unrecognised is Other', () => {
  expect(groupFor(recipe('Water only', ['water', 200], ['salt', 1]))).toBe('Other');
  expect(groupFor(recipe('Nothing'))).toBe('Other');
  expect(groupFor(recipe('Dragon dish', ['dragon fruit', 100]))).toBe('Other');
});
