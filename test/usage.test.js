import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { createInvite, acceptInvite } from '../src/server/users.js';
import {
  LIMITS, reserveRecipe, reserveCall, releaseRecipe, reserveTranslation, releaseTranslation, usageToday, nextReset,
} from '../src/server/usage.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
let id;

beforeEach(async () => {
  await db.reset();
  const { token } = await createInvite(db, 'a@example.com', now);
  id = (await acceptInvite(db, { token, password: 'a long enough password' }, now)).id;
});

test('limits are 10 recipes, 30 calls and 100 translations', () => {
  expect(LIMITS).toEqual({ recipes: 10, calls: 30, translations: 100 });
});

test('10 reservations succeed and the 11th fails', async () => {
  for (let i = 0; i < 10; i++) expect(await reserveRecipe(db, id, now)).toBe(true);
  expect(await reserveRecipe(db, id, now)).toBe(false);
});

test('12 simultaneous reservations give exactly 10 successes', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => reserveRecipe(db, id, now)));
  expect(results.filter(Boolean)).toHaveLength(10);
});

test('the next UTC day starts fresh', async () => {
  for (let i = 0; i < 10; i++) await reserveRecipe(db, id, now);
  expect(await reserveRecipe(db, id, new Date('2026-10-16T00:00:01Z'))).toBe(true);
});

test('releasing frees a slot and never goes below zero', async () => {
  await releaseRecipe(db, id, now);
  expect(await usageToday(db, id, now)).toEqual({ recipes: 0, calls: 0 });
  for (let i = 0; i < 10; i++) await reserveRecipe(db, id, now);
  await releaseRecipe(db, id, now);
  expect(await reserveRecipe(db, id, now)).toBe(true);
  expect(await reserveRecipe(db, id, now)).toBe(false);
});

test('calls stop after 30', async () => {
  for (let i = 0; i < 30; i++) expect(await reserveCall(db, id, now)).toBe(true);
  expect(await reserveCall(db, id, now)).toBe(false);
  expect((await usageToday(db, id, now)).calls).toBe(30);
});

test('nextReset is the next UTC midnight', () => {
  expect(nextReset(now).toISOString()).toBe('2026-10-16T00:00:00.000Z');
});

test('100 translation reservations succeed and the 101st fails', async () => {
  for (let i = 0; i < 100; i++) expect(await reserveTranslation(db, id, now)).toBe(true);
  expect(await reserveTranslation(db, id, now)).toBe(false);
});

test('releasing a translation frees one slot and never goes below zero', async () => {
  await releaseTranslation(db, id, now);
  for (let i = 0; i < 100; i++) await reserveTranslation(db, id, now);
  await releaseTranslation(db, id, now);
  expect(await reserveTranslation(db, id, now)).toBe(true);
  expect(await reserveTranslation(db, id, now)).toBe(false);
});

test('translation reservations do not change the recipe or call counts', async () => {
  await reserveTranslation(db, id, now);
  expect(await usageToday(db, id, now)).toEqual({ recipes: 0, calls: 0 });
});
