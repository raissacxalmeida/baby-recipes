import { test, expect, vi } from 'vitest';
import { generateRecipe, validateRequest, presentRecipe, AppError } from '../src/server/generate.js';
import { callModel } from '../src/server/openai.js';

const now = () => new Date(2026, 9, 14);
const raw = (over = {}) => ({
  title: 'Banana mash',
  basePortions: 2,
  ingredients: [{ name: 'banana', grams: 100 }, { name: 'olive oil', grams: 5 }],
  steps: ['Mash the banana.', 'Stir in the oil.'],
  texture: 'mashed',
  allergens: [],
  ...over,
});
const input = (over = {}) => ({ birthdate: '2026-03-14', ingredients: ['Banana'], exclude: [], ...over });
const fake = (...responses) => vi.fn(async () => {
  const next = responses.shift();
  if (next instanceof Error) throw next;
  return next;
});

test('returns a recipe with id, inList flags and allergens', async () => {
  const recipe = await generateRecipe(input(), { callModel: fake(raw()), now });
  expect(recipe.id).toBe('banana-mash');
  expect(recipe.ingredients).toEqual([
    { name: 'banana', grams: 100, inList: true },
    { name: 'olive oil', grams: 5, inList: false },
  ]);
  expect(recipe.allergens).toEqual([]);
});

test('too young: 5 months, no model call', async () => {
  const cm = fake(raw());
  await expect(generateRecipe(input({ birthdate: '2026-05-14' }), { callModel: cm, now })).rejects.toMatchObject({ code: 'too-young' });
  expect(cm).not.toHaveBeenCalled();
});

test('unsafe first answer is retried', async () => {
  const unsafe = raw({ ingredients: [{ name: 'honey', grams: 10 }] });
  const cm = fake(unsafe, raw());
  const recipe = await generateRecipe(input({ birthdate: '2026-03-14' }), { callModel: cm, now });
  expect(recipe.title).toBe('Banana mash');
  expect(cm).toHaveBeenCalledTimes(2);
});

test('three bad answers give generation-failed', async () => {
  const cm = fake({}, raw({ texture: 'chunky' }), new Error('boom'));
  await expect(generateRecipe(input(), { callModel: cm, now })).rejects.toMatchObject({ code: 'generation-failed' });
  expect(cm).toHaveBeenCalledTimes(3);
});

test('excluded title is retried, ignoring case and spacing', async () => {
  const cm = fake(raw(), raw({ title: 'Oat porridge' }));
  const recipe = await generateRecipe(input({ exclude: ['banana  MASH'] }), { callModel: cm, now });
  expect(recipe.title).toBe('Oat porridge');
  expect(cm).toHaveBeenCalledTimes(2);
});

test('blank ingredient list is invalid-input', async () => {
  await expect(generateRecipe(input({ ingredients: ['  '] }), { callModel: fake(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
});

test('invalid birthday is invalid-input', async () => {
  await expect(generateRecipe(input({ birthdate: 'nope' }), { callModel: fake(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
});

test('missing-key is rethrown at once', async () => {
  const cm = fake(new AppError('missing-key', 'No key'));
  await expect(generateRecipe(input(), { callModel: cm, now })).rejects.toMatchObject({ code: 'missing-key' });
  expect(cm).toHaveBeenCalledTimes(1);
});

test('callModel sends the key only in the header', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(raw()) } }] }) }));
  const result = await callModel({ ageMonths: 7, ingredients: ['banana'], exclude: [] }, { apiKey: 'test-key', fetchImpl });
  expect(result.title).toBe('Banana mash');
  const [, init] = fetchImpl.mock.calls[0];
  expect(init.headers.Authorization).toBe('Bearer test-key');
  expect(init.body).not.toContain('test-key');
});

test('callModel without a key throws missing-key and does not fetch', async () => {
  const fetchImpl = vi.fn();
  await expect(callModel({ ageMonths: 7, ingredients: [], exclude: [] }, { apiKey: '', fetchImpl })).rejects.toMatchObject({ code: 'missing-key' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('callModel with a non-OK status throws upstream-error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await expect(callModel({ ageMonths: 7, ingredients: ['banana'], exclude: [] }, { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ code: 'upstream-error' });
});

test('callModel network failure throws upstream-error', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await expect(callModel({ ageMonths: 7, ingredients: ['banana'], exclude: [] }, { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ code: 'upstream-error' });
});

test('upstream-error is rethrown at once without retrying', async () => {
  const cm = fake(new AppError('upstream-error', 'bad key'));
  await expect(generateRecipe(input(), { callModel: cm, now })).rejects.toMatchObject({ code: 'upstream-error' });
  expect(cm).toHaveBeenCalledTimes(1);
});

test.each([
  ['ingredients not an array', { ingredients: 'banana' }],
  ['ingredients with non-strings', { ingredients: [1] }],
  ['exclude not an array', { exclude: 'x' }],
])('%s is invalid-input', async (_n, over) => {
  await expect(generateRecipe(input(over), { callModel: fake(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
});

test.each([
  ['too many ingredients', Array.from({ length: 31 }, (_, i) => `food ${i}`)],
  ['an ingredient over 50 characters', ['x'.repeat(51)]],
])('%s is invalid-input', async (_n, ingredients) => {
  await expect(generateRecipe(input({ ingredients }), { callModel: fake(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
});

test('three unsafe answers give generation-failed', async () => {
  const unsafe = raw({ ingredients: [{ name: 'honey', grams: 10 }] });
  const cm = fake(unsafe, unsafe, unsafe);
  await expect(generateRecipe(input(), { callModel: cm, now })).rejects.toMatchObject({ code: 'generation-failed' });
});

test('validateRequest returns the baby age and the normalised ingredient list', () => {
  expect(validateRequest(input(), now)).toEqual({ ageMonths: 7, list: ['banana'] });
});

test('validateRequest rejects a baby under 6 months and an empty list', () => {
  expect(() => validateRequest(input({ birthdate: '2026-06-14' }), now)).toThrowError(expect.objectContaining({ code: 'too-young' }));
  expect(() => validateRequest(input({ ingredients: [] }), now)).toThrowError(expect.objectContaining({ code: 'invalid-input' }));
});

test('presentRecipe adds the id and the inList flags', () => {
  const recipe = presentRecipe(raw({ allergens: ['egg'] }), ['banana']);
  expect(recipe.id).toBe('banana-mash');
  expect(recipe.ingredients).toEqual([
    { name: 'banana', grams: 100, inList: true },
    { name: 'olive oil', grams: 5, inList: false },
  ]);
  expect(recipe.allergens).toEqual(['egg']);
});
