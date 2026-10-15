import { test, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { migrate } from '../src/server/migrate.js';
import { MIGRATIONS } from '../src/server/migrations.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const addUser = async (email = 'a@example.com') =>
  (await db.query('insert into users (email, password_hash) values ($1, $2) returning id', [email, 'h'])).rows[0].id;

test('migrate twice is safe and records each migration once', async () => {
  await migrate(db);
  await migrate(db);
  const { rows } = await db.query('select version from schema_migrations');
  expect(rows).toHaveLength(MIGRATIONS.length);
});

test('deleting a user cascades to their recipes', async () => {
  await db.reset();
  const id = await addUser();
  await db.query("insert into recipes (user_id, id, data, status) values ($1, 'r1', '{}', 'liked')", [id]);
  await db.query('delete from users where id = $1', [id]);
  expect((await db.query('select * from recipes')).rows).toHaveLength(0);
});

test('a transaction rolls back when the callback throws', async () => {
  await db.reset();
  await expect(db.transaction(async (tx) => {
    await tx.query("insert into users (email, password_hash) values ('t@example.com', 'h')");
    throw new Error('boom');
  })).rejects.toThrow('boom');
  expect((await db.query('select * from users')).rows).toHaveLength(0);
});

test('reset empties the tables', async () => {
  await addUser('b@example.com');
  await db.reset();
  expect((await db.query('select * from users')).rows).toHaveLength(0);
});

test('the atomic usage upsert stops at the limit', async () => {
  await db.reset();
  const id = await addUser();
  const sql = `insert into usage (user_id, day, recipes) values ($1, '2026-10-15', 1)
    on conflict (user_id, day) do update set recipes = usage.recipes + 1 where usage.recipes < $2
    returning recipes`;
  const results = [];
  for (let i = 0; i < 11; i++) results.push((await db.query(sql, [id, 10])).rows.length);
  expect(results.slice(0, 10).every((n) => n === 1)).toBe(true);
  expect(results[10]).toBe(0);
});
