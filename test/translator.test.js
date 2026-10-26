import { test, expect, vi } from 'vitest';
import { callTranslate } from '../src/server/openai.js';

const answering = (content) => vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) }));
const sent = (fetchImpl) => {
  const [url, init] = fetchImpl.mock.calls[0];
  const body = JSON.parse(init.body);
  return { url, init, body, prompt: body.messages.map((m) => m.content).join('\n') };
};

test('ingredients: sends the words and the language, unwraps items, and tells the model to answer null when unsure', async () => {
  const fetchImpl = answering({ items: ['potato', null] });
  const result = await callTranslate({ kind: 'ingredients', language: 'pt', items: ['batata', 'xyzzy'] }, { apiKey: 'test-key', fetchImpl });
  expect(result).toEqual(['potato', null]);
  const { url, init, body, prompt } = sent(fetchImpl);
  expect(url).toBe('https://api.openai.com/v1/chat/completions');
  expect(init.headers.Authorization).toBe('Bearer test-key');
  expect(init.body).not.toContain('test-key');
  expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
  expect(prompt).toContain('Portuguese');
  expect(prompt).toContain('batata');
  expect(prompt).toContain('xyzzy');
  expect(prompt).toContain('null');
});

test('titles: sends every title and the language and unwraps titles', async () => {
  const fetchImpl = answering({ titles: ['Papa de banana', 'Sopa'] });
  const result = await callTranslate({ kind: 'titles', language: 'es', titles: ['Banana mash', 'Soup'] }, { apiKey: 'k', fetchImpl });
  expect(result).toEqual(['Papa de banana', 'Sopa']);
  const { prompt } = sent(fetchImpl);
  expect(prompt).toContain('Spanish');
  expect(prompt).toContain('Banana mash');
  expect(prompt).toContain('Soup');
});

test('recipe: sends title, ingredient names and steps and returns the object', async () => {
  const translated = { title: 'Bananenbrei', ingredients: ['Banane'], steps: ['Die Banane zerdrücken.'] };
  const fetchImpl = answering(translated);
  const recipe = { title: 'Banana mash', ingredients: ['banana'], steps: ['Mash the banana.'] };
  expect(await callTranslate({ kind: 'recipe', language: 'de', recipe }, { apiKey: 'k', fetchImpl })).toEqual(translated);
  const { prompt } = sent(fetchImpl);
  expect(prompt).toContain('German');
  expect(prompt).toContain('Banana mash');
  expect(prompt).toContain('Mash the banana.');
});

test('without a key it throws missing-key and does not fetch', async () => {
  const fetchImpl = vi.fn();
  await expect(callTranslate({ kind: 'titles', language: 'pt', titles: ['A'] }, { apiKey: '', fetchImpl })).rejects.toMatchObject({ code: 'missing-key' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('a non-OK status throws upstream-error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await expect(callTranslate({ kind: 'titles', language: 'pt', titles: ['A'] }, { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ code: 'upstream-error' });
});

test('a network failure throws upstream-error', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await expect(callTranslate({ kind: 'titles', language: 'pt', titles: ['A'] }, { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ code: 'upstream-error' });
});
