import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { createStore } from '../src/client/store.js';

afterEach(cleanup);

const now = () => new Date(2026, 9, 14);
const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const recipe = { id: 'banana-mash', title: 'Banana mash', basePortions: 2, ingredients: [{ name: 'banana', grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [] };
const setup = (birthdate, fetchRecipe = vi.fn(async () => recipe)) => {
  const store = createStore(memory(birthdate === undefined ? {} : { 'baby-recipes:birthdate': birthdate }));
  render(<App store={store} fetchRecipe={fetchRecipe} now={now} />);
  return { store, fetchRecipe };
};
const addIngredient = (text) => {
  fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

test('no birthdate shows setup; saving 8 months ago shows the age on Home', () => {
  setup();
  fireEvent.change(screen.getByLabelText("Baby's birthday"), { target: { value: '2026-02-14' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText(/8 months/)).not.toBeNull();
});

test('setup rejects a future birthday with a message', () => {
  setup();
  fireEvent.change(screen.getByLabelText("Baby's birthday"), { target: { value: '2027-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert').textContent).toMatch(/birthday/);
});

test('3 months old shows the too-young screen and never calls the server', () => {
  const { fetchRecipe } = setup('2026-07-14');
  expect(screen.getByText(/around 6 months/)).not.toBeNull();
  expect(fetchRecipe).not.toHaveBeenCalled();
});

test('corrupted birthdate starts at setup', () => {
  setup('banana');
  expect(screen.getByLabelText("Baby's birthday")).not.toBeNull();
});

test('ingredients are normalised, de-duplicated and removable', () => {
  setup('2026-02-14');
  addIngredient(' Tomatoes ');
  addIngredient('tomato');
  addIngredient('   ');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('tomato')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove tomato' }));
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

test('Suggest is disabled without ingredients', () => {
  setup('2026-02-14');
  expect(screen.getByRole('button', { name: 'Suggest a recipe' }).disabled).toBe(true);
});

test('suggesting shows the recipe and records its title as shown', async () => {
  const { store, fetchRecipe } = setup('2026-02-14');
  addIngredient('banana');
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a recipe' }));
  await waitFor(() => expect(screen.getByText('Banana mash')).not.toBeNull());
  expect(fetchRecipe).toHaveBeenCalledWith({ birthdate: '2026-02-14', ingredients: ['banana'], exclude: [] });
  expect(store.getShownTitles()).toEqual(['Banana mash']);
});

test('a failed request shows the message and keeps the ingredients', async () => {
  setup('2026-02-14', vi.fn(async () => { throw new Error('Could not reach the server'); }));
  addIngredient('banana');
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a recipe' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Could not reach/));
  expect(screen.getByText('banana')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Suggest a recipe' }).disabled).toBe(false);
});

test('the not-medical-advice note is shown', () => {
  setup('2026-02-14');
  expect(screen.getByText(/not medical advice/i)).not.toBeNull();
});
