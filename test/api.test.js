import { test, expect, vi } from 'vitest';
import { fetchRecipe } from '../src/client/api.js';

const body = { birthdate: '2026-02-14', ingredients: ['banana'], exclude: [] };

test('returns the recipe on 200 and posts the body as JSON', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ recipe: { title: 'Banana mash' } }) }));
  expect((await fetchRecipe(body, fetchImpl)).title).toBe('Banana mash');
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/recipe');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual(body);
});

test('uses the server message on a non-200', async () => {
  const fetchImpl = async () => ({ ok: false, json: async () => ({ message: 'Too young' }) });
  await expect(fetchRecipe(body, fetchImpl)).rejects.toThrow(/Too young/);
});

test('network failure gives a readable error', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  await expect(fetchRecipe(body, fetchImpl)).rejects.toThrow(/Could not reach/);
});
