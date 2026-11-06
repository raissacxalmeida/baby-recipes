import { test, expect } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { migrate } from '../src/server/migrate.js';
import type { BabyRow, RecipeRow, ShownRow, UserRow } from '../src/server/types.js';

test('migrations 7, 8 and 9 give each user with a birthdate or saved data one baby, remember it and move the data onto it', async () => {
  const db = await createTestDb({ upTo: 6 });
  const ids: string[] = [];
  for (const [email, birthdate] of [['one@example.com', '2026-02-14'], ['two@example.com', null], ['three@example.com', null]]) {
    const { rows } = await db.query<Pick<UserRow, 'id'>>(
      "insert into users (email, password_hash, birthdate) values ($1, 'x', $2) returning id", [email, birthdate],
    );
    ids.push(rows[0].id);
  }
  const recipe = (id: string) => JSON.stringify({ id, title: id });
  await db.query("insert into recipes (user_id, id, data, status) values ($1, 'a', $2, 'liked'), ($1, 'b', $3, 'disliked')", [ids[0], recipe('a'), recipe('b')]);
  await db.query("insert into shown (user_id, title) values ($1, 'Banana mash')", [ids[0]]);
  await db.query("insert into shared_recipes (user_id, recipe_id, data, grp, baby_months) values ($1, 'a', $2, 'Fruit', 8)", [ids[0], recipe('a')]);
  await db.query("insert into recipes (user_id, id, data, status) values ($1, 'c', $2, 'liked')", [ids[2], recipe('c')]);

  await migrate(db);

  const babies = await db.query<Pick<BabyRow, 'id' | 'user_id' | 'name'> & { birthdate: string | null }>(
    "select id, user_id, name, to_char(birthdate, 'YYYY-MM-DD') as birthdate from babies order by user_id",
  );
  expect(babies.rows).toHaveLength(2);
  const byUser = new Map(babies.rows.map((b) => [b.user_id, b]));
  expect(byUser.has(ids[1])).toBe(false);
  expect(byUser.get(ids[0])).toMatchObject({ name: null, birthdate: '2026-02-14' });
  expect(byUser.get(ids[2])).toMatchObject({ name: null, birthdate: null });

  const users = await db.query<Pick<UserRow, 'id' | 'last_baby_id'>>('select id, last_baby_id from users');
  const last = new Map(users.rows.map((u) => [u.id, u.last_baby_id]));
  expect(last.get(ids[0])).toBe(byUser.get(ids[0])?.id);
  expect(last.get(ids[1])).toBeNull();
  expect(last.get(ids[2])).toBe(byUser.get(ids[2])?.id);

  // Migration 8: the saved recipes and shown titles move onto that baby untouched.
  const recipes = await db.query<Pick<RecipeRow, 'baby_id' | 'id' | 'data' | 'status'>>('select baby_id, id, data, status from recipes order by id');
  expect(recipes.rows).toEqual([
    { baby_id: byUser.get(ids[0])?.id, id: 'a', data: { id: 'a', title: 'a' }, status: 'liked' },
    { baby_id: byUser.get(ids[0])?.id, id: 'b', data: { id: 'b', title: 'b' }, status: 'disliked' },
    { baby_id: byUser.get(ids[2])?.id, id: 'c', data: { id: 'c', title: 'c' }, status: 'liked' },
  ]);
  const shown = await db.query<Pick<ShownRow, 'baby_id' | 'title'>>('select baby_id, title from shown');
  expect(shown.rows).toEqual([{ baby_id: byUser.get(ids[0])?.id, title: 'Banana mash' }]);
  // Migration 9: the shared recipe records the baby its owner now has.
  const shared = await db.query<{ user_id: string; baby_id: string | null }>('select user_id, baby_id from shared_recipes');
  expect(shared.rows).toEqual([{ user_id: ids[0], baby_id: byUser.get(ids[0])?.id }]);
  const columns = await db.query<{ table_name: string; column_name: string }>(
    "select table_name, column_name from information_schema.columns where table_name in ('users', 'recipes', 'shown') and column_name in ('birthdate', 'user_id')",
  );
  expect(columns.rows).toEqual([]);

  // The same recipe id can now be saved for two babies.
  const second = (await db.query<Pick<BabyRow, 'id'>>("insert into babies (user_id, name) values ($1, 'Leo') returning id", [ids[0]])).rows[0].id;
  await db.query("insert into recipes (baby_id, id, data, status) values ($1, 'a', $2, 'disliked')", [second, recipe('a')]);
  const both = await db.query<Pick<RecipeRow, 'baby_id' | 'status'>>("select baby_id, status from recipes where id = 'a' order by status");
  expect(both.rows).toEqual([{ baby_id: second, status: 'disliked' }, { baby_id: byUser.get(ids[0])?.id, status: 'liked' }]);
  await db.close();
});

// Migration 8 drops recipes.user_id and shown.user_id, which drops their old primary keys; it then adds new ones.
test('after the migrations recipes are keyed on exactly (baby_id, id) and shown on (baby_id, title)', async () => {
  const db = await createTestDb();
  const keys = await db.query<{ table_name: string; column_name: string; position: number }>(`
    select tc.table_name, kcu.column_name, kcu.ordinal_position as position
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema and kcu.table_name = tc.table_name
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_name in ('recipes', 'shown')
    order by tc.table_name, kcu.ordinal_position`);
  expect(keys.rows).toEqual([
    { table_name: 'recipes', column_name: 'baby_id', position: 1 },
    { table_name: 'recipes', column_name: 'id', position: 2 },
    { table_name: 'shown', column_name: 'baby_id', position: 1 },
    { table_name: 'shown', column_name: 'title', position: 2 },
  ]);
  const user = (await db.query<Pick<UserRow, 'id'>>("insert into users (email, password_hash) values ('a@example.com', 'x') returning id")).rows[0].id;
  const baby = (await db.query<Pick<BabyRow, 'id'>>("insert into babies (user_id, name) values ($1, 'Mia') returning id", [user])).rows[0].id;
  const data = JSON.stringify({ id: 'a', title: 'a' });
  await db.query("insert into recipes (baby_id, id, data, status) values ($1, 'a', $2, 'liked')", [baby, data]);
  await expect(db.query("insert into recipes (baby_id, id, data, status) values ($1, 'a', $2, 'disliked')", [baby, data]))
    .rejects.toThrow(/duplicate key|unique/i);
  await db.query("insert into shown (baby_id, title) values ($1, 'Banana mash')", [baby]);
  await expect(db.query("insert into shown (baby_id, title) values ($1, 'Banana mash')", [baby])).rejects.toThrow(/duplicate key|unique/i);
  await db.close();
});
