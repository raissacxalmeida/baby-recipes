import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './helpers/db.js';
import { addTestBaby } from './helpers/babies.js';
import { createInvite, acceptInvite } from '../src/server/users.js';
import {
  MAX_BABIES, MAX_NAME, addBaby, getLastBabyId, listBabies, removeBaby, requireBaby, setLastBaby, updateBaby,
} from '../src/server/babies.js';
import { addShown, excludeTitles, getState, like, dislike } from '../src/server/userData.js';
import { shareRecipe, listShared, likeShared } from '../src/server/sharedRecipes.js';

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

const recipe = (title: string) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2, ingredients: [{ name: 'banana', grams: 100, inList: true }],
  steps: ['Mash it.'], texture: 'mashed', allergens: [],
});
const banana = recipe('Banana mash');
const sharedId = async (viewer: string, title: string): Promise<string> => {
  const found = (await listShared(db, viewer)).find((r) => (r.recipe as { title: string }).title === title);
  if (!found) throw new Error(`no shared recipe ${title}`);
  return found.id;
};
const countRows = async (table: string, babyId: string): Promise<number> =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where baby_id = $1`, [babyId])).rows[0].n;

test('the last baby cannot be removed: code conflict, key err.babyLast', async () => {
  const only = await addTestBaby(db, a);
  await expect(removeBaby(db, a, only)).rejects.toMatchObject({ code: 'conflict', key: 'err.babyLast' });
  expect(await listBabies(db, a)).toHaveLength(1);
});

test("removing a baby deletes their recipes and shown titles and leaves the other baby's untouched", async () => {
  const mia = await addTestBaby(db, a);
  const leo = await addTestBaby(db, a, '2025-12-01', 'Leo');
  for (const id of [mia, leo]) {
    await like(db, id, banana);
    await dislike(db, a, id, recipe('Pear mash'));
    await addShown(db, id, 'Oat porridge', now);
  }
  await removeBaby(db, a, mia);
  expect((await listBabies(db, a)).map((x) => x.id)).toEqual([leo]);
  expect(await countRows('recipes', mia)).toBe(0);
  expect(await countRows('shown', mia)).toBe(0);
  expect((await getState(db, a, await requireBaby(db, a, leo))).liked).toHaveLength(1);
  expect(await excludeTitles(db, leo)).toEqual(['Banana mash', 'Oat porridge', 'Pear mash']);
});

test("their shared recipe that nobody else liked is deleted; one another parent liked stays in the community list with the owner's mine: true", async () => {
  const mia = await addTestBaby(db, a);
  await addTestBaby(db, a, '2025-12-01', 'Leo');
  const theirs = await addTestBaby(db, b);
  for (const r of [banana, recipe('Pear mash')]) {
    await like(db, mia, r);
    await shareRecipe(db, a, mia, r.id, now);
  }
  await likeShared(db, b, theirs, await sharedId(b, 'Pear mash'));
  await removeBaby(db, a, mia);
  const list = await listShared(db, a);
  expect(list.map((r) => [(r.recipe as { title: string }).title, r.mine, r.likes])).toEqual([['Pear mash', true, 1]]);
  const { rows } = await db.query<{ baby_id: string | null }>('select baby_id from shared_recipes');
  expect(rows).toEqual([{ baby_id: null }]);
  expect((await listShared(db, b))[0]).toMatchObject({ mine: false, liked: true });
});

test("Community likes behind the baby's copies are taken back, so listShared shows liked: false and the like count drops; the like stays when a sibling baby still holds a copy", async () => {
  const sharer = await addTestBaby(db, b);
  for (const r of [banana, recipe('Pear mash')]) {
    await like(db, sharer, r);
    await shareRecipe(db, b, sharer, r.id, now);
  }
  const mia = await addTestBaby(db, a);
  const leo = await addTestBaby(db, a, '2025-12-01', 'Leo');
  await likeShared(db, a, mia, await sharedId(a, 'Banana mash'));
  await likeShared(db, a, mia, await sharedId(a, 'Pear mash'));
  await likeShared(db, a, leo, await sharedId(a, 'Pear mash'));
  await removeBaby(db, a, mia);
  const byTitle = Object.fromEntries((await listShared(db, a)).map((r) => [(r.recipe as { title: string }).title, r]));
  expect(byTitle['Banana mash']).toMatchObject({ liked: false, likes: 0 });
  expect(byTitle['Pear mash']).toMatchObject({ liked: true, likes: 1 });
});

test('a copy another parent saved from this baby\'s shared recipe is unaffected', async () => {
  const mia = await addTestBaby(db, a);
  await addTestBaby(db, a, '2025-12-01', 'Leo');
  const theirs = await addTestBaby(db, b);
  await like(db, mia, banana);
  await shareRecipe(db, a, mia, banana.id, now);
  await likeShared(db, b, theirs, await sharedId(b, 'Banana mash'));
  await removeBaby(db, a, mia);
  expect((await getState(db, b, await requireBaby(db, b, theirs))).copiedIds).toEqual([banana.id]);
});

test('last_baby_id becomes null when the last-used baby is removed', async () => {
  const mia = await addTestBaby(db, a);
  const leo = await addTestBaby(db, a, '2025-12-01', 'Leo');
  await setLastBaby(db, a, mia);
  await removeBaby(db, a, leo);
  expect(await getLastBabyId(db, a)).toBe(mia);
  await addTestBaby(db, a);
  await removeBaby(db, a, mia);
  expect(await getLastBabyId(db, a)).toBeNull();
});

test("another account's baby id is not-found err.babyMissing", async () => {
  await addTestBaby(db, a);
  const theirs = await addTestBaby(db, b);
  await addTestBaby(db, b);
  await expect(removeBaby(db, a, theirs)).rejects.toMatchObject({ code: 'not-found', key: 'err.babyMissing' });
  await expect(removeBaby(db, a, 'not-a-uuid')).rejects.toMatchObject({ code: 'not-found', key: 'err.babyMissing' });
  expect(await listBabies(db, b)).toHaveLength(2);
});
