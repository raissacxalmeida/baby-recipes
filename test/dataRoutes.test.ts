import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer, type Jar, type TestServer } from './helpers/http.js';
import { createFakeTranslator } from './helpers/fakeTranslate.js';

let t: TestServer;
let ana: Jar;
let bia: Jar;
let admin: Jar;
let n = 0;

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

const raw = (title: string) => ({
  title, basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }],
  steps: ['Mash the banana.'], texture: 'mashed', allergens: [],
});
const recipe = (title: string) => ({
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

type BabyHeaders = Record<string, string>;
const setBirthday = (jar: Jar, date: unknown = '2026-03-14') => t.call('POST', '/api/babies', { name: 'Mia', birthdate: date }, jar);
const baby = async (jar: Jar, birthdate = '2026-03-14'): Promise<BabyHeaders> => (await t.addBaby(jar, { birthdate })).headers;
const suggest = (jar: Jar, headers?: BabyHeaders) => t.call('POST', '/api/recipe', { ingredients: ['banana'] }, jar, headers);
const getState = async (jar: Jar, headers: BabyHeaders) => (await t.call('GET', '/api/state', undefined, jar, headers)).body;
// A baby with no birthdate yet, as the migration leaves one for an account that had saved data but no birthday.
const babyWithoutBirthday = async (email: string): Promise<{ id: string; headers: BabyHeaders }> => {
  const { rows } = await t.db.query<{ id: string }>('insert into babies (user_id) select id from users where email = $1 returning id', [email]);
  return { id: rows[0].id, headers: { 'X-Baby-Id': rows[0].id } };
};
// Every route that works on one baby, called with a valid body for that route.
const babyRoutes = (sharedId: string): [method: string, path: string, body?: unknown][] => [
  ['GET', '/api/state'], ['POST', '/api/recipe', { ingredients: ['banana'] }],
  ['POST', '/api/liked', { recipe: recipe('Pear mash') }], ['DELETE', '/api/liked/banana-mash'],
  ['POST', '/api/disliked', { recipe: recipe('Banana mash') }], ['POST', '/api/disliked/oat-porridge/restore', {}],
  ['POST', '/api/shared', { id: 'banana-mash' }], ['POST', `/api/shared/${sharedId}/like`, {}],
];

test('every data route is 401 without a cookie', async () => {
  const calls: [method: string, path: string, body?: unknown][] = [
    ['GET', '/api/state'], ['POST', '/api/recipe', { ingredients: [] }],
    ['POST', '/api/liked', { recipe: recipe('A') }], ['DELETE', '/api/liked/a'], ['POST', '/api/disliked', { recipe: recipe('A') }],
    ['POST', '/api/disliked/a/restore', {}], ['DELETE', '/api/account'],
  ];
  for (const [method, path, body] of calls) expect((await t.call(method, path, body)).status, `${method} ${path}`).toBe(401);
});

test('the old birthday route is gone', async () => {
  expect((await t.call('PUT', '/api/birthdate', { birthdate: '2026-03-14' }, ana)).status).toBe(404);
});

test('state starts empty and shows the usage after a recipe', async () => {
  const { id, headers } = await babyWithoutBirthday('ana@example.com');
  expect(await getState(ana, headers)).toMatchObject({
    birthdate: null, liked: [], disliked: [], usage: { recipesToday: 0, limit: 10, resetsAt: '2026-10-16T00:00:00.000Z' },
  });
  expect((await t.call('PUT', `/api/babies/${id}`, { name: 'Mia', birthdate: '2026-03-14' }, ana)).status).toBe(200);
  const res = await suggest(ana, headers);
  expect(res.status).toBe(200);
  expect(res.body.recipe.title).toBe('Recipe 1');
  const state = await getState(ana, headers);
  expect(state.birthdate).toBe('2026-03-14');
  expect(state.usage.recipesToday).toBe(1);
});

test('the admin has no usage figure', async () => {
  expect((await getState(admin, await baby(admin))).usage).toBeNull();
});

test('a future birthday is 400 and a missing birthday blocks recipes', async () => {
  expect((await setBirthday(ana, '2999-01-01')).status).toBe(400);
  expect((await suggest(ana)).status).toBe(400);
  const blocked = await suggest(ana, (await babyWithoutBirthday('ana@example.com')).headers);
  expect(blocked.status).toBe(400);
  expect(blocked.body.key).toBe('err.birthdayFirst');
});

test('a birthdate that is a one-date list is read as its text, and other non-text values are refused', async () => {
  // The baby routes store the checked text, so the list no longer reaches the database as a list.
  const listed = await setBirthday(ana, ['2026-03-14']);
  expect(listed.status).toBe(200);
  expect(listed.body.baby.birthdate).toBe('2026-03-14');
  expect((await setBirthday(ana, { toString: 'x' })).status).toBe(400);
  expect((await setBirthday(ana, 20260314)).status).toBe(400);
});

test('a baby under 6 months is 422 and uses no recipe slot', async () => {
  const young = await baby(ana, '2026-07-14');
  expect((await suggest(ana, young)).status).toBe(422);
  expect((await getState(ana, young)).usage.recipesToday).toBe(0);
});

test('the 11th recipe of the day is 429', async () => {
  const mia = await baby(ana);
  for (let i = 0; i < 10; i++) expect((await suggest(ana, mia)).status).toBe(200);
  const res = await suggest(ana, mia);
  expect(res.status).toBe(429);
  expect(res.body.error).toBe('limit-reached');
  expect((await suggest(bia, await baby(bia))).status).toBe(200);
});

test('two simultaneous requests at 9 of 10 leave exactly one success', async () => {
  const mia = await baby(ana);
  for (let i = 0; i < 9; i++) await suggest(ana, mia);
  const results = await Promise.all([suggest(ana, mia), suggest(ana, mia)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
});

test('like, dislike and restore follow the lists', async () => {
  const mia = await baby(ana);
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana, mia);
  expect((await getState(ana, mia)).liked).toHaveLength(1);
  await t.call('POST', '/api/disliked', { recipe: recipe('Banana mash') }, ana, mia);
  let state = await getState(ana, mia);
  expect(state.liked).toEqual([]);
  expect(state.disliked).toHaveLength(1);
  await t.call('POST', '/api/disliked/banana-mash/restore', {}, ana, mia);
  state = await getState(ana, mia);
  expect(state.disliked).toEqual([]);
  await t.call('POST', '/api/liked', { recipe: recipe('Oat porridge') }, ana, mia);
  await t.call('DELETE', '/api/liked/oat-porridge', undefined, ana, mia);
  expect((await getState(ana, mia)).liked).toEqual([]);
  expect((await t.call('POST', '/api/liked', { recipe: { id: 'x' } }, ana, mia)).status).toBe(400);
});

test('one person cannot see or change anothers data', async () => {
  const mia = await baby(ana);
  const leo = await baby(bia);
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana, mia);
  expect((await getState(bia, leo)).liked).toEqual([]);
  await t.call('DELETE', '/api/liked/banana-mash', undefined, bia, leo);
  expect((await getState(ana, mia)).liked).toHaveLength(1);
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
  const mia = await baby(ana);
  const ok = await t.call('POST', '/api/recipe', { ingredients: ['Banana'], language: 'pt' }, ana, mia);
  expect(ok.status).toBe(200);
  expect(ok.body.recipe.ingredients[0]).toMatchObject({ name: 'banana', inList: true });
  const bad = await t.call('POST', '/api/recipe', { ingredients: ['banana'], language: 'xx' }, ana, mia);
  expect(bad.status).toBe(400);
  expect(bad.body).toMatchObject({ key: 'err.language' });
});

test('a baby-scoped route without the header is 400 with key err.babyRequired', async () => {
  await baby(ana);
  for (const [method, path, body] of babyRoutes('00000000-0000-4000-8000-000000000000')) {
    const res = await t.call(method, path, body, ana);
    expect(res.status, `${method} ${path}`).toBe(400);
    expect(res.body.key, `${method} ${path}`).toBe('err.babyRequired');
  }
});

test("another account's baby id is 404 err.babyMissing on every baby-scoped route, and nothing of it is read or written", async () => {
  await baby(ana);
  const leo = await baby(bia);
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, bia, leo);
  await t.call('POST', '/api/disliked', { recipe: recipe('Oat porridge') }, bia, leo);
  await t.call('POST', '/api/shared', { id: 'banana-mash' }, bia, leo);
  const before = await getState(bia, leo);
  const sharedId: string = (await t.call('GET', '/api/shared', undefined, bia)).body.recipes[0].id;

  for (const headers of [leo, { 'X-Baby-Id': 'not-a-uuid' }, { 'X-Baby-Id': '00000000-0000-4000-8000-000000000000' }]) {
    for (const [method, path, body] of babyRoutes(sharedId)) {
      const res = await t.call(method, path, body, ana, headers);
      expect(res.status, `${method} ${path} ${headers['X-Baby-Id']}`).toBe(404);
      expect(res.body.key, `${method} ${path}`).toBe('err.babyMissing');
      expect(JSON.stringify(res.body)).not.toContain('Banana mash');
    }
  }
  expect(await getState(bia, leo)).toEqual(before);
  expect(before).toMatchObject({ sharedIds: ['banana-mash'], disliked: [expect.objectContaining({ id: 'oat-porridge' })] });
  expect((await t.call('GET', '/api/shared', undefined, ana)).body.recipes[0]).toMatchObject({ likes: 0, liked: false });
  expect((await t.call('GET', '/api/session', undefined, ana)).status).toBe(200);
  expect((await t.db.query('select * from usage where recipes > 0 or calls > 0')).rows).toEqual([]);
});

test('liked lists are separate per baby', async () => {
  const mia = await baby(ana);
  const leo = await baby(ana, '2025-12-01');
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana, mia);
  await t.call('POST', '/api/liked', { recipe: recipe('Oat porridge') }, ana, leo);
  expect((await getState(ana, mia)).liked.map((r: { id: string }) => r.id)).toEqual(['banana-mash']);
  expect((await getState(ana, leo)).liked.map((r: { id: string }) => r.id)).toEqual(['oat-porridge']);
  await t.call('DELETE', '/api/liked/oat-porridge', undefined, ana, mia);
  expect((await getState(ana, leo)).liked).toHaveLength(1);
});

test('two babies draw from one daily allowance', async () => {
  const mia = await baby(ana);
  const leo = await baby(ana, '2025-12-01');
  // A different ingredient each time, so no request is served from the catalogue (which costs nothing).
  let k = 0;
  const generate = (headers: BabyHeaders) => t.call('POST', '/api/recipe', { ingredients: [`fruit${++k}`] }, ana, headers);
  for (let i = 0; i < 6; i++) expect((await generate(mia)).status).toBe(200);
  for (let i = 0; i < 4; i++) expect((await generate(leo)).status).toBe(200);
  for (const headers of [mia, leo]) {
    const res = await generate(headers);
    expect(res.status).toBe(429);
    expect(res.body.key).toBe('err.limitReached');
    expect((await getState(ana, headers)).usage.recipesToday).toBe(10);
  }
});

test("state.birthdate is the selected baby's", async () => {
  const mia = await baby(ana, '2026-03-14');
  const leo = await baby(ana, '2025-12-01');
  expect((await getState(ana, mia)).birthdate).toBe('2026-03-14');
  expect((await getState(ana, leo)).birthdate).toBe('2025-12-01');
});
