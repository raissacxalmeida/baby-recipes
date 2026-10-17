import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { createInvite, acceptInvite, removeUser } from '../src/server/users.js';
import { getState, setBirthdate, like, dislike, unlike } from '../src/server/userData.js';
import {
  shareRecipe, unshareRecipe, listShared, likeShared, unlikeShared,
} from '../src/server/sharedRecipes.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
const emails = { a: 'a@example.com', b: 'b@example.com', c: 'c@example.com' };
let a;
let b;
let c;

const recipe = (title, step = 'Mash it.', ingredients = [{ name: 'banana', grams: 100, inList: true }]) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2, ingredients, steps: [step], texture: 'mashed', allergens: [],
});
const banana = recipe('Banana mash');

beforeEach(async () => {
  await db.reset();
  const ids = {};
  for (const [key, email] of Object.entries(emails)) {
    const { token } = await createInvite(db, email, now);
    ids[key] = (await acceptInvite(db, { token, password: 'a long enough password' }, now)).id;
    await setBirthdate(db, ids[key], '2026-02-14', now);
  }
  ({ a, b, c } = ids);
});

const shareLiked = async (user, r = banana) => {
  await like(db, user, r);
  await shareRecipe(db, user, r.id, now);
};
const only = async (viewer) => {
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
  await shareRecipe(db, a, banana.id, now);
  expect(await listShared(db, b)).toHaveLength(1);
});

test('only a liked recipe of your own can be shared', async () => {
  await expect(shareRecipe(db, a, 'nothing', now)).rejects.toMatchObject({ code: 'not-found' });
  await dislike(db, a, banana);
  await expect(shareRecipe(db, a, banana.id, now)).rejects.toMatchObject({ code: 'not-found' });
});

test('sharing without a birthdate is invalid-input', async () => {
  await db.query('update users set birthdate = null where id = $1', [a]);
  await like(db, a, banana);
  await expect(shareRecipe(db, a, banana.id, now)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('a recipe saved from the community cannot be shared again', async () => {
  await shareLiked(a);
  await likeShared(db, b, (await only(b)).id);
  await expect(shareRecipe(db, b, banana.id, now)).rejects.toMatchObject({ code: 'conflict' });
});

test('the most liked comes first, then the newest', async () => {
  await shareLiked(a, recipe('Old plain'));
  await shareLiked(a, recipe('Popular'));
  await shareLiked(a, recipe('Newest plain'));
  const popular = (await listShared(db, b)).find((r) => r.recipe.title === 'Popular');
  await likeShared(db, b, popular.id);
  await likeShared(db, c, popular.id);
  const titles = (await listShared(db, b)).map((r) => r.recipe.title);
  expect(titles).toEqual(['Popular', 'Newest plain', 'Old plain']);
});

test('liking adds one to the count and saves a copy; liking twice counts once', async () => {
  await shareLiked(a);
  const { id } = await only(b);
  await likeShared(db, b, id);
  await likeShared(db, b, id);
  expect(await only(b)).toMatchObject({ likes: 1, liked: true });
  expect(await only(c)).toMatchObject({ likes: 1, liked: false });
  const state = await getState(db, b);
  expect(state.liked.map((r) => r.id)).toEqual([banana.id]);
  expect(state.copiedIds).toEqual([banana.id]);
});

test('your own share cannot be liked, and bad ids are not-found', async () => {
  await shareLiked(a);
  const { id } = await only(a);
  await expect(likeShared(db, a, id)).rejects.toMatchObject({ code: 'invalid-input' });
  expect((await only(a)).likes).toBe(0);
  await expect(likeShared(db, b, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'not-found' });
  await expect(likeShared(db, b, 'nope')).rejects.toMatchObject({ code: 'not-found' });
  await expect(unlikeShared(db, b, 'nope')).resolves.toBeUndefined();
});

test('taking a like back drops the count and removes the saved copy', async () => {
  await shareLiked(a);
  const { id } = await only(b);
  await likeShared(db, b, id);
  await unlikeShared(db, b, id);
  expect(await only(b)).toMatchObject({ likes: 0, liked: false });
  expect((await getState(db, b)).liked).toEqual([]);
});

test('taking a like back never deletes a recipe of your own with the same id', async () => {
  await shareLiked(a);
  const own = recipe('Banana mash', 'My own way.');
  await like(db, b, own);
  const { id } = await only(b);
  await likeShared(db, b, id);
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
  await dislike(db, b, banana);
  await likeShared(db, b, (await only(b)).id);
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
  const bs = list.find((r) => r.recipe.steps[0] === 'B way.');
  await likeShared(db, c, bs.id);
  const after = await listShared(db, c);
  expect(after.find((r) => r.recipe.steps[0] === 'B way.').likes).toBe(1);
  expect(after.find((r) => r.recipe.steps[0] === 'A way.').likes).toBe(0);
  expect((await getState(db, c)).liked[0].steps).toEqual(['B way.']);
});

test('unsharing removes the card and its likes but the likers keep their copy', async () => {
  await shareLiked(a);
  await likeShared(db, b, (await only(b)).id);
  await unshareRecipe(db, a, banana.id);
  expect(await listShared(db, b)).toEqual([]);
  expect((await getState(db, b)).liked.map((r) => r.id)).toEqual([banana.id]);
  await expect(unshareRecipe(db, a, banana.id)).resolves.toBeUndefined();
});

test('removing a recipe from your liked list unshares it', async () => {
  await shareLiked(a);
  expect((await getState(db, a)).sharedIds).toEqual([banana.id]);
  await unlike(db, a, banana.id);
  expect(await listShared(db, b)).toEqual([]);
  expect((await getState(db, a)).sharedIds).toEqual([]);
});

test('removing a saved copy from your liked list takes your like back', async () => {
  await shareLiked(a);
  await likeShared(db, b, (await only(b)).id);
  await unlike(db, b, banana.id);
  expect(await only(a)).toMatchObject({ likes: 0 });
  expect((await getState(db, b)).liked).toEqual([]);
});

test('removing your own recipe does not take back a like you gave while holding it', async () => {
  await shareLiked(a);
  const own = recipe('Banana mash', 'My own way.');
  await like(db, b, own);
  await likeShared(db, b, (await only(b)).id);
  await unlike(db, b, banana.id);
  expect((await only(a)).likes).toBe(1);
});

test('removing a person removes what they shared and the likes they gave', async () => {
  await shareLiked(a);
  await likeShared(db, b, (await only(b)).id);
  await removeUser(db, b);
  expect((await only(a)).likes).toBe(0);
  await likeShared(db, c, (await only(c)).id);
  await removeUser(db, a);
  expect(await listShared(db, c)).toEqual([]);
  expect((await getState(db, c)).liked.map((r) => r.id)).toEqual([banana.id]);
});

test('liking a recipe yourself makes a former saved copy your own', async () => {
  await shareLiked(a);
  await likeShared(db, b, (await only(b)).id);
  await like(db, b, banana);
  expect((await getState(db, b)).copiedIds).toEqual([]);
});

test('disliking a recipe you shared unshares it', async () => {
  await shareLiked(a);
  await dislike(db, a, banana);
  expect(await listShared(db, b)).toEqual([]);
});
