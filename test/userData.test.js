import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { createInvite, acceptInvite } from '../src/server/users.js';
import {
  getState, setBirthdate, like, dislike, unlike, restore, addShown, excludeTitles,
} from '../src/server/userData.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
let a;
let b;
const recipe = (title) => ({
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
});

test('birthdate round trip as plain text', async () => {
  expect((await getState(db, a)).birthdate).toBeNull();
  await setBirthdate(db, a, '2026-02-14', now);
  expect((await getState(db, a)).birthdate).toBe('2026-02-14');
});

test('an invalid or future birthdate is invalid-input', async () => {
  await expect(setBirthdate(db, a, '2999-01-01', now)).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(setBirthdate(db, a, 'banana', now)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('like twice stores one; dislike moves it; unlike removes it', async () => {
  await like(db, a, recipe('Banana mash'));
  await like(db, a, recipe('Banana mash'));
  expect((await getState(db, a)).liked).toHaveLength(1);
  await dislike(db, a, recipe('Banana mash'));
  let state = await getState(db, a);
  expect(state.liked).toEqual([]);
  expect(state.disliked.map((r) => r.title)).toEqual(['Banana mash']);
  await like(db, a, recipe('Banana mash'));
  await unlike(db, a, 'banana-mash');
  state = await getState(db, a);
  expect(state.liked).toEqual([]);
  expect(state.disliked).toEqual([]);
});

test('restore leaves the recipe in neither list and drops it from the exclusions', async () => {
  await addShown(db, a, 'Banana mash', now);
  await dislike(db, a, recipe('Banana mash'));
  expect(await excludeTitles(db, a)).toEqual(['Banana mash']);
  await restore(db, a, 'banana-mash');
  expect((await getState(db, a)).disliked).toEqual([]);
  expect(await excludeTitles(db, a)).toEqual([]);
});

test('a malformed recipe is invalid-input', async () => {
  await expect(like(db, a, { id: 'x' })).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(dislike(db, a, null)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('one person never sees or changes another persons lists', async () => {
  await like(db, a, recipe('Banana mash'));
  await dislike(db, a, recipe('Oat porridge'));
  await addShown(db, a, 'Banana mash', now);
  expect(await getState(db, b)).toEqual({
    birthdate: null, liked: [], disliked: [], sharedIds: [], copiedIds: [],
  });
  expect(await excludeTitles(db, b)).toEqual([]);
  await unlike(db, b, 'banana-mash');
  await restore(db, b, 'oat-porridge');
  const state = await getState(db, a);
  expect(state.liked).toHaveLength(1);
  expect(state.disliked).toHaveLength(1);
});

test('the shown list keeps only the latest 50', async () => {
  for (let i = 0; i < 60; i++) await addShown(db, a, `Recipe ${i}`, new Date(now.getTime() + i * 1000));
  const titles = await excludeTitles(db, a);
  expect(titles).toHaveLength(50);
  expect(titles).toContain('Recipe 59');
  expect(titles).not.toContain('Recipe 0');
});
