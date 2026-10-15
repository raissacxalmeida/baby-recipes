import { test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { createInvite, acceptInvite, createAdmin } from '../src/server/users.js';
import { setBirthdate, excludeTitles } from '../src/server/userData.js';
import { usageToday } from '../src/server/usage.js';
import { requestRecipe } from '../src/server/recipeService.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = () => new Date('2026-10-15T12:00:00Z');
const raw = (title = 'Banana mash', over = {}) => ({
  title, basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }],
  steps: ['Mash the banana.'], texture: 'mashed', allergens: [], ...over,
});
const unsafe = () => raw('Honey mash', { ingredients: [{ name: 'honey', grams: 10 }] });
const model = (...answers) => vi.fn(async () => {
  const next = answers.length > 1 ? answers.shift() : answers[0];
  return typeof next === 'function' ? next() : next;
});
let user;
let admin;

async function signUp(email, isAdmin = false) {
  const { token } = isAdmin ? await createAdmin(db, email, now()) : await createInvite(db, email, now());
  return acceptInvite(db, { token, password: 'a long enough password' }, now());
}

beforeEach(async () => {
  await db.reset();
  admin = await signUp('me@example.com', true);
  user = await signUp('ana@example.com');
  await setBirthdate(db, user.id, '2026-03-14', now());
  await setBirthdate(db, admin.id, '2026-03-14', now());
});

test('a normal request returns a recipe, counts once and is remembered', async () => {
  const recipe = await requestRecipe(db, user, ['banana'], { callModel: model(raw()), now });
  expect(recipe.title).toBe('Banana mash');
  expect((await usageToday(db, user.id, now())).recipes).toBe(1);
  expect(await excludeTitles(db, user.id)).toEqual(['Banana mash']);
});

test('the model is told which titles to avoid', async () => {
  const cm = model(raw('Banana mash'), raw('Oat porridge'));
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect(cm.mock.calls[1][0].exclude).toEqual(['banana mash']);
});

test('no birthdate is invalid-input and uses nothing', async () => {
  await db.query('update users set birthdate = null where id = $1', [user.id]);
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
  expect(await usageToday(db, user.id, now())).toEqual({ recipes: 0, calls: 0 });
});

test('a baby under 6 months is too-young and the recipe slot is given back', async () => {
  await setBirthdate(db, user.id, '2026-07-14', now());
  const cm = model(raw());
  await expect(requestRecipe(db, user, ['banana'], { callModel: cm, now })).rejects.toMatchObject({ code: 'too-young' });
  expect(cm).not.toHaveBeenCalled();
  expect(await usageToday(db, user.id, now())).toEqual({ recipes: 0, calls: 0 });
});

test('three unsafe answers fail, free the recipe slot and keep the 3 calls', async () => {
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(unsafe()), now })).rejects.toMatchObject({ code: 'generation-failed' });
  expect(await usageToday(db, user.id, now())).toEqual({ recipes: 0, calls: 3 });
});

test('at 10 recipes the next request is limit-reached without calling the model', async () => {
  await db.query("insert into usage (user_id, day, recipes) values ($1, '2026-10-15', 10)", [user.id]);
  const cm = model(raw());
  await expect(requestRecipe(db, user, ['banana'], { callModel: cm, now })).rejects.toMatchObject({ code: 'limit-reached' });
  expect(cm).not.toHaveBeenCalled();
});

test('the 31st OpenAI call is limit-reached', async () => {
  await db.query("insert into usage (user_id, day, calls) values ($1, '2026-10-15', 30)", [user.id]);
  const cm = model(raw());
  await expect(requestRecipe(db, user, ['banana'], { callModel: cm, now })).rejects.toMatchObject({ code: 'limit-reached' });
  expect(cm).not.toHaveBeenCalled();
  expect((await usageToday(db, user.id, now())).recipes).toBe(0);
});

test('the admin is never limited and leaves no usage row', async () => {
  const cm = model(...Array.from({ length: 12 }, (_, i) => raw(`Recipe ${i}`)));
  for (let i = 0; i < 12; i++) await requestRecipe(db, admin, ['banana'], { callModel: cm, now });
  expect((await db.query('select * from usage where user_id = $1', [admin.id])).rows).toHaveLength(0);
});

test('upstream errors free the recipe slot', async () => {
  const { AppError } = await import('../src/server/errors.js');
  const cm = model(() => { throw new AppError('upstream-error', 'bad key'); });
  await expect(requestRecipe(db, user, ['banana'], { callModel: cm, now })).rejects.toMatchObject({ code: 'upstream-error' });
  expect((await usageToday(db, user.id, now())).recipes).toBe(0);
});
