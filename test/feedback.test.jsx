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
const make = (title) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2,
  ingredients: [{ name: 'banana', grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [],
});
const first = make('Banana mash');
const second = make('Oat porridge');

const start = () => {
  const fetchRecipe = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const store = createStore(memory({ 'baby-recipes:birthdate': '2026-02-14' }));
  render(<App store={store} fetchRecipe={fetchRecipe} now={now} />);
  fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: 'banana' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a recipe' }));
  return { store, fetchRecipe };
};
const shown = (title) => waitFor(() => expect(screen.getByRole('heading', { name: title })).not.toBeNull());
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const openLiked = () => { click('Back to ingredients'); click('Liked recipes'); };

test('Give me another asks again, excluding what was shown', async () => {
  const { fetchRecipe } = start();
  await shown('Banana mash');
  click('Give me another');
  await shown('Oat porridge');
  expect(fetchRecipe).toHaveBeenLastCalledWith({ birthdate: '2026-02-14', ingredients: ['banana'], exclude: ['Banana mash'] });
});

test('Baby didn\'t like it stores the dislike and asks for another recipe', async () => {
  const { store, fetchRecipe } = start();
  await shown('Banana mash');
  click("Baby didn't like it");
  await shown('Oat porridge');
  expect(store.getDisliked().map((r) => r.title)).toEqual(['Banana mash']);
  expect(fetchRecipe.mock.calls[1][0].exclude).toContain('Banana mash');
});

test('liked recipes are listed and open without a server call', async () => {
  const { store, fetchRecipe } = start();
  await shown('Banana mash');
  click('Baby liked it');
  expect(store.getLiked().map((r) => r.title)).toEqual(['Banana mash']);
  openLiked();
  expect(screen.getByRole('heading', { name: 'Liked recipes' })).not.toBeNull();
  click('Open Banana mash');
  await shown('Banana mash');
  expect(screen.getByRole('button', { name: 'More portions' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Baby liked it' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Give me another' })).toBeNull();
  expect(fetchRecipe).toHaveBeenCalledTimes(1);
});

test('Remove takes a recipe out of the liked list', async () => {
  const { store } = start();
  await shown('Banana mash');
  click('Baby liked it');
  openLiked();
  click('Remove Banana mash');
  expect(store.getLiked()).toEqual([]);
  expect(screen.queryByText('Banana mash')).toBeNull();
});

test('Restore moves a disliked recipe out of Not liked and lets it be suggested again', async () => {
  const { store } = start();
  await shown('Banana mash');
  click("Baby didn't like it");
  await shown('Oat porridge');
  openLiked();
  expect(screen.getByRole('heading', { name: 'Not liked' })).not.toBeNull();
  click('Restore Banana mash');
  expect(screen.queryByText('Banana mash')).toBeNull();
  expect(store.getDisliked()).toEqual([]);
  expect(store.excludeTitles()).not.toContain('Banana mash');
});
