import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { loadSeed, seedCatalogue } from '../src/server/seedCatalogue.js';
import { saveToCatalogue, findSuitable } from '../src/server/catalogue.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());
beforeEach(() => db.reset());

const rec = (title, ...pairs) => ({
  title, basePortions: 2, ingredients: pairs.map(([name, grams]) => ({ name, grams })),
  steps: ['Mash it.'], texture: 'mashed', allergens: [],
});

test('loads all 49 cookbook recipes', async () => {
  expect(await seedCatalogue(db)).toEqual({ added: 49, skipped: 0, rejected: [] });
});

test('running it again adds nothing', async () => {
  await seedCatalogue(db);
  expect(await seedCatalogue(db)).toEqual({ added: 0, skipped: 49, rejected: [] });
});

test('it never overwrites a recipe saved from OpenAI with the same title', async () => {
  await saveToCatalogue(db, rec('Sweet Potato Purée', ['sweet potato', 300]), { ageFromMonths: 6, source: 'ai' });
  expect((await seedCatalogue(db)).added).toBe(48);
  const { rows } = await db.query("select data from catalogue_recipes where title_key = 'sweet potato purée'");
  expect(rows[0].data.ingredients[0].grams).toBe(300);
});

test('a seed recipe that fails the safety check is rejected', async () => {
  const bad = { ...loadSeed()[0], steps: ['Add salt.'] };
  expect(await seedCatalogue(db, [bad])).toEqual({ added: 0, skipped: 0, rejected: [bad.sourceId] });
  expect((await db.query('select count(*)::int as n from catalogue_recipes')).rows[0].n).toBe(0);
});

test('a seed recipe with an invalid shape is rejected', async () => {
  const bad = { ...loadSeed()[0], ingredients: [] };
  expect((await seedCatalogue(db, [bad])).rejected).toEqual([bad.sourceId]);
});

// Every recipe the catalogue would hand out for these ingredients, one after another.
async function allSuitable(ingredients, ageMonths) {
  const seen = [];
  const out = [];
  for (let r = await findSuitable(db, { ageMonths, ingredients, seen }); r; r = await findSuitable(db, { ageMonths, ingredients, seen })) {
    out.push(r);
    seen.push(r.title);
  }
  return out;
}

const PINS = [
  [['carrot', 'potato'], 6, ['Carrot and Potato Purée'], ['Sweet Potato Purée']],
  [['carrot'], 6, [], ['Carrot and Potato Purée']],
  [['sweet potato'], 7, ['Sweet Potato Purée'], []],
  [['salmon', 'zucchini', 'potato', 'tomato'], 6, ['Zucchini and Salmon Purée'], []],
  [['salmon', 'zucchini'], 6, [], ['Zucchini and Salmon Purée']],
  [['potato', 'carrot', 'beef', 'apple juice'], 6, ['Vegetable, Potato and Beef Purée'], ['Squash, Potato and Beef Purée']],
  [['apple', 'banana', 'pear', 'dried fig'], 8, ['Cooked Fruit Mix'], []],
];

test.each(PINS)('seeded lookup for %j at %i months', async (ingredients, ageMonths, include, exclude) => {
  await seedCatalogue(db);
  const titles = (await allSuitable(ingredients, ageMonths)).map((r) => r.title);
  for (const t of include) expect(titles).toContain(t);
  for (const t of exclude) expect(titles).not.toContain(t);
  const ageOf = Object.fromEntries(loadSeed().map((s) => [s.title, s.ageFromMonths]));
  for (const t of titles) expect(ageOf[t]).toBeLessThanOrEqual(ageMonths);
});

test('no finger-food recipe is served below 12 months', async () => {
  await seedCatalogue(db);
  const found = await allSuitable(['carrot', 'potato', 'zucchini', 'egg', 'peas', 'polenta', 'oat drink'], 10);
  expect(found.length).toBeGreaterThan(0);
  expect(found.some((r) => r.texture === 'finger-food')).toBe(false);
  const at12 = await allSuitable(['carrot', 'potato', 'zucchini', 'egg', 'peas', 'polenta', 'oat drink'], 12);
  expect(at12.some((r) => r.texture === 'finger-food')).toBe(true);
});

test('no recipe has an age below 6 months', () => {
  expect(loadSeed().every((s) => s.ageFromMonths >= 6)).toBe(true);
});
