import { test, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer } from './helpers/http.js';
import { createFakeTranslator } from './helpers/fakeTranslate.js';

let t;
beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

const model = () => ({
  title: 'Potato mash', basePortions: 2, ingredients: [{ name: 'potato', grams: 100 }, { name: 'water', grams: 20 }],
  steps: ['Boil the potato.', 'Mash it with the water.'], texture: 'mashed', allergens: [],
});

test('a Portuguese parent types batata, gets the recipe, reads it in Portuguese and sees the same title in the list', async () => {
  t.setModel(async () => model());
  const translator = createFakeTranslator({ ingredients: { batata: 'potato' } });
  t.setTranslator(translator);
  const ana = await t.loginAsNew('ana@example.com');
  await t.call('PUT', '/api/birthdate', { birthdate: '2026-03-14' }, ana);

  const made = await t.call('POST', '/api/recipe', { ingredients: ['batata'], language: 'pt' }, ana);
  expect(made.status).toBe(200);
  const { recipe } = made.body;
  expect(recipe.title).toBe('Potato mash');
  expect(recipe.ingredients.map((i) => [i.name, i.inList])).toEqual([['potato', true], ['water', false]]);

  const translated = await t.call('POST', '/api/translate/recipe', { language: 'pt', recipe }, ana);
  expect(translated.body.translation).toEqual({
    title: 'pt:Potato mash', ingredients: ['pt:potato', 'pt:water'], steps: ['pt:Boil the potato.', 'pt:Mash it with the water.'],
  });

  expect((await t.call('POST', '/api/liked', { recipe }, ana)).status).toBe(200);
  const titles = await t.call('POST', '/api/translate/titles', { language: 'pt', titles: ['Potato mash'] }, ana);
  expect(titles.body.titles['Potato mash']).toBe(translated.body.translation.title);

  const state = await t.call('GET', '/api/state', undefined, ana);
  expect(state.body.liked[0]).toMatchObject({ title: 'Potato mash', steps: ['Boil the potato.', 'Mash it with the water.'] });
  expect(state.body.liked[0].ingredients.map((i) => i.name)).toEqual(['potato', 'water']);
});
