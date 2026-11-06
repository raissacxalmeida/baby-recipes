import { test, expect } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { migrate } from '../src/server/migrate.js';
import type { BabyRow, UserRow } from '../src/server/types.js';

test('migration 7 gives each user with a birthdate or saved data one baby and remembers it', async () => {
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
  await db.close();
});
