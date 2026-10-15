import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { createInvite, acceptInvite } from '../src/server/users.js';
import { login, sessionUser, logout } from '../src/server/sessions.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

const now = new Date('2026-10-15T12:00:00Z');
const minutes = (n) => new Date(now.getTime() + n * 60000);
const days = (n) => new Date(now.getTime() + n * 86400000);
const PASSWORD = 'a long enough password';

beforeEach(async () => {
  await db.reset();
  const { token } = await createInvite(db, 'ana@example.com', now);
  await acceptInvite(db, { token, password: PASSWORD }, now);
});

const fail = (email = 'ana@example.com', at = now) =>
  login(db, { email, password: 'wrong password!!' }, at).catch((e) => e);

test('a good login gives a token that resolves to the user', async () => {
  const { token, user } = await login(db, { email: 'ana@example.com', password: PASSWORD }, now);
  expect(user).toMatchObject({ email: 'ana@example.com', isAdmin: false });
  expect(await sessionUser(db, token, now)).toMatchObject({ email: 'ana@example.com' });
});

test('email case does not matter', async () => {
  const { user } = await login(db, { email: ' ANA@example.com ', password: PASSWORD }, now);
  expect(user.email).toBe('ana@example.com');
});

test('wrong password and unknown email give the same error', async () => {
  const wrong = await fail('ana@example.com');
  const unknown = await fail('nobody@example.com');
  expect(wrong).toMatchObject({ code: 'unauthorized' });
  expect(unknown).toMatchObject({ code: 'unauthorized', message: wrong.message });
});

test('10 failures lock the email, even for the right password, for 15 minutes', async () => {
  for (let i = 0; i < 10; i++) expect(await fail()).toMatchObject({ code: 'unauthorized' });
  await expect(login(db, { email: 'ana@example.com', password: PASSWORD }, minutes(1))).rejects.toMatchObject({ code: 'locked' });
  const ok = await login(db, { email: 'ana@example.com', password: PASSWORD }, minutes(16));
  expect(ok.user.email).toBe('ana@example.com');
});

test('a success clears the failure counter', async () => {
  for (let i = 0; i < 9; i++) await fail();
  await login(db, { email: 'ana@example.com', password: PASSWORD }, now);
  for (let i = 0; i < 9; i++) expect(await fail()).toMatchObject({ code: 'unauthorized' });
});

test('failures older than 15 minutes do not add up', async () => {
  for (let i = 0; i < 9; i++) await fail();
  expect(await fail('ana@example.com', minutes(20))).toMatchObject({ code: 'unauthorized' });
  expect(await fail('ana@example.com', minutes(21))).toMatchObject({ code: 'unauthorized' });
});

test('an unknown email is locked exactly like a real one', async () => {
  for (let i = 0; i < 10; i++) await fail('nobody@example.com');
  expect(await fail('nobody@example.com', minutes(1))).toMatchObject({ code: 'locked' });
});

test('a burst of parallel wrong guesses is cut off after 10 and the rest are locked', async () => {
  const results = await Promise.all(Array.from({ length: 30 }, () => fail()));
  expect(results.filter((r) => r.code === 'unauthorized')).toHaveLength(10);
  expect(results.filter((r) => r.code === 'locked')).toHaveLength(20);
});

test('a huge or NUL-containing email is a plain unauthorized, not a server error', async () => {
  expect(await fail('a'.repeat(3000) + '@example.com')).toMatchObject({ code: 'unauthorized' });
  expect(await fail('ana\u0000@example.com')).toMatchObject({ code: 'unauthorized' });
});

test('sessions expire after 30 days and logout ends them', async () => {
  const { token } = await login(db, { email: 'ana@example.com', password: PASSWORD }, now);
  expect(await sessionUser(db, token, days(29))).not.toBeNull();
  expect(await sessionUser(db, token, days(31))).toBeNull();
  await logout(db, token);
  expect(await sessionUser(db, token, now)).toBeNull();
  expect(await sessionUser(db, 'garbage', now)).toBeNull();
});
