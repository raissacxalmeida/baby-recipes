import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import {
  createInvite, getInvite, acceptInvite, listInvites, revokeInvite, createAdmin,
} from '../src/server/users.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());
beforeEach(() => db.reset());

const now = new Date('2026-10-15T12:00:00Z');
const days = (n) => new Date(now.getTime() + n * 86400000);
const PASSWORD = 'a long enough password';

test('invite then getInvite gives the normalised email', async () => {
  const { token } = await createInvite(db, ' Ana@Example.com ', now);
  expect(await getInvite(db, token, now)).toEqual({ email: 'ana@example.com' });
});

test('invalid email is invalid-input', async () => {
  await expect(createInvite(db, 'not-an-email', now)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('a second pending invite for the same email is a conflict, ignoring case', async () => {
  await createInvite(db, 'Ana@Example.com', now);
  await expect(createInvite(db, 'ana@example.com', now)).rejects.toMatchObject({ code: 'conflict' });
});

test('unknown and expired invites are not-found', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  await expect(getInvite(db, 'garbage', now)).rejects.toMatchObject({ code: 'not-found' });
  await expect(getInvite(db, token, days(8))).rejects.toMatchObject({ code: 'not-found' });
});

test('accept needs a 10 character password', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  await expect(acceptInvite(db, { token, password: '123456789' }, now)).rejects.toMatchObject({ code: 'invalid-input' });
});

test('accept creates a non-admin user and the invite works once', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  const user = await acceptInvite(db, { token, password: PASSWORD }, now);
  expect(user).toMatchObject({ email: 'ana@example.com', isAdmin: false });
  await expect(acceptInvite(db, { token, password: PASSWORD }, now)).rejects.toMatchObject({ code: 'not-found' });
});

test('two simultaneous accepts of one invite have exactly one winner', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  const results = await Promise.allSettled([
    acceptInvite(db, { token, password: PASSWORD }, now),
    acceptInvite(db, { token, password: PASSWORD }, now),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await db.query('select * from users')).rows).toHaveLength(1);
});

test('inviting an email that already has an account is a conflict', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  await acceptInvite(db, { token, password: PASSWORD }, now);
  await expect(createInvite(db, 'ana@example.com', now)).rejects.toMatchObject({ code: 'conflict' });
});

test('listInvites follows pending, expired and used', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  expect((await listInvites(db, now))[0]).toMatchObject({ email: 'ana@example.com', status: 'pending', daysLeft: 7 });
  expect((await listInvites(db, days(8)))[0]).toMatchObject({ status: 'expired', daysLeft: null });
  await acceptInvite(db, { token, password: PASSWORD }, now);
  expect((await listInvites(db, now))[0]).toMatchObject({ status: 'used' });
});

test('revokeInvite makes the link unusable and unknown ids are not-found', async () => {
  const { id, token } = await createInvite(db, 'ana@example.com', now);
  await revokeInvite(db, id);
  await expect(getInvite(db, token, now)).rejects.toMatchObject({ code: 'not-found' });
  await expect(revokeInvite(db, id)).rejects.toMatchObject({ code: 'not-found' });
  await expect(revokeInvite(db, 'not-a-uuid')).rejects.toMatchObject({ code: 'not-found' });
});

test('createAdmin makes an admin invite; a second admin is refused', async () => {
  const { kind, token } = await createAdmin(db, 'me@example.com', now);
  expect(kind).toBe('invite');
  const admin = await acceptInvite(db, { token, password: PASSWORD }, now);
  expect(admin.isAdmin).toBe(true);
  await expect(createAdmin(db, 'other@example.com', now)).rejects.toMatchObject({ code: 'conflict' });
});

test('normal invites never create an admin', async () => {
  const { token } = await createInvite(db, 'ana@example.com', now);
  expect((await acceptInvite(db, { token, password: PASSWORD }, now)).isAdmin).toBe(false);
});

test('nothing returned by the list leaks token hashes or passwords', async () => {
  await createInvite(db, 'ana@example.com', now);
  expect(JSON.stringify(await listInvites(db, now))).not.toMatch(/token|hash|password/i);
});
