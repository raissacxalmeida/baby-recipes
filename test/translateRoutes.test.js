import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer } from './helpers/http.js';
import { createFakeTranslator } from './helpers/fakeTranslate.js';
import { saveToCatalogue } from '../src/server/catalogue.js';
import { AppError } from '../src/server/errors.js';

let t;
let ana;
beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

const stored = { title: 'Banana mash', basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }], steps: ['Mash it.'], texture: 'mashed', allergens: [] };
const served = { ...stored, id: 'banana-mash', ingredients: [{ name: 'banana', grams: 100, inList: true }] };
const used = async () => (await t.db.query('select translations from usage')).rows[0]?.translations ?? 0;

beforeEach(async () => {
  await t.db.reset();
  t.setTranslator(createFakeTranslator());
  await saveToCatalogue(t.db, stored, { ageFromMonths: 6, source: 'ai' });
  ana = await t.loginAsNew('ana@example.com');
});

test('both routes are 401 without a cookie', async () => {
  expect((await t.call('POST', '/api/translate/titles', { language: 'pt', titles: [] })).status).toBe(401);
  expect((await t.call('POST', '/api/translate/recipe', { language: 'pt', recipe: served })).status).toBe(401);
});

test('titles come back translated', async () => {
  const res = await t.call('POST', '/api/translate/titles', { language: 'pt', titles: ['Banana mash', 'Unknown'] }, ana);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ titles: { 'Banana mash': 'pt:Banana mash' } });
});

test('a recipe comes back translated', async () => {
  const res = await t.call('POST', '/api/translate/recipe', { language: 'de', recipe: served }, ana);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ translation: { title: 'de:Banana mash', ingredients: ['de:banana'], steps: ['de:Mash it.'] } });
});

test('an unknown title is a 404 with its key', async () => {
  const res = await t.call('POST', '/api/translate/recipe', { language: 'pt', recipe: { ...served, title: 'Made up' } }, ana);
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ key: 'err.recipeUnavailable' });
});

test('English is not a language to translate into', async () => {
  const res = await t.call('POST', '/api/translate/titles', { language: 'en', titles: ['Banana mash'] }, ana);
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ key: 'err.language' });
});

test('a failing translator is a 502 and uses no allowance', async () => {
  t.setTranslator(async () => { throw new AppError('upstream-error', 'Could not reach OpenAI', { key: 'err.openaiUnreachable' }); });
  const res = await t.call('POST', '/api/translate/recipe', { language: 'pt', recipe: served }, ana);
  expect(res.status).toBe(502);
  expect(await used()).toBe(0);
});
