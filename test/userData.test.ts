import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './helpers/db.js';
import { addTestBaby } from './helpers/babies.js';
import { createInvite, acceptInvite } from '../src/server/users.js';
import { addBaby, requireBaby } from '../src/server/babies.js';
import { shareRecipe, likeShared, listShared } from '../src/server/sharedRecipes.js';
import type { Recipe } from '../src/shared/types.js';
import {
  getState as readState, like, dislike, unlike, restore, addShown, excludeTitles,
} from '../src/server/userData.js';
import type { UserState } from '../src/server/userData.js';

// The server hands stored recipes back as unknown jsonb; every one here was stored by the test, so it is read as a Recipe.
const getState = async (db: TestDb, userId: string, babyId: string) =>
  (await readState(db, userId, await requireBaby(db, userId, babyId))) as Omit<UserState, 'liked' | 'disliked'> & { liked: Recipe[]; disliked: Recipe[] };

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
let a: string;
let b: string;
// a's two babies and b's one.
let a1: string;
let a2: string;
let b1: string;
const recipe = (title: string) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2,
  ingredients: [{ name: 'banana', grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [],
});

beforeEach(async () => {
  await db.reset();
  for (const email of ['a@example.com', 'b@example.com']) {
    const { token } = await createInvite(db, email, now);
    const user = await acceptInvite(db, { token, password: 'a long enough password' }, now);
    if (email.startsWith('a')) a = user.id; else b = user.id;
  }
  a1 = await addTestBaby(db, a);
  a2 = await addTestBaby(db, a, '2025-12-01', 'Leo');
  b1 = await addTestBaby(db, b);
});

test('birthdate round trip as plain text', async () => {
  const { id } = await addBaby(db, a, { name: 'Noa', birthdate: '2026-02-14' }, now);
  expect((await getState(db, a, id)).birthdate).toBe('2026-02-14');
  await db.query('update babies set birthdate = null where id = $1', [id]);
  expect((await getState(db, a, id)).birthdate).toBeNull();
});

test('an invalid or future birthdate is invalid-input', async () => {
  await expect(addBaby(db, a, { name: 'Noa', birthdate: '2999-01-01' }, now)).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(addBaby(db, a, { name: 'Noa', birthdate: 'banana' }, now)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('like twice stores one; dislike moves it; unlike removes it', async () => {
  await like(db, a1, recipe('Banana mash'));
  await like(db, a1, recipe('Banana mash'));
  expect((await getState(db, a, a1)).liked).toHaveLength(1);
  await dislike(db, a, a1, recipe('Banana mash'));
  let state = await getState(db, a, a1);
  expect(state.liked).toEqual([]);
  expect(state.disliked.map((r) => r.title)).toEqual(['Banana mash']);
  await like(db, a1, recipe('Banana mash'));
  await unlike(db, a, a1, 'banana-mash');
  state = await getState(db, a, a1);
  expect(state.liked).toEqual([]);
  expect(state.disliked).toEqual([]);
});

test('restore leaves the recipe in neither list and drops it from the exclusions', async () => {
  await addShown(db, a1, 'Banana mash', now);
  await dislike(db, a, a1, recipe('Banana mash'));
  expect(await excludeTitles(db, a1)).toEqual(['Banana mash']);
  await restore(db, a1, 'banana-mash');
  expect((await getState(db, a, a1)).disliked).toEqual([]);
  expect(await excludeTitles(db, a1)).toEqual([]);
});

test('liked titles are excluded too', async () => {
  await like(db, a1, recipe('Banana mash'));
  expect(await excludeTitles(db, a1)).toEqual(['Banana mash']);
});

test('a malformed recipe is invalid-input', async () => {
  await expect(like(db, a1, { id: 'x' })).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(dislike(db, a, a1, null)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('one person never sees or changes another persons lists', async () => {
  await like(db, a1, recipe('Banana mash'));
  await dislike(db, a, a1, recipe('Oat porridge'));
  await addShown(db, a1, 'Banana mash', now);
  expect(await getState(db, b, b1)).toEqual({
    birthdate: '2026-02-14', liked: [], disliked: [], sharedIds: [], copiedIds: [],
  });
  expect(await excludeTitles(db, b1)).toEqual([]);
  await unlike(db, b, b1, 'banana-mash');
  await restore(db, b1, 'oat-porridge');
  const state = await getState(db, a, a1);
  expect(state.liked).toHaveLength(1);
  expect(state.disliked).toHaveLength(1);
});

test('the shown list keeps only the latest 50', async () => {
  for (let i = 0; i < 60; i++) await addShown(db, a1, `Recipe ${i}`, new Date(now.getTime() + i * 1000));
  const titles = await excludeTitles(db, a1);
  expect(titles).toHaveLength(50);
  expect(titles).toContain('Recipe 59');
  expect(titles).not.toContain('Recipe 0');
  expect(await excludeTitles(db, a2)).toEqual([]);
});

test('the same recipe is liked for one baby and disliked for the other', async () => {
  await like(db, a1, recipe('Banana mash'));
  await dislike(db, a, a2, recipe('Banana mash'));
  const first = await getState(db, a, a1);
  const second = await getState(db, a, a2);
  expect(first.liked.map((r) => r.id)).toEqual(['banana-mash']);
  expect(first.disliked).toEqual([]);
  expect(second.liked).toEqual([]);
  expect(second.disliked.map((r) => r.id)).toEqual(['banana-mash']);
  expect(first.birthdate).toBe('2026-02-14');
  expect(second.birthdate).toBe('2025-12-01');
});

test('excludeTitles and addShown are per baby (a title shown to one baby is not excluded for the other)', async () => {
  await addShown(db, a1, 'Banana mash', now);
  expect(await excludeTitles(db, a1)).toEqual(['Banana mash']);
  expect(await excludeTitles(db, a2)).toEqual([]);
  await like(db, a2, recipe('Oat porridge'));
  expect(await excludeTitles(db, a1)).toEqual(['Banana mash']);
  expect(await excludeTitles(db, a2)).toEqual(['Oat porridge']);
});

test('restore only clears the dislike and shown title of its own baby', async () => {
  for (const baby of [a1, a2]) {
    await addShown(db, baby, 'Banana mash', now);
    await dislike(db, a, baby, recipe('Banana mash'));
  }
  await restore(db, a2, 'banana-mash');
  expect((await getState(db, a, a2)).disliked).toEqual([]);
  expect(await excludeTitles(db, a2)).toEqual([]);
  expect((await getState(db, a, a1)).disliked.map((r) => r.id)).toEqual(['banana-mash']);
  expect(await excludeTitles(db, a1)).toEqual(['Banana mash']);
});

test('unlike of a Community copy keeps the Community like while a sibling baby still holds a copy, and removes it when the last copy goes', async () => {
  await like(db, b1, recipe('Banana mash'));
  await shareRecipe(db, b, b1, 'banana-mash', now);
  const [{ id: sharedId }] = await listShared(db, a);
  await likeShared(db, a, a1, sharedId);
  await likeShared(db, a, a2, sharedId);
  expect((await getState(db, a, a1)).copiedIds).toEqual(['banana-mash']);
  expect((await getState(db, a, a2)).copiedIds).toEqual(['banana-mash']);

  await unlike(db, a, a1, 'banana-mash');
  expect((await getState(db, a, a1)).liked).toEqual([]);
  expect((await getState(db, a, a2)).liked.map((r) => r.id)).toEqual(['banana-mash']);
  expect((await listShared(db, a))[0]).toMatchObject({ likes: 1, liked: true });

  await unlike(db, a, a2, 'banana-mash');
  expect((await getState(db, a, a2)).liked).toEqual([]);
  expect((await listShared(db, a))[0]).toMatchObject({ likes: 0, liked: false });
});
