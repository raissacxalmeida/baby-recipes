import { test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { createInvite, acceptInvite, createAdmin } from '../src/server/users.js';
import { setBirthdate, excludeTitles, addShown, like, dislike } from '../src/server/userData.js';
import { saveToCatalogue } from '../src/server/catalogue.js';
import { presentRecipe } from '../src/server/generate.js';
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

// catalogue(title, [name, grams]..., ageFromMonths?) saves a recipe straight into the catalogue.
const catalogue = (title, ...rest) => {
  const age = typeof rest[rest.length - 1] === 'number' ? rest.pop() : 6;
  const ingredients = rest.map(([name, grams]) => ({ name, grams }));
  return saveToCatalogue(db, raw(title, { ingredients }), { ageFromMonths: age, source: 'seed', sourceId: title });
};

test('a matching catalogue recipe is served with no model call and no usage', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  const cm = model(raw('Other'));
  const recipe = await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect(recipe).toMatchObject({ id: 'banana-mash', title: 'Banana mash' });
  expect(recipe.ingredients[0].inList).toBe(true);
  expect(cm).not.toHaveBeenCalled();
  expect(await usageToday(db, user.id, now())).toEqual({ recipes: 0, calls: 0 });
  expect(await excludeTitles(db, user.id)).toEqual(['Banana mash']);
});

test('the daily limits do not block catalogue recipes, only the OpenAI path', async () => {
  await db.query("insert into usage (user_id, day, recipes, calls) values ($1, '2026-10-15', 10, 30)", [user.id]);
  await catalogue('Banana mash', ['banana', 100]);
  await requestRecipe(db, user, ['banana'], { callModel: model(raw()), now });
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'limit-reached' });
});

test('a catalogue recipe is served once per parent', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await requestRecipe(db, user, ['banana'], { callModel: model(raw('Other')), now });
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now })).title).toBe('Other');
  expect(cm).toHaveBeenCalledTimes(1);
  const other = await signUp('bo@example.com');
  await setBirthdate(db, other.id, '2026-03-14', now());
  expect((await requestRecipe(db, other, ['banana'], { callModel: model(raw('Other')), now })).title).toBe('Banana mash');
});

test('liked and disliked catalogue titles are skipped', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await catalogue('Banana bowl', ['banana', 100]);
  await like(db, user.id, presentRecipe(raw('Banana mash'), ['banana']));
  await dislike(db, user.id, presentRecipe(raw('Banana bowl'), ['banana']));
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now })).title).toBe('Other');
});

test('invalid ingredients and a too-young baby are rejected before any lookup', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await expect(requestRecipe(db, user, [], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
  await setBirthdate(db, user.id, '2026-07-14', now());
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'too-young' });
});

test('the admin gets catalogue recipes and leaves no usage row', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  expect((await requestRecipe(db, admin, ['banana'], { callModel: model(raw('Other')), now })).title).toBe('Banana mash');
  expect((await db.query('select * from usage where user_id = $1', [admin.id])).rows).toHaveLength(0);
});

test('the model is told which catalogue titles overlap, without duplicates', async () => {
  await catalogue('Banana oat mash', ['banana', 100], ['oat', 60]);
  await addShown(db, user.id, 'Banana Mash', now());
  await catalogue('Banana mash', ['banana', 100]);
  const cm = model(raw('Other'));
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect([...cm.mock.calls[0][0].exclude].sort()).toEqual(['banana mash', 'banana oat mash']);
});

test('at most 30 catalogue titles are sent to the model', async () => {
  for (let i = 0; i < 35; i++) await catalogue(`Banana recipe ${String(i).padStart(2, '0')}`, ['banana', 100], ['oat', 60]);
  const cm = model(raw('Other'));
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect(cm.mock.calls[0][0].exclude).toHaveLength(30);
});

test('a recipe from OpenAI is saved and served to the next parent for free', async () => {
  await requestRecipe(db, user, ['banana'], { callModel: model(raw()), now });
  const row = (await db.query('select source, age_from_months, data from catalogue_recipes')).rows[0];
  expect(row).toMatchObject({ source: 'ai', age_from_months: 7 });
  expect(row.data.ingredients[0].inList).toBeUndefined();
  const other = await signUp('bo@example.com');
  await setBirthdate(db, other.id, '2026-03-14', now());
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, other, ['banana'], { callModel: cm, now })).title).toBe('Banana mash');
  expect(cm).not.toHaveBeenCalled();
});

test('a failing catalogue save does not fail the request', async () => {
  const flaky = { ...db, query: (t, p) => (/insert into catalogue_recipes/.test(t) ? Promise.reject(new Error('disk full')) : db.query(t, p)) };
  expect((await requestRecipe(flaky, user, ['banana'], { callModel: model(raw()), now })).title).toBe('Banana mash');
});
