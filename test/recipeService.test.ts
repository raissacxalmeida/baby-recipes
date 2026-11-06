import { test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestDb, type TestDb } from './helpers/db.js';
import { createInvite, acceptInvite, createAdmin } from '../src/server/users.js';
import { excludeTitles, addShown, like, dislike } from '../src/server/userData.js';
import { requireBaby } from '../src/server/babies.js';
import { addTestBaby } from './helpers/babies.js';
import { present } from './helpers/present.js';
import { saveToCatalogue } from '../src/server/catalogue.js';
import { presentRecipe } from '../src/server/generate.js';
import { usageToday } from '../src/server/usage.js';
import { requestRecipe as serveRecipe } from '../src/server/recipeService.js';
import { createFakeTranslator } from './helpers/fakeTranslate.js';
import { AppError } from '../src/server/errors.js';
import type { Baby } from '../src/server/babies.js';
import type { ModelCall, Row, SessionUser, StoredRecipe } from '../src/server/types.js';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = () => new Date('2026-10-15T12:00:00Z');
const raw = (title = 'Banana mash', over: Partial<StoredRecipe> = {}) => ({
  title, basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }],
  steps: ['Mash the banana.'], texture: 'mashed', allergens: [], ...over,
});
const unsafe = () => raw('Honey mash', { ingredients: [{ name: 'honey', grams: 10 }] });
const model = (...answers: unknown[]) => vi.fn<ModelCall>(async () => {
  const next = answers.length > 1 ? answers.shift() : answers[0];
  return typeof next === 'function' ? next() : next;
});
let user: SessionUser;
let admin: SessionUser;
// The baby the person asks for; recipes, shown titles and the age belong to it.
let baby: Baby;

// requestRecipe takes the signed-in person (SessionUser); acceptInvite's answer has all of it but `language`,
// which requestRecipe does not read.
async function signUp(email: string, isAdmin = false): Promise<SessionUser> {
  const { token } = isAdmin ? await createAdmin(db, email, now()) : await createInvite(db, email, now());
  return acceptInvite(db, { token, password: 'a long enough password' }, now()) as Promise<SessionUser>;
}

type RecipeDeps = Parameters<typeof serveRecipe>[4];
// The baby each person's requests are for, unless a test names another.
const babies = new Map<string, Baby>();
// An English request never reaches the translator, so most tests leave callTranslate out of the deps the real
// function requires; the tests that give a language pass one.
const requestRecipe = (db: TestDb, user: SessionUser, ingredients: unknown, deps: Omit<RecipeDeps, 'callTranslate'> & Partial<RecipeDeps>, forBaby?: Baby) =>
  serveRecipe(db, user, forBaby ?? present(babies.get(user.id)), ingredients, deps as RecipeDeps);
// A baby for the person, born on the given day; it becomes the one their requests are for.
async function babyFor(person: SessionUser, birthdate = '2026-03-14'): Promise<Baby> {
  const found = await requireBaby(db, person.id, await addTestBaby(db, person.id, birthdate));
  babies.set(person.id, found);
  return found;
}

beforeEach(async () => {
  await db.reset();
  admin = await signUp('me@example.com', true);
  user = await signUp('ana@example.com');
  babies.clear();
  baby = await babyFor(user);
  await babyFor(admin);
});

test('a normal request returns a recipe, counts once and is remembered', async () => {
  const recipe = await requestRecipe(db, user, ['banana'], { callModel: model(raw()), now });
  expect(recipe.title).toBe('Banana mash');
  expect((await usageToday(db, user.id, now())).recipes).toBe(1);
  expect(await excludeTitles(db, baby.id)).toEqual(['Banana mash']);
});

test('the model is told which titles to avoid', async () => {
  const cm = model(raw('Banana mash'), raw('Oat porridge'));
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect(cm.mock.calls[1][0].exclude).toEqual(['banana mash']);
});

test('no birthdate is invalid-input and uses nothing', async () => {
  await db.query('update babies set birthdate = null where id = $1', [baby.id]);
  const unborn = await requireBaby(db, user.id, baby.id);
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now }, unborn)).rejects.toMatchObject({ code: 'invalid-input', key: 'err.birthdayFirst' });
  expect(await usageToday(db, user.id, now())).toEqual({ recipes: 0, calls: 0 });
});

test('a baby under 6 months is too-young and the recipe slot is given back', async () => {
  await babyFor(user, '2026-07-14');
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
const catalogue = (title: string, ...rest: ([string, number] | number)[]) => {
  // A trailing number is the age; once it is popped, the rest are [name, grams] pairs.
  const age = typeof rest[rest.length - 1] === 'number' ? rest.pop() as number : 6;
  const ingredients = (rest as [string, number][]).map(([name, grams]) => ({ name, grams }));
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
  expect(await excludeTitles(db, baby.id)).toEqual(['Banana mash']);
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
  await babyFor(other);
  expect((await requestRecipe(db, other, ['banana'], { callModel: model(raw('Other')), now })).title).toBe('Banana mash');
});

test('liked and disliked catalogue titles are skipped', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await catalogue('Banana bowl', ['banana', 100]);
  await like(db, baby.id, presentRecipe(raw('Banana mash'), ['banana']));
  await dislike(db, user.id, baby.id, presentRecipe(raw('Banana bowl'), ['banana']));
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now })).title).toBe('Other');
});

test('invalid ingredients and a too-young baby are rejected before any lookup', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await expect(requestRecipe(db, user, [], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
  await babyFor(user, '2026-07-14');
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'too-young' });
});

test('the admin gets catalogue recipes and leaves no usage row', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  expect((await requestRecipe(db, admin, ['banana'], { callModel: model(raw('Other')), now })).title).toBe('Banana mash');
  expect((await db.query('select * from usage where user_id = $1', [admin.id])).rows).toHaveLength(0);
});

test('the model is told which catalogue titles overlap, without duplicates', async () => {
  await catalogue('Banana oat mash', ['banana', 100], ['oat', 60]);
  await addShown(db, baby.id, 'Banana Mash', now());
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
  const row = (await db.query<{ source: string; age_from_months: number; data: { ingredients: { inList?: boolean }[] } }>('select source, age_from_months, data from catalogue_recipes')).rows[0];
  expect(row).toMatchObject({ source: 'ai', age_from_months: 7 });
  expect(row.data.ingredients[0].inList).toBeUndefined();
  const other = await signUp('bo@example.com');
  await babyFor(other);
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, other, ['banana'], { callModel: cm, now })).title).toBe('Banana mash');
  expect(cm).not.toHaveBeenCalled();
});

test('a failing catalogue save does not fail the request', async () => {
  const flaky = { ...db, query: <R = Row>(t: string, p?: unknown[]) => (/insert into catalogue_recipes/.test(t) ? Promise.reject(new Error('disk full')) : db.query<R>(t, p)) };
  expect((await requestRecipe(flaky, user, ['banana'], { callModel: model(raw()), now })).title).toBe('Banana mash');
});

const potato = (title = 'Potato mash') => raw(title, { ingredients: [{ name: 'potato', grams: 100 }], steps: ['Mash the potato.'] });
const portuguese = (ingredients: Record<string, string> = { batata: 'potato' }) => ({ callTranslate: createFakeTranslator({ ingredients }), now, language: 'pt' as const });

test('typed words in another language are turned into English before the model is asked', async () => {
  const cm = model(potato());
  const recipe = await requestRecipe(db, user, ['batata'], { callModel: cm, ...portuguese() });
  expect(cm.mock.calls[0][0].ingredients).toEqual(['potato']);
  expect(recipe.ingredients[0]).toMatchObject({ name: 'potato', inList: true });
});

test('a catalogue recipe is found from the translated English words', async () => {
  await saveToCatalogue(db, potato(), { ageFromMonths: 6, source: 'ai' });
  const cm = model(potato('Another'));
  const recipe = await requestRecipe(db, user, ['batata'], { callModel: cm, ...portuguese() });
  expect(recipe.title).toBe('Potato mash');
  expect(cm).not.toHaveBeenCalled();
});

test('when no typed word can be placed there is no recipe call and no allowance used', async () => {
  const cm = model(potato());
  await expect(requestRecipe(db, user, ['xyzzy'], { callModel: cm, ...portuguese({}) })).rejects.toMatchObject({ key: 'err.ingredientsNeeded' });
  expect(cm).not.toHaveBeenCalled();
  expect((await usageToday(db, user.id, now())).recipes).toBe(0);
});

test('"mel" becomes honey and the English recipe check still refuses a honey recipe', async () => {
  const cm = model(unsafe());
  await expect(requestRecipe(db, user, ['mel'], { callModel: cm, ...portuguese({ mel: 'honey' }) })).rejects.toMatchObject({ code: 'generation-failed' });
  expect(cm.mock.calls[0][0].ingredients).toEqual(['honey']);
});

test('a failing translation fails the request before the model is asked and counts nothing', async () => {
  const cm = model(potato());
  const callTranslate = async () => { throw new AppError('upstream-error', 'Could not reach OpenAI', { key: 'err.openaiUnreachable' }); };
  await expect(requestRecipe(db, user, ['batata'], { callModel: cm, callTranslate, now, language: 'pt' })).rejects.toMatchObject({ code: 'upstream-error' });
  expect(cm).not.toHaveBeenCalled();
  expect((await usageToday(db, user.id, now())).recipes).toBe(0);
});

test('English never calls the translator', async () => {
  const callTranslate = createFakeTranslator();
  await requestRecipe(db, user, ['banana'], { callModel: model(raw()), callTranslate, now });
  await requestRecipe(db, user, ['banana'], { callModel: model(raw('Banana pudding')), callTranslate, now, language: 'en' });
  expect(callTranslate).not.toHaveBeenCalled();
});

test("suggestions use the given baby's age", async () => {
  const older = await babyFor(user, '2026-02-14');
  const younger = await babyFor(user, '2026-07-14');
  const cm = model(raw());
  await requestRecipe(db, user, ['banana'], { callModel: cm, now }, older);
  expect(cm.mock.calls[0][0].ageMonths).toBe(8);
  await expect(requestRecipe(db, user, ['banana'], { callModel: cm, now }, younger)).rejects.toMatchObject({ code: 'too-young' });
  expect(cm).toHaveBeenCalledTimes(1);
});

test('a recipe shown to one baby can be suggested to the other', async () => {
  const sibling = await babyFor(user);
  await catalogue('Banana mash', ['banana', 100]);
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now }, baby)).title).toBe('Banana mash');
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now }, sibling)).title).toBe('Banana mash');
  expect(cm).not.toHaveBeenCalled();
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now }, baby)).title).toBe('Other');
  expect(await excludeTitles(db, baby.id)).toEqual(['Banana mash', 'Other']);
  expect(await excludeTitles(db, sibling.id)).toEqual(['Banana mash']);
});
