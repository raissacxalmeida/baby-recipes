import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './helpers/db.js';
import { addTestBaby } from './helpers/babies.js';
import { createInvite, acceptInvite } from '../src/server/users.js';
import {
  MAX_BABIES, MAX_NAME, addBaby, getLastBabyId, listBabies, requireBaby, setLastBaby, updateBaby,
} from '../src/server/babies.js';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
let a: string;
let b: string;

beforeEach(async () => {
  await db.reset();
  for (const email of ['a@example.com', 'b@example.com']) {
    const { token } = await createInvite(db, email, now);
    const user = await acceptInvite(db, { token, password: 'a long enough password' }, now);
    if (email.startsWith('a')) a = user.id; else b = user.id;
  }
});

test('adds a baby with a trimmed name and lists babies oldest first', async () => {
  expect(await listBabies(db, a)).toEqual([]);
  const first = await addBaby(db, a, { name: '  Mia  ', birthdate: '2026-02-14' }, now);
  const second = await addBaby(db, a, { name: 'Leo', birthdate: '2025-12-01' }, now);
  expect(first).toEqual({ id: expect.any(String), name: 'Mia', birthdate: '2026-02-14' });
  expect(await listBabies(db, a)).toEqual([first, second]);
  expect(await listBabies(db, b)).toEqual([]);
});

test('rejects an empty, blank or 31-character name with err.babyName; accepts exactly 30; allows two babies with the same name', async () => {
  for (const name of ['', '   ', 'x'.repeat(MAX_NAME + 1), undefined, 7]) {
    await expect(addBaby(db, a, { name, birthdate: '2026-02-14' }, now)).rejects.toMatchObject({
      code: 'invalid-input', key: 'err.babyName', params: { max: 30 },
    });
  }
  const long = await addBaby(db, a, { name: 'x'.repeat(MAX_NAME), birthdate: '2026-02-14' }, now);
  expect(long.name).toBe('x'.repeat(30));
  await addBaby(db, a, { name: 'Mia', birthdate: '2026-02-14' }, now);
  await addBaby(db, a, { name: 'Mia', birthdate: '2026-02-14' }, now);
  expect(await listBabies(db, a)).toHaveLength(3);
});

test("rejects 'banana' with err.birthdayFormat and a future date with err.birthdayFuture", async () => {
  await expect(addBaby(db, a, { name: 'Mia', birthdate: 'banana' }, now)).rejects.toMatchObject({ code: 'invalid-input', key: 'err.birthdayFormat' });
  await expect(addBaby(db, a, { name: 'Mia', birthdate: '2999-01-01' }, now)).rejects.toMatchObject({ code: 'invalid-input', key: 'err.birthdayFuture' });
  expect(await listBabies(db, a)).toEqual([]);
});

test('refuses a sixth baby with code conflict, key err.babyLimit, params { max: 5 }', async () => {
  for (let i = 0; i < MAX_BABIES; i++) await addTestBaby(db, a, '2026-02-14', `Baby ${i}`);
  await expect(addBaby(db, a, { name: 'Extra', birthdate: '2026-02-14' }, now)).rejects.toMatchObject({
    code: 'conflict', key: 'err.babyLimit', params: { max: 5 },
  });
  await addTestBaby(db, b);
  expect(await listBabies(db, a)).toHaveLength(5);
});

test("updateBaby changes name and birthdate, completes a baby whose name is null, and refuses another user's baby with err.babyMissing", async () => {
  const id = await addTestBaby(db, a);
  await updateBaby(db, a, id, { name: ' Lia ', birthdate: '2026-01-02' }, now);
  expect(await listBabies(db, a)).toEqual([{ id, name: 'Lia', birthdate: '2026-01-02' }]);

  const { rows } = await db.query<{ id: string }>('insert into babies (user_id) values ($1) returning id', [a]);
  expect(await requireBaby(db, a, rows[0].id)).toEqual({ id: rows[0].id, name: null, birthdate: null });
  await updateBaby(db, a, rows[0].id, { name: 'Noa', birthdate: '2026-03-03' }, now);
  expect(await requireBaby(db, a, rows[0].id)).toEqual({ id: rows[0].id, name: 'Noa', birthdate: '2026-03-03' });

  await expect(updateBaby(db, b, id, { name: 'Hacked', birthdate: '2026-01-02' }, now)).rejects.toMatchObject({ code: 'not-found', key: 'err.babyMissing' });
  await expect(updateBaby(db, a, id, { name: '', birthdate: '2026-01-02' }, now)).rejects.toMatchObject({ key: 'err.babyName' });
  await expect(updateBaby(db, a, id, { name: 'Lia', birthdate: 'banana' }, now)).rejects.toMatchObject({ key: 'err.birthdayFormat' });
  expect((await requireBaby(db, a, id)).name).toBe('Lia');
});

test('requireBaby: undefined gives invalid-input err.babyRequired; a random uuid, a non-uuid string and another user\'s baby give not-found err.babyMissing', async () => {
  const id = await addTestBaby(db, a);
  expect(await requireBaby(db, a, id)).toEqual({ id, name: 'Mia', birthdate: '2026-02-14' });
  await expect(requireBaby(db, a, undefined)).rejects.toMatchObject({ code: 'invalid-input', key: 'err.babyRequired' });
  for (const missing of ['6f1c1d3e-0b1a-4c55-9a53-1f2b3c4d5e6f', 'not-a-uuid', 42]) {
    await expect(requireBaby(db, a, missing)).rejects.toMatchObject({ code: 'not-found', key: 'err.babyMissing' });
  }
  await expect(requireBaby(db, b, id)).rejects.toMatchObject({ code: 'not-found', key: 'err.babyMissing' });
});

test("setLastBaby remembers a baby, refuses another user's baby, and getLastBabyId is null once that baby row is deleted", async () => {
  expect(await getLastBabyId(db, a)).toBeNull();
  const id = await addTestBaby(db, a);
  const other = await addTestBaby(db, b);
  await setLastBaby(db, a, id);
  expect(await getLastBabyId(db, a)).toBe(id);
  await expect(setLastBaby(db, a, other)).rejects.toMatchObject({ code: 'not-found', key: 'err.babyMissing' });
  expect(await getLastBabyId(db, a)).toBe(id);
  await db.query('delete from babies where id = $1', [id]);
  expect(await getLastBabyId(db, a)).toBeNull();
});
