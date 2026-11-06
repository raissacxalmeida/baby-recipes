import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './helpers/db.js';
import { createInvite, acceptInvite, removeUser } from '../src/server/users.js';
import { getState as readState, like, dislike, unlike, type UserState } from '../src/server/userData.js';
import { requireBaby } from '../src/server/babies.js';
import { addTestBaby } from './helpers/babies.js';
import {
  shareRecipe, unshareRecipe, listShared as listSharedRows, likeShared, unlikeShared, type SharedListing,
} from '../src/server/sharedRecipes.js';
import type { Ingredient, Recipe } from '../src/shared/types.js';
import { present } from './helpers/present.js';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
const emails = { a: 'a@example.com', b: 'b@example.com', c: 'c@example.com' };
let a: string;
let b: string;
let c: string;
// Each person's first baby, by person id; the tests act for it unless they add another.
let kid: Record<string, string>;

// The server hands stored recipes back as unknown jsonb; every one here was stored by the test, so it is read as a Recipe.
const listShared = async (db: TestDb, viewer: string) => (await listSharedRows(db, viewer)) as (Omit<SharedListing, 'recipe'> & { recipe: Recipe })[];
const getState = async (db: TestDb, userId: string, babyId = kid[userId]) =>
  (await readState(db, userId, await requireBaby(db, userId, babyId))) as Omit<UserState, 'liked' | 'disliked'> & { liked: Recipe[]; disliked: Recipe[] };

const recipe = (title: string, step = 'Mash it.', ingredients: (Ingredient & { inList?: boolean })[] = [{ name: 'banana', grams: 100, inList: true }]) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2, ingredients, steps: [step], texture: 'mashed', allergens: [],
});
const banana = recipe('Banana mash');

beforeEach(async () => {
  await db.reset();
  const ids: Record<string, string> = {};
  kid = {};
  for (const [key, email] of Object.entries(emails)) {
    const { token } = await createInvite(db, email, now);
    ids[key] = (await acceptInvite(db, { token, password: 'a long enough password' }, now)).id;
    kid[ids[key]] = await addTestBaby(db, ids[key], '2026-02-14');
  }
  ({ a, b, c } = ids);
});

const shareLiked = async (user: string, r = banana) => {
  await like(db, kid[user], r);
  await shareRecipe(db, user, kid[user], r.id, now);
};
const only = async (viewer: string) => {
  const list = await listShared(db, viewer);
  expect(list).toHaveLength(1);
  return list[0];
};

test('a shared recipe shows to others with the baby age, group and no identity', async () => {
  await shareLiked(a, recipe('Salmon mash', 'Flake it.', [{ name: 'salmon', grams: 60 }, { name: 'potato', grams: 100 }]));
  const seen = await only(b);
  expect(seen).toMatchObject({ group: 'Fish', ageMonths: 8, likes: 0, mine: false, liked: false });
  expect(seen.recipe).toMatchObject({ title: 'Salmon mash', steps: ['Flake it.'] });
  expect((await only(a)).mine).toBe(true);
  const text = JSON.stringify(await listShared(db, b));
  expect(text).not.toContain(a);
  expect(text).not.toContain(emails.a);
});

test('sharing twice stores one', async () => {
  await shareLiked(a);
  await shareRecipe(db, a, kid[a], banana.id, now);
  expect(await listShared(db, b)).toHaveLength(1);
});

test('only a liked recipe of your own can be shared', async () => {
  await expect(shareRecipe(db, a, kid[a], 'nothing', now)).rejects.toMatchObject({ code: 'not-found' });
  await dislike(db, a, kid[a], banana);
  await expect(shareRecipe(db, a, kid[a], banana.id, now)).rejects.toMatchObject({ code: 'not-found' });
});

test('sharing without a birthdate is invalid-input', async () => {
  await db.query('update babies set birthdate = null where id = $1', [kid[a]]);
  await like(db, kid[a], banana);
  await expect(shareRecipe(db, a, kid[a], banana.id, now)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('a recipe saved from the community cannot be shared again', async () => {
  await shareLiked(a);
  await likeShared(db, b, kid[b], (await only(b)).id);
  await expect(shareRecipe(db, b, kid[b], banana.id, now)).rejects.toMatchObject({ code: 'conflict' });
});

test('the most liked comes first, then the newest', async () => {
  await shareLiked(a, recipe('Old plain'));
  await shareLiked(a, recipe('Popular'));
  await shareLiked(a, recipe('Newest plain'));
  const popular = present((await listShared(db, b)).find((r) => r.recipe.title === 'Popular'));
  await likeShared(db, b, kid[b], popular.id);
  await likeShared(db, c, kid[c], popular.id);
  const titles = (await listShared(db, b)).map((r) => r.recipe.title);
  expect(titles).toEqual(['Popular', 'Newest plain', 'Old plain']);
});

test('liking adds one to the count and saves a copy; liking twice counts once', async () => {
  await shareLiked(a);
  const { id } = await only(b);
  await likeShared(db, b, kid[b], id);
  await likeShared(db, b, kid[b], id);
  expect(await only(b)).toMatchObject({ likes: 1, liked: true });
  expect(await only(c)).toMatchObject({ likes: 1, liked: false });
  const state = await getState(db, b);
  expect(state.liked.map((r) => r.id)).toEqual([banana.id]);
  expect(state.copiedIds).toEqual([banana.id]);
});

test('your own share cannot be liked, and bad ids are not-found', async () => {
  await shareLiked(a);
  const { id } = await only(a);
  await expect(likeShared(db, a, kid[a], id)).rejects.toMatchObject({ code: 'invalid-input' });
  expect((await only(a)).likes).toBe(0);
  await expect(likeShared(db, b, kid[b], '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'not-found' });
  await expect(likeShared(db, b, kid[b], 'nope')).rejects.toMatchObject({ code: 'not-found' });
  await expect(unlikeShared(db, b, 'nope')).resolves.toBeUndefined();
});

test('taking a like back drops the count and removes the saved copy', async () => {
  await shareLiked(a);
  const { id } = await only(b);
  await likeShared(db, b, kid[b], id);
  await unlikeShared(db, b, id);
  expect(await only(b)).toMatchObject({ likes: 0, liked: false });
  expect((await getState(db, b)).liked).toEqual([]);
});

test('taking a like back never deletes a recipe of your own with the same id', async () => {
  await shareLiked(a);
  const own = recipe('Banana mash', 'My own way.');
  await like(db, kid[b], own);
  const { id } = await only(b);
  await likeShared(db, b, kid[b], id);
  let state = await getState(db, b);
  expect(state.liked[0].steps).toEqual(['My own way.']);
  expect(state.copiedIds).toEqual([]);
  expect((await only(b)).likes).toBe(1);
  await unlikeShared(db, b, id);
  state = await getState(db, b);
  expect(state.liked.map((r) => r.steps[0])).toEqual(['My own way.']);
  expect((await only(b)).likes).toBe(0);
});

test('liking replaces a disliked recipe with the same id', async () => {
  await shareLiked(a);
  await dislike(db, b, kid[b], banana);
  await likeShared(db, b, kid[b], (await only(b)).id);
  const state = await getState(db, b);
  expect(state.liked.map((r) => r.id)).toEqual([banana.id]);
  expect(state.disliked).toEqual([]);
});

test('two parents sharing the same recipe id stay separate', async () => {
  await shareLiked(a, recipe('Banana mash', 'A way.'));
  await shareLiked(b, recipe('Banana mash', 'B way.'));
  const list = await listShared(db, c);
  expect(list).toHaveLength(2);
  expect(new Set(list.map((r) => r.id)).size).toBe(2);
  const bs = present(list.find((r) => r.recipe.steps[0] === 'B way.'));
  await likeShared(db, c, kid[c], bs.id);
  const after = await listShared(db, c);
  expect(present(after.find((r) => r.recipe.steps[0] === 'B way.')).likes).toBe(1);
  expect(present(after.find((r) => r.recipe.steps[0] === 'A way.')).likes).toBe(0);
  expect((await getState(db, c)).liked[0].steps).toEqual(['B way.']);
});

test('unsharing removes the card and its likes but the likers keep their copy', async () => {
  await shareLiked(a);
  await likeShared(db, b, kid[b], (await only(b)).id);
  await unshareRecipe(db, a, banana.id);
  expect(await listShared(db, b)).toEqual([]);
  expect((await getState(db, b)).liked.map((r) => r.id)).toEqual([banana.id]);
  await expect(unshareRecipe(db, a, banana.id)).resolves.toBeUndefined();
});

test('removing a recipe from your liked list unshares it', async () => {
  await shareLiked(a);
  expect((await getState(db, a)).sharedIds).toEqual([banana.id]);
  await unlike(db, a, kid[a], banana.id);
  expect(await listShared(db, b)).toEqual([]);
  expect((await getState(db, a)).sharedIds).toEqual([]);
});

test('removing a saved copy from your liked list takes your like back', async () => {
  await shareLiked(a);
  await likeShared(db, b, kid[b], (await only(b)).id);
  await unlike(db, b, kid[b], banana.id);
  expect(await only(a)).toMatchObject({ likes: 0 });
  expect((await getState(db, b)).liked).toEqual([]);
});

test('removing your own recipe does not take back a like you gave while holding it', async () => {
  await shareLiked(a);
  const own = recipe('Banana mash', 'My own way.');
  await like(db, kid[b], own);
  await likeShared(db, b, kid[b], (await only(b)).id);
  await unlike(db, b, kid[b], banana.id);
  expect((await only(a)).likes).toBe(1);
});

test('removing a person removes what they shared and the likes they gave', async () => {
  await shareLiked(a);
  await likeShared(db, b, kid[b], (await only(b)).id);
  await removeUser(db, b);
  expect((await only(a)).likes).toBe(0);
  await likeShared(db, c, kid[c], (await only(c)).id);
  await removeUser(db, a);
  expect(await listShared(db, c)).toEqual([]);
  expect((await getState(db, c)).liked.map((r) => r.id)).toEqual([banana.id]);
});

test('liking a recipe yourself makes a former saved copy your own', async () => {
  await shareLiked(a);
  await likeShared(db, b, kid[b], (await only(b)).id);
  await like(db, kid[b], banana);
  expect((await getState(db, b)).copiedIds).toEqual([]);
});

test('disliking a recipe you shared unshares it', async () => {
  await shareLiked(a);
  await dislike(db, a, kid[a], banana);
  expect(await listShared(db, b)).toEqual([]);
});

test('with two sharers of the same recipe id, taking back one like keeps the copy from the other', async () => {
  await shareLiked(a, recipe('Banana mash', 'A way.'));
  await shareLiked(b, recipe('Banana mash', 'B way.'));
  const byWay = async (way: string) => present((await listShared(db, c)).find((r) => r.recipe.steps[0] === way));
  await likeShared(db, c, kid[c], (await byWay('A way.')).id);
  await likeShared(db, c, kid[c], (await byWay('B way.')).id);
  await unlikeShared(db, c, (await byWay('B way.')).id);
  expect((await getState(db, c)).liked.map((r) => r.steps[0])).toEqual(['A way.']);
  expect((await byWay('A way.')).likes).toBe(1);
  expect((await byWay('B way.')).likes).toBe(0);
});

test('removing the copy from your liked list only takes back the like it came from', async () => {
  await shareLiked(a, recipe('Banana mash', 'A way.'));
  await shareLiked(b, recipe('Banana mash', 'B way.'));
  const byWay = async (way: string) => present((await listShared(db, c)).find((r) => r.recipe.steps[0] === way));
  await likeShared(db, c, kid[c], (await byWay('A way.')).id);
  await likeShared(db, c, kid[c], (await byWay('B way.')).id);
  await unlike(db, c, kid[c], 'banana-mash');
  expect((await byWay('A way.')).likes).toBe(0);
  expect((await byWay('B way.')).likes).toBe(1);
});

test("sharing records the sharing baby's age in months", async () => {
  const older = await addTestBaby(db, a, '2025-12-01', 'Leo');
  await like(db, older, recipe('Pear mash'));
  await shareRecipe(db, a, older, 'pear-mash', now);
  await shareLiked(a);
  const ages = Object.fromEntries((await listShared(db, b)).map((r) => [r.recipe.title, r.ageMonths]));
  expect(ages).toEqual({ 'Pear mash': 10, 'Banana mash': 8 });
  await expect(shareRecipe(db, a, older, banana.id, now)).rejects.toMatchObject({ code: 'not-found', key: 'err.likeFirst' });
});

test("a Community like is saved into the selected baby's list and the heart shows for the account whichever baby is selected", async () => {
  const second = await addTestBaby(db, b, '2025-12-01', 'Leo');
  await shareLiked(a);
  await likeShared(db, b, second, (await only(b)).id);
  expect((await getState(db, b, second)).liked.map((r) => r.id)).toEqual([banana.id]);
  expect((await getState(db, b, second)).copiedIds).toEqual([banana.id]);
  expect((await getState(db, b)).liked).toEqual([]);
  expect(await only(b)).toMatchObject({ likes: 1, liked: true });
});

test('unliking in Community removes the copy from whichever baby holds it', async () => {
  const second = await addTestBaby(db, b, '2025-12-01', 'Leo');
  await shareLiked(a);
  const own = recipe('Banana mash', 'My own way.');
  await like(db, kid[b], own);
  await likeShared(db, b, second, (await only(b)).id);
  await unlikeShared(db, b, (await only(b)).id);
  expect((await getState(db, b, second)).liked).toEqual([]);
  expect((await getState(db, b)).liked.map((r) => r.steps[0])).toEqual(['My own way.']);
  expect(await only(b)).toMatchObject({ likes: 0, liked: false });
});
