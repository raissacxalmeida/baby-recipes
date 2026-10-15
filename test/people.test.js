import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import {
  createInvite, acceptInvite, createAdmin, createReset, getReset, useReset, listPeople, removeUser,
} from '../src/server/users.js';
import { login, sessionUser } from '../src/server/sessions.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
const hours = (n) => new Date(now.getTime() + n * 3600000);
const PASSWORD = 'a long enough password';
const NEW_PASSWORD = 'another long password';
let admin;
let ana;

async function signUp(email) {
  const { token } = await createInvite(db, email, now);
  return acceptInvite(db, { token, password: PASSWORD }, now);
}

beforeEach(async () => {
  await db.reset();
  const { token } = await createAdmin(db, 'me@example.com', now);
  admin = await acceptInvite(db, { token, password: PASSWORD }, now);
  ana = await signUp('ana@example.com');
});

test('a reset changes the password and ends existing sessions', async () => {
  const { token: session } = await login(db, { email: 'ana@example.com', password: PASSWORD }, now);
  const { token } = await createReset(db, ana.id, now);
  expect(await getReset(db, token, now)).toEqual({ email: 'ana@example.com' });
  await useReset(db, { token, password: NEW_PASSWORD }, now);
  expect(await sessionUser(db, session, now)).toBeNull();
  await expect(login(db, { email: 'ana@example.com', password: PASSWORD }, now)).rejects.toMatchObject({ code: 'unauthorized' });
  expect((await login(db, { email: 'ana@example.com', password: NEW_PASSWORD }, now)).user.email).toBe('ana@example.com');
});

test('a reset link works once, expires after 24 hours and needs a long password', async () => {
  const { token } = await createReset(db, ana.id, now);
  await expect(useReset(db, { token, password: 'short' }, now)).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(getReset(db, token, hours(25))).rejects.toMatchObject({ code: 'not-found' });
  await useReset(db, { token, password: NEW_PASSWORD }, now);
  await expect(useReset(db, { token, password: NEW_PASSWORD }, now)).rejects.toMatchObject({ code: 'not-found' });
  await expect(getReset(db, 'garbage', now)).rejects.toMatchObject({ code: 'not-found' });
});

test('a new reset replaces the previous one', async () => {
  const first = await createReset(db, ana.id, now);
  const second = await createReset(db, ana.id, now);
  await expect(getReset(db, first.token, now)).rejects.toMatchObject({ code: 'not-found' });
  expect(await getReset(db, second.token, now)).toEqual({ email: 'ana@example.com' });
  await expect(createReset(db, '00000000-0000-0000-0000-000000000000', now)).rejects.toMatchObject({ code: 'not-found' });
});

test('completing a reset clears a login lockout', async () => {
  for (let i = 0; i < 10; i++) await login(db, { email: 'ana@example.com', password: 'wrong password!!' }, now).catch(() => {});
  const { token } = await createReset(db, ana.id, now);
  await useReset(db, { token, password: NEW_PASSWORD }, now);
  expect((await login(db, { email: 'ana@example.com', password: NEW_PASSWORD }, now)).user.email).toBe('ana@example.com');
});

test('listPeople shows requests today and hides the figure for the admin', async () => {
  await db.query("insert into usage (user_id, day, recipes) values ($1, '2026-10-15', 3)", [ana.id]);
  const people = await listPeople(db, now);
  const row = (email) => people.find((p) => p.email === email);
  expect(row('ana@example.com')).toMatchObject({ isAdmin: false, recipesToday: 3 });
  expect(row('me@example.com')).toMatchObject({ isAdmin: true, recipesToday: null });
  expect(JSON.stringify(people)).not.toMatch(/hash|password|token/i);
});

test('removing a person deletes everything they had', async () => {
  const { token: session } = await login(db, { email: 'ana@example.com', password: PASSWORD }, now);
  await db.query("insert into recipes (user_id, id, data, status) values ($1, 'r1', '{}', 'liked')", [ana.id]);
  const reset = await createReset(db, ana.id, now);
  await removeUser(db, ana.id);
  expect(await sessionUser(db, session, now)).toBeNull();
  await expect(getReset(db, reset.token, now)).rejects.toMatchObject({ code: 'not-found' });
  expect((await db.query('select * from recipes')).rows).toHaveLength(0);
});

test('a removed email can be invited again as a clean account', async () => {
  await db.query("insert into recipes (user_id, id, data, status) values ($1, 'r1', '{}', 'liked')", [ana.id]);
  await removeUser(db, ana.id);
  const again = await signUp('ana@example.com');
  expect(again.id).not.toBe(ana.id);
  expect((await db.query('select * from recipes where user_id = $1', [again.id])).rows).toHaveLength(0);
});

test('removing also drops a pending invite for that email', async () => {
  await removeUser(db, ana.id);
  await createInvite(db, 'ana@example.com', now);
  const stale = await db.query("select count(*)::int as n from invites where email = 'ana@example.com'");
  expect(stale.rows[0].n).toBe(1);
});

test('the admin cannot be removed and unknown ids are not-found', async () => {
  await expect(removeUser(db, admin.id)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(removeUser(db, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'not-found' });
  await expect(removeUser(db, 'not-a-uuid')).rejects.toMatchObject({ code: 'not-found' });
});

test('createAdmin with the admin email returns a working reset', async () => {
  const { kind, token } = await createAdmin(db, 'ME@example.com', now);
  expect(kind).toBe('reset');
  await useReset(db, { token, password: NEW_PASSWORD }, now);
  expect((await login(db, { email: 'me@example.com', password: NEW_PASSWORD }, now)).user.isAdmin).toBe(true);
  await expect(createAdmin(db, 'other@example.com', now)).rejects.toMatchObject({ code: 'conflict' });
});
