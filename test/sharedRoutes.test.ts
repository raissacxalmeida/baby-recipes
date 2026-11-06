import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer, type Jar, type TestServer } from './helpers/http.js';

let t: TestServer;
let ana: Jar;
let bia: Jar;
// The X-Baby-Id header of each parent's first baby.
const kid = new Map<Jar, Record<string, string>>();

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

const recipe = (title: string, name = 'banana') => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2,
  ingredients: [{ name, grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [],
});

beforeEach(async () => {
  await t.db.reset();
  ana = await t.loginAsNew('ana@example.com');
  bia = await t.loginAsNew('bia@example.com');
  kid.clear();
  for (const jar of [ana, bia]) kid.set(jar, (await t.addBaby(jar)).headers);
});

const likeAndShare = async (jar: Jar, r: { id: string }, baby = kid.get(jar)) => {
  await t.call('POST', '/api/liked', { recipe: r }, jar, baby);
  return t.call('POST', '/api/shared', { id: r.id }, jar, baby);
};
const liked = async (jar: Jar, baby = kid.get(jar)) =>
  (await t.call('GET', '/api/state', undefined, jar, baby)).body.liked.map((r: { id: string }) => r.id);
const list = async (jar: Jar) => (await t.call('GET', '/api/shared', undefined, jar)).body.recipes;

test('every shared route is 401 without a cookie', async () => {
  const calls: [method: string, path: string, body?: unknown][] = [
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
  expect((await t.call('POST', `/api/shared/${seen[0].id}/like`, {}, bia, kid.get(bia))).status).toBe(200);
  expect((await list(ana))[0]).toMatchObject({ likes: 1, mine: true });
  const biaState = (await t.call('GET', '/api/state', undefined, bia, kid.get(bia))).body;
  expect(biaState.liked.map((r: { id: string }) => r.id)).toEqual(['salmon-mash']);
  expect(biaState.copiedIds).toEqual(['salmon-mash']);
  expect((await t.call('DELETE', `/api/shared/${seen[0].id}/like`, undefined, bia)).status).toBe(200);
  expect((await list(ana))[0].likes).toBe(0);
  expect((await t.call('GET', '/api/state', undefined, ana, kid.get(ana))).body.sharedIds).toEqual(['salmon-mash']);
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
  await t.call('POST', '/api/liked', { recipe: recipe('Banana mash') }, ana, kid.get(ana));
  expect((await t.call('POST', '/api/shared', { id: 'banana-mash' }, bia, kid.get(bia))).status).toBe(404);
  expect(await list(bia)).toEqual([]);
});

test('bad input is refused', async () => {
  expect((await t.call('POST', '/api/shared', {}, ana, kid.get(ana))).status).toBe(400);
  expect((await t.call('POST', '/api/shared', { id: 5 }, ana, kid.get(ana))).status).toBe(400);
  await likeAndShare(ana, recipe('Banana mash'));
  const { id } = (await list(ana))[0];
  expect((await t.call('POST', `/api/shared/${id}/like`, {}, ana, kid.get(ana))).status).toBe(400);
  expect((await t.call('POST', '/api/shared/not-a-uuid/like', {}, bia, kid.get(bia))).status).toBe(404);
});

test('two parents sharing the same recipe id are both listed', async () => {
  await likeAndShare(ana, recipe('Banana mash'));
  await likeAndShare(bia, recipe('Banana mash'));
  expect(await list(ana)).toHaveLength(2);
});

test("a Community like is saved into the selected baby's list and the heart (liked: true) shows for the account whichever baby is selected", async () => {
  const leo = (await t.addBaby(bia, { name: 'Leo', birthdate: '2025-12-01' })).headers;
  await likeAndShare(ana, recipe('Banana mash'));
  const [{ id }] = await list(bia);
  expect((await t.call('POST', `/api/shared/${id}/like`, {}, bia, leo)).status).toBe(200);
  expect(await liked(bia, leo)).toEqual(['banana-mash']);
  expect(await liked(bia)).toEqual([]);
  expect((await list(bia))[0]).toMatchObject({ likes: 1, liked: true });
  expect((await t.call('POST', `/api/shared/${id}/like`, {}, bia, kid.get(ana))).body.key).toBe('err.babyMissing');
  expect(await liked(ana)).toEqual(['banana-mash']);
  expect((await list(bia))[0].likes).toBe(1);
});

test('unliking in Community removes the copy from whichever baby holds it', async () => {
  const leo = (await t.addBaby(bia, { name: 'Leo', birthdate: '2025-12-01' })).headers;
  await likeAndShare(ana, recipe('Banana mash'));
  const [{ id }] = await list(bia);
  await t.call('POST', `/api/shared/${id}/like`, {}, bia, leo);
  // Unliking in Community is account-wide: it needs no baby.
  expect((await t.call('DELETE', `/api/shared/${id}/like`, undefined, bia)).status).toBe(200);
  expect(await liked(bia, leo)).toEqual([]);
  expect((await list(bia))[0]).toMatchObject({ likes: 0, liked: false });
  expect(await liked(ana)).toEqual(['banana-mash']);
});

test("sharing records the sharing baby's age in months", async () => {
  const leo = (await t.addBaby(ana, { name: 'Leo', birthdate: '2025-12-01' })).headers;
  expect((await likeAndShare(ana, recipe('Pear mash', 'pear'), leo)).status).toBe(200);
  expect((await likeAndShare(ana, recipe('Banana mash'))).status).toBe(200);
  const ages = Object.fromEntries((await list(bia)).map((r: { recipe: { title: string }; ageMonths: number }) => [r.recipe.title, r.ageMonths]));
  expect(ages).toEqual({ 'Pear mash': 10, 'Banana mash': 7 });
});
