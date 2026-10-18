import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { saveToCatalogue, findSuitable, overlappingTitles } from '../src/server/catalogue.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());
beforeEach(() => db.reset());

// rec(title, [name, grams]..., { overrides }?)
const rec = (title, ...rest) => {
  const over = rest.length && !Array.isArray(rest[rest.length - 1]) ? rest.pop() : {};
  return {
    title, basePortions: 2, ingredients: rest.map(([name, grams]) => ({ name, grams })),
    steps: ['Mash it.'], texture: 'mashed', allergens: [], ...over,
  };
};
const save = (recipe, ageFromMonths = 6) => saveToCatalogue(db, recipe, { ageFromMonths, source: 'ai' });

test('a repeated title is not saved twice and returns false', async () => {
  expect(await save(rec('Banana mash', ['banana', 100]))).toBe(true);
  expect(await save(rec(' banana  MASH', ['pear', 100]))).toBe(false);
  expect((await db.query('select count(*)::int as n from catalogue_recipes')).rows[0].n).toBe(1);
});

test('inList and id are not stored', async () => {
  const recipe = { ...rec('Banana mash'), id: 'x', ingredients: [{ name: 'banana', grams: 100, inList: true }] };
  await save(recipe);
  const { data } = (await db.query('select data from catalogue_recipes')).rows[0];
  expect(data.id).toBeUndefined();
  expect(data.ingredients[0]).toEqual({ name: 'banana', grams: 100 });
});

test('findSuitable respects the baby age', async () => {
  await save(rec('Banana mash', ['banana', 100]), 9);
  expect(await findSuitable(db, { ageMonths: 8, ingredients: ['banana'], seen: [] })).toBeNull();
  expect((await findSuitable(db, { ageMonths: 9, ingredients: ['banana'], seen: [] })).title).toBe('Banana mash');
});

test('findSuitable skips seen titles whatever their case or spacing', async () => {
  await save(rec('Banana mash', ['banana', 100]));
  expect(await findSuitable(db, { ageMonths: 8, ingredients: ['banana'], seen: ['BANANA  mash'] })).toBeNull();
});

test('findSuitable prefers more ingredients used, then fewer missing, then title', async () => {
  await save(rec('B plain', ['banana', 100]));
  await save(rec('A plain', ['banana', 100]));
  await save(rec('Banana and pear', ['banana', 100], ['pear', 100]));
  await save(rec('Banana with onion', ['banana', 100], ['onion', 9]));
  const args = { ageMonths: 8, ingredients: ['banana', 'pear'], seen: [] };
  const order = [];
  for (let t = await findSuitable(db, args); t; t = await findSuitable(db, args)) { order.push(t.title); args.seen.push(t.title); }
  expect(order).toEqual(['Banana and pear', 'A plain', 'B plain', 'Banana with onion']);
});

test('a stored row that fails the safety check is skipped', async () => {
  await save(rec('Banana mash', ['banana', 100]));
  await db.query(`update catalogue_recipes set data = jsonb_set(data, '{steps}', '["Stir in honey."]')`);
  expect(await findSuitable(db, { ageMonths: 8, ingredients: ['banana'], seen: [] })).toBeNull();
});

test('a texture not allowed at the age is skipped', async () => {
  await save(rec('Banana puree', ['banana', 100], { texture: 'puree' }));
  expect(await findSuitable(db, { ageMonths: 10, ingredients: ['banana'], seen: [] })).toBeNull();
  expect((await findSuitable(db, { ageMonths: 12, ingredients: ['banana'], seen: [] })).title).toBe('Banana puree');
});

test('overlappingTitles lists titles sharing an ingredient, most shared first, capped by limit', async () => {
  await save(rec('Both', ['banana', 100], ['pear', 100]));
  await save(rec('One', ['banana', 100], ['oat', 100]));
  await save(rec('None', ['carrot', 100]));
  expect(await overlappingTitles(db, { ingredients: ['banana', 'pear'] })).toEqual(['Both', 'One']);
  expect(await overlappingTitles(db, { ingredients: ['banana', 'pear'], limit: 1 })).toEqual(['Both']);
});
