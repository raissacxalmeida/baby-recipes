import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer } from './helpers/http.js';

let t;
let ana;
let bia;

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

const recipe = (title, name = 'banana') => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2,
  ingredients: [{ name, grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [],
});

beforeEach(async () => {
  await t.db.reset();
  ana = await t.loginAsNew('ana@example.com');
  bia = await t.loginAsNew('bia@example.com');
  for (const jar of [ana, bia]) await t.call('PUT', '/api/birthdate', { birthdate: '2026-03-14' }, jar);
});

const likeAndShare = async (jar, r) => {
  await t.call('POST', '/api/liked', { recipe: r }, jar);
  return t.call('POST', '/api/shared', { id: r.id }, jar);
};
const list = async (jar) => (await t.call('GET', '/api/shared', undefined, jar)).body.recipes;

test('every shared route is 401 without a cookie', async () => {
  const calls = [
    ['GET', '/api/shared'], ['POST', '/api/shared', { id: 'a' }], ['DELETE', '/api/shared/a'],
    ['POST', '/api/shared/00000000-0000-4000-8000-000000000000/like', {}],
    ['DELETE', '/api/shared/00000000-0000-4000-8000-000000000000/like'],
  ];
  for (const [method, path, body] of calls) expect((await t.call(method, path, body)).status, `${method} ${path}`).toBe(401);
});

test('share, see, like, unlike and unshare across two parents', async () => {
  expect((await likeAndShare(ana, recipe('Salmon mash', 'salmon'))).status).toBe(200);
  const seen = await list(bia);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ group: 'Fish', ageMonths: 7, likes: 0, mine: false, liked: false });
  expect((await t.call('POST', `/api/shared/${seen[0].id}/like`, {}, bia)).status).toBe(200);
  expect((await list(ana))[0]).toMatchObject({ likes: 1, mine: true });
  const biaState = (await t.call('GET', '/api/state', undefined, bia)).body;
  expect(biaState.liked.map((r) => r.id)).toEqual(['salmon-mash']);
  expect(biaState.copiedIds).toEqual(['salmon-mash']);
  expect((await t.call('DELETE', `/api/shared/${seen[0].id}/like`, undefined, bia)).status).toBe(200);
  expect((await list(ana))[0].likes).toBe(0);
  expect((await t.call('GET', '/api/state', undefined, ana)).body.sharedIds).toEqual(['salmon-mash']);
  expect((await t.call('DELETE', '/api/shared/salmon-mash', undefined, ana)).status).toBe(200);
  expect(await list(bia)).toEqual([]);
});

test('no response says who shared a recipe', async () => {
  await likeAndShare(ana, recipe('Banana mash'));
  const anaId = (await t.db.query("select id from users where email = 'ana@example.com'")).rows[0].id;
  for (const jar of [ana, bia]) {
    const res = await t.call('GET', '/api/shared', undefined, jar);
    expect(res.body.recipes).toHaveLength(1);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(anaId);
    expect(raw).not.toContain('ana@example.com');
  }
});

test('a recipe only another parent liked cannot be shared', async () => {
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana);
  expect((await t.call('POST', '/api/shared', { id: 'banana-mash' }, bia)).status).toBe(404);
  expect(await list(bia)).toEqual([]);
});

test('bad input is refused', async () => {
  expect((await t.call('POST', '/api/shared', {}, ana)).status).toBe(400);
  expect((await t.call('POST', '/api/shared', { id: 5 }, ana)).status).toBe(400);
  await likeAndShare(ana, recipe('Banana mash'));
  const { id } = (await list(ana))[0];
  expect((await t.call('POST', `/api/shared/${id}/like`, {}, ana)).status).toBe(400);
  expect((await t.call('POST', '/api/shared/not-a-uuid/like', {}, bia)).status).toBe(404);
});

test('two parents sharing the same recipe id are both listed', async () => {
  await likeAndShare(ana, recipe('Banana mash'));
  await likeAndShare(bia, recipe('Banana mash'));
  expect(await list(ana)).toHaveLength(2);
});
