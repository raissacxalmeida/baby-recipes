import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());
beforeEach(() => db.reset());

const addTitle = (language, title = 'Banana mash') => db.query(
  'insert into title_translations (title, language, translated) values ($1, $2, $3) on conflict do nothing',
  [title, language, 'Papa de banana'],
);

test('a title translation is stored once per title and language', async () => {
  await addTitle('pt');
  await addTitle('pt');
  const { rows } = await db.query('select translated from title_translations');
  expect(rows).toEqual([{ translated: 'Papa de banana' }]);
});

test.each(['pt', 'es', 'de'])('title translations accept %s', async (language) => {
  await addTitle(language);
  expect((await db.query('select 1 from title_translations')).rows).toHaveLength(1);
});

test.each(['en', 'fr'])('title translations refuse %s', async (language) => {
  await expect(addTitle(language)).rejects.toThrow();
});

test('recipe translations store and return the translated text', async () => {
  const data = { title: 'Papa', ingredients: ['banana'], steps: ['Amasse.'] };
  await db.query('insert into recipe_translations (recipe_hash, language, data) values ($1, $2, $3)', ['abc', 'pt', JSON.stringify(data)]);
  const { rows } = await db.query('select data from recipe_translations where recipe_hash = $1 and language = $2', ['abc', 'pt']);
  expect(rows[0].data).toEqual(data);
});

test.each(['en', 'fr'])('recipe translations refuse %s', async (language) => {
  await expect(
    db.query('insert into recipe_translations (recipe_hash, language, data) values ($1, $2, $3)', ['abc', language, '{}']),
  ).rejects.toThrow();
});

test('reset empties both translation tables', async () => {
  await addTitle('pt');
  await db.query('insert into recipe_translations (recipe_hash, language, data) values ($1, $2, $3)', ['abc', 'pt', '{}']);
  await db.reset();
  expect((await db.query('select 1 from title_translations')).rows).toHaveLength(0);
  expect((await db.query('select 1 from recipe_translations')).rows).toHaveLength(0);
});
