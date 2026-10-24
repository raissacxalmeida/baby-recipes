import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer } from './helpers/http.js';
import { createFakeTranslator } from './helpers/fakeTranslate.js';

let t;
let ana;
let bia;
let admin;
let n = 0;

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

const raw = (title) => ({
  title, basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }],
  steps: ['Mash the banana.'], texture: 'mashed', allergens: [],
});
const recipe = (title) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2,
  ingredients: [{ name: 'banana', grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [],
});

beforeEach(async () => {
  await t.db.reset();
  n = 0;
  t.setModel(async () => raw(`Recipe ${++n}`));
  admin = await t.loginAsNew('me@example.com', true);
  ana = await t.loginAsNew('ana@example.com');
  bia = await t.loginAsNew('bia@example.com');
});

const setBirthday = (jar, date = '2026-03-14') => t.call('PUT', '/api/birthdate', { birthdate: date }, jar);
const suggest = (jar) => t.call('POST', '/api/recipe', { ingredients: ['banana'] }, jar);

test('every data route is 401 without a cookie', async () => {
  const calls = [
    ['GET', '/api/state'], ['PUT', '/api/birthdate', { birthdate: '2026-03-14' }], ['POST', '/api/recipe', { ingredients: [] }],
    ['POST', '/api/liked', { recipe: recipe('A') }], ['DELETE', '/api/liked/a'], ['POST', '/api/disliked', { recipe: recipe('A') }],
    ['POST', '/api/disliked/a/restore', {}], ['DELETE', '/api/account'],
  ];
  for (const [method, path, body] of calls) expect((await t.call(method, path, body)).status, `${method} ${path}`).toBe(401);
});

test('state starts empty and shows the usage after a recipe', async () => {
  expect((await t.call('GET', '/api/state', undefined, ana)).body).toMatchObject({
    birthdate: null, liked: [], disliked: [], usage: { recipesToday: 0, limit: 10, resetsAt: '2026-10-16T00:00:00.000Z' },
  });
  await setBirthday(ana);
  const res = await suggest(ana);
  expect(res.status).toBe(200);
  expect(res.body.recipe.title).toBe('Recipe 1');
  const state = (await t.call('GET', '/api/state', undefined, ana)).body;
  expect(state.birthdate).toBe('2026-03-14');
  expect(state.usage.recipesToday).toBe(1);
});

test('the admin has no usage figure', async () => {
  expect((await t.call('GET', '/api/state', undefined, admin)).body.usage).toBeNull();
});

test('a future birthday is 400 and a missing birthday blocks recipes', async () => {
  expect((await setBirthday(ana, '2999-01-01')).status).toBe(400);
  expect((await suggest(ana)).status).toBe(400);
});

test('a baby under 6 months is 422 and uses no recipe slot', async () => {
  await setBirthday(ana, '2026-07-14');
  expect((await suggest(ana)).status).toBe(422);
  expect((await t.call('GET', '/api/state', undefined, ana)).body.usage.recipesToday).toBe(0);
});

test('the 11th recipe of the day is 429', async () => {
  await setBirthday(ana);
  for (let i = 0; i < 10; i++) expect((await suggest(ana)).status).toBe(200);
  const res = await suggest(ana);
  expect(res.status).toBe(429);
  expect(res.body.error).toBe('limit-reached');
  await setBirthday(bia);
  expect((await suggest(bia)).status).toBe(200);
});

test('two simultaneous requests at 9 of 10 leave exactly one success', async () => {
  await setBirthday(ana);
  for (let i = 0; i < 9; i++) await suggest(ana);
  const results = await Promise.all([suggest(ana), suggest(ana)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
});

test('like, dislike and restore follow the lists', async () => {
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana);
  expect((await t.call('GET', '/api/state', undefined, ana)).body.liked).toHaveLength(1);
  await t.call('POST', '/api/disliked', { recipe: recipe('Banana mash') }, ana);
  let state = (await t.call('GET', '/api/state', undefined, ana)).body;
  expect(state.liked).toEqual([]);
  expect(state.disliked).toHaveLength(1);
  await t.call('POST', '/api/disliked/banana-mash/restore', {}, ana);
  state = (await t.call('GET', '/api/state', undefined, ana)).body;
  expect(state.disliked).toEqual([]);
  await t.call('POST', '/api/liked', { recipe: recipe('Oat porridge') }, ana);
  await t.call('DELETE', '/api/liked/oat-porridge', undefined, ana);
  expect((await t.call('GET', '/api/state', undefined, ana)).body.liked).toEqual([]);
  expect((await t.call('POST', '/api/liked', { recipe: { id: 'x' } }, ana)).status).toBe(400);
});

test('one person cannot see or change anothers data', async () => {
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana);
  expect((await t.call('GET', '/api/state', undefined, bia)).body.liked).toEqual([]);
  await t.call('DELETE', '/api/liked/banana-mash', undefined, bia);
  expect((await t.call('GET', '/api/state', undefined, ana)).body.liked).toHaveLength(1);
});

test('deleting an account removes the person and the old cookie stops working', async () => {
  const cookie = ana.cookie;
  const res = await t.call('DELETE', '/api/account', undefined, ana);
  expect(res.status).toBe(200);
  expect((await t.call('GET', '/api/session', undefined, { cookie })).status).toBe(401);
  const again = await t.addUser('ana@example.com');
  expect(again.email).toBe('ana@example.com');
});

test('the admin cannot delete the account', async () => {
  expect((await t.call('DELETE', '/api/account', undefined, admin)).status).toBe(403);
});

test('a recipe request in another language is translated, and an unknown language is refused', async () => {
  t.setTranslator(createFakeTranslator({ ingredients: { banana: 'banana' } }));
  await setBirthday(ana);
  const ok = await t.call('POST', '/api/recipe', { ingredients: ['Banana'], language: 'pt' }, ana);
  expect(ok.status).toBe(200);
  expect(ok.body.recipe.ingredients[0]).toMatchObject({ name: 'banana', inList: true });
  const bad = await t.call('POST', '/api/recipe', { ingredients: ['banana'], language: 'xx' }, ana);
  expect(bad.status).toBe(400);
  expect(bad.body).toMatchObject({ key: 'err.language' });
});
