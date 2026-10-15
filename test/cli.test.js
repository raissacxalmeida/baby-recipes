import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { runCli } from '../src/server/cli.js';
import { acceptInvite } from '../src/server/users.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());
beforeEach(() => db.reset());

const config = { publicUrl: 'http://my-mac.local:3000' };
const now = () => new Date('2026-10-15T12:00:00Z');
const run = async (argv) => {
  const lines = [];
  const code = await runCli(argv, { db, config, now, log: (l) => lines.push(l) });
  return { code, lines };
};

test('create-admin prints a one-time invite link that makes the admin', async () => {
  const { code, lines } = await run(['create-admin', 'me@example.com']);
  expect(code).toBe(0);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^http:\/\/my-mac\.local:3000\/invite\/[A-Za-z0-9_-]{43}$/);
  const user = await acceptInvite(db, { token: lines[0].split('/').pop(), password: 'a long enough password' }, now());
  expect(user.isAdmin).toBe(true);
});

test('the same email again prints a reset link', async () => {
  const first = await run(['create-admin', 'me@example.com']);
  await acceptInvite(db, { token: first.lines[0].split('/').pop(), password: 'a long enough password' }, now());
  const { code, lines } = await run(['create-admin', 'me@example.com']);
  expect(code).toBe(0);
  expect(lines[0]).toMatch(/\/reset\//);
});

test('another email once an admin exists exits 1 without printing a token', async () => {
  const first = await run(['create-admin', 'me@example.com']);
  await acceptInvite(db, { token: first.lines[0].split('/').pop(), password: 'a long enough password' }, now());
  const { code, lines } = await run(['create-admin', 'other@example.com']);
  expect(code).toBe(1);
  expect(lines.join('\n')).not.toMatch(/\/invite\/|\/reset\//);
});

test('a missing email or unknown command exits 1 with usage', async () => {
  expect((await run(['create-admin'])).code).toBe(1);
  const unknown = await run(['wat']);
  expect(unknown.code).toBe(1);
  expect(unknown.lines.join(' ')).toMatch(/create-admin/);
});
