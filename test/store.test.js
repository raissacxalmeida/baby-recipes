import { test, expect } from 'vitest';
import { createStore, startScreen } from '../src/client/store.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const recipe = (title) => ({ id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2, ingredients: [], steps: [], allergens: [] });
const now = new Date(2026, 9, 14);

test('birthdate round trip', () => {
  const s = createStore(memory());
  expect(s.getBirthdate()).toBeNull();
  s.setBirthdate('2026-02-14');
  expect(s.getBirthdate()).toBe('2026-02-14');
});

test('like twice stores one', () => {
  const s = createStore(memory());
  s.like(recipe('Banana mash'));
  s.like(recipe('Banana mash'));
  expect(s.getLiked()).toHaveLength(1);
});

test('dislike moves a liked recipe; restore leaves it in neither list', () => {
  const s = createStore(memory());
  s.like(recipe('Banana mash'));
  s.dislike(recipe('Banana mash'));
  expect(s.getLiked()).toEqual([]);
  expect(s.getDisliked()).toHaveLength(1);
  s.restore('banana-mash');
  expect(s.getDisliked()).toEqual([]);
  expect(s.getLiked()).toEqual([]);
});

test('liking a disliked recipe removes it from disliked; unlike removes it', () => {
  const s = createStore(memory());
  s.dislike(recipe('Oat porridge'));
  s.like(recipe('Oat porridge'));
  expect(s.getDisliked()).toEqual([]);
  s.unlike('oat-porridge');
  expect(s.getLiked()).toEqual([]);
});

test('excludeTitles merges shown and disliked without duplicates', () => {
  const s = createStore(memory());
  s.addShown('Banana mash');
  s.addShown('Banana mash');
  s.dislike(recipe('Oat porridge'));
  expect(s.excludeTitles().sort()).toEqual(['Banana mash', 'Oat porridge']);
});

test('restore makes the recipe suggestible again by dropping its shown title', () => {
  const s = createStore(memory());
  s.addShown('Banana mash');
  s.dislike(recipe('Banana mash'));
  s.restore('banana-mash');
  expect(s.excludeTitles()).toEqual([]);
});

test('valid JSON of the wrong shape is filtered out', () => {
  const good = recipe('Banana mash');
  const s = createStore(memory({
    'baby-recipes:liked': JSON.stringify([null, 5, { id: 'x' }, { ...good, allergens: undefined }, good]),
    'baby-recipes:disliked': JSON.stringify([null, good]),
    'baby-recipes:shown': JSON.stringify([null, 'Banana mash', 7]),
  }));
  expect(s.getLiked()).toEqual([good]);
  expect(s.excludeTitles()).toEqual(['Banana mash']);
  expect(() => s.like(recipe('Oat porridge'))).not.toThrow();
});

test('corrupted JSON gives empty defaults', () => {
  const s = createStore(memory({ 'baby-recipes:liked': '{not json', 'baby-recipes:disliked': '5', 'baby-recipes:shown': '"x"' }));
  expect(s.getLiked()).toEqual([]);
  expect(s.getDisliked()).toEqual([]);
  expect(s.getShownTitles()).toEqual([]);
});

test('storage that throws gives defaults and does not throw on write', () => {
  const s = createStore({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
  expect(s.getBirthdate()).toBeNull();
  expect(s.getLiked()).toEqual([]);
  expect(() => s.like(recipe('A'))).not.toThrow();
});

test('startScreen', () => {
  const at = (d) => startScreen(createStore(memory(d === undefined ? {} : { 'baby-recipes:birthdate': d })), now);
  expect(at()).toBe('setup');
  expect(at('banana')).toBe('setup');
  expect(at('2027-01-01')).toBe('setup');
  expect(at('2026-06-14')).toBe('too-young');
  expect(at('2026-02-14')).toBe('home');
});
